import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// 1. Xác định đường dẫn tới file proto
const PROTO_PATH = path.resolve(__dirname, './Warehouse_management_simulation_Contracts/mes.proto');

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

    constructor(address: string = 'localhost:50051') {
        // Khởi tạo kết nối insecure (không TLS) tới server Python
        this.pathClient = new mesProto.PathfindingService(
            address,
            grpc.credentials.createInsecure()
        );
        this.slotClient = new mesProto.SlotAllocationService(
            address,
            grpc.credentials.createInsecure()
        );
    }

    /**
     * Gửi yêu cầu tính toán đường đi tới MES
     * @param warehouseId ID của kho hàng
     * @param start Tọa độ bắt đầu {x, y}
     * @param end Tọa độ đích {x, y}
     */
    public calculatePath(
        warehouseId: string, 
        start: { x: number; y: number }, 
        end: { x: number; y: number }
    ): Promise<{ waypoints: any[]; success: boolean; message: string }> {
        return new Promise((resolve, reject) => {
            const request = {
                warehouse_id: warehouseId,
                start: start,
                end: end
            };

            // Gọi hàm CalculatePath đã định nghĩa trong proto
            this.pathClient.CalculatePath(request, (error: any, response: any) => {
                if (error) {
                    return reject(error);
                }
                resolve(response);
            });
        });
    }

    /**
     * Xin cấp phát slot cho kiện hàng từ MES
     */
    public allocateSlot(
        warehouseId: string,
        itemId: string,
        length: number,
        width: number
    ): Promise<{ success: boolean; slot_id: string; message: string; error_code: string }> {
        return new Promise((resolve, reject) => {
            const request = {
                warehouse_id: warehouseId,
                item_id: itemId,
                length: length,
                width: width
            };

            this.slotClient.AllocateSlot(request, (error: any, response: any) => {
                if (error) {
                    return reject(error);
                }
                resolve(response);
            });
        });
    }
}
