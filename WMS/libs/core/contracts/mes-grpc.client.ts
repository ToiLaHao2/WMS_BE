import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// 1. Xác định đường dẫn tới file proto
const PROTO_PATH = path.resolve(__dirname, './WMS_Contracts/mes.proto');

// 2. Cấu hình Load Proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

// 3. Load định nghĩa service từ package 'mes'
const mesProto = (grpc.loadPackageDefinition(packageDefinition) as any).mes;

/**
 * gRPC Client để giao tiếp với dịch vụ MES (Python)
 */
export class MesGrpcClient {
    private pathClient: any;
    private slotClient: any;
    private dispatchClient: any;

    constructor(address: string = process.env.MES_GRPC_URL || 'localhost:50051') {
        this.pathClient = new mesProto.PathfindingService(
            address,
            grpc.credentials.createInsecure()
        );
        this.slotClient = new mesProto.SlotAllocationService(
            address,
            grpc.credentials.createInsecure()
        );
        this.dispatchClient = new mesProto.DispatchService(
            address,
            grpc.credentials.createInsecure()
        );
    }

    /** Tạo deadline gRPC (tránh treo vĩnh viễn nếu MES không respond) */
    private getDeadline(timeoutMs: number = 10000): grpc.Deadline {
        return new Date(Date.now() + timeoutMs);
    }

    public calculatePath(
        warehouseId: string,
        start: { x: number; y: number },
        end: { x: number; y: number }
    ): Promise<{ waypoints: any[]; success: boolean; message: string }> {
        return new Promise((resolve, reject) => {
            this.pathClient.CalculatePath(
                { warehouse_id: warehouseId, start, end },
                { deadline: this.getDeadline() },
                (error: any, response: any) => {
                    if (error) return reject(error);
                    resolve(response);
                }
            );
        });
    }

    public allocateSlot(
        warehouseId: string,
        itemId: string,
        length: number,
        width: number
    ): Promise<{ success: boolean; slot_id: string; message: string; error_code: string }> {
        return new Promise((resolve, reject) => {
            this.slotClient.AllocateSlot(
                { warehouse_id: warehouseId, item_id: itemId, length, width },
                { deadline: this.getDeadline() },
                (error: any, response: any) => {
                    if (error) return reject(error);
                    resolve(response);
                }
            );
        });
    }

    public freeSlot(
        warehouseId: string,
        slotId: string
    ): Promise<{ success: boolean; message: string }> {
        return new Promise((resolve, reject) => {
            this.slotClient.FreeSlot(
                { warehouse_id: warehouseId, slot_id: slotId },
                { deadline: this.getDeadline() },
                (error: any, response: any) => {
                    if (error) return reject(error);
                    resolve(response);
                }
            );
        });
    }

    /**
     * Gửi yêu cầu lập kế hoạch chạy (Execution Plan) cho AGV tới MES.
     * MES sẽ chạy A* và trả về chuỗi Waypoints đầy đủ.
     */
    public dispatchAGV(params: {
        warehouseId: string;
        inboundOrderId: string;
        agvPosition: { x: number; y: number };
        pickupPoint: { x: number; y: number };
        slotPosition: { x: number; y: number };
        agvId: string;
    }): Promise<{ success: boolean; message: string; waypoints: any[] }> {
        return new Promise((resolve, reject) => {
            const request = {
                warehouse_id: params.warehouseId,
                inbound_order_id: params.inboundOrderId,
                agv_position: params.agvPosition,
                pickup_point: params.pickupPoint,
                slot_position: params.slotPosition,
                agv_id: params.agvId,
            };
            this.dispatchClient.DispatchAGV(request, { deadline: this.getDeadline() }, (error: any, response: any) => {
                if (error) return reject(error);
                resolve(response);
            });
        });
    }

    public replanAGV(params: {
        agvId: string;
        warehouseId: string;
        currentPosition: { x: number; y: number };
        milestones: any[];
        obstacles?: any[];
    }): Promise<{ success: boolean; message: string; waypoints: any[] }> {
        return new Promise((resolve, reject) => {
            const request = {
                agv_id: params.agvId,
                warehouse_id: params.warehouseId,
                current_position: params.currentPosition,
                milestones: params.milestones,
                obstacles: params.obstacles || [],
            };
            this.dispatchClient.ReplanAGV(request, { deadline: this.getDeadline() }, (error: any, response: any) => {
                if (error) return reject(error);
                resolve(response);
            });
        });
    }
}

