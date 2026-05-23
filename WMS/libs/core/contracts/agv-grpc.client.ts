import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Xác định đường dẫn tới file proto của AGV
const PROTO_PATH = path.resolve(__dirname, './WMS_Contracts/agv.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const agvProto = (grpc.loadPackageDefinition(packageDefinition) as any).agv;

export class AgvGrpcClient {
    private client: any;

    constructor(address: string = process.env.AGV_GRPC_URL || 'localhost:50052') {
        this.client = new agvProto.AGVControlService(
            address,
            grpc.credentials.createInsecure()
        );
    }

    async executePlan(
        agvId: string,
        inboundOrderId: string,
        wmsCallbackUrl: string,
        waypoints: any[]
    ): Promise<{ status: string; agv_id: string; steps: number }> {
        return new Promise((resolve, reject) => {
            const request = {
                agv_id: agvId,
                inbound_order_id: inboundOrderId,
                wms_callback_url: wmsCallbackUrl,
                waypoints: waypoints.map(wp => ({
                    position: { x: wp.position?.x ?? wp.x, y: wp.position?.y ?? wp.y },
                    action: typeof wp.action === 'number' ? this.mapAction(wp.action) : (wp.action || 'MOVE')
                }))
            };

            this.client.ExecutePlan(request, (err: any, response: any) => {
                if (err) {
                    return reject(err);
                }
                resolve(response);
            });
        });
    }

    private mapAction(action: number): string {
        const actionMap: Record<number, string> = { 0: 'MOVE', 1: 'PICK_UP', 2: 'DROP_OFF' };
        return actionMap[action] || 'MOVE';
    }
}
