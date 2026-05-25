import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { container } from '@core/container';

const PROTO_PATH = path.resolve(__dirname, '../../../libs/core/contracts/WMS_Contracts/wms.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const wmsProto = (grpc.loadPackageDefinition(packageDefinition) as any).wms;

export function startWmsGrpcServer(port: number = 50053) {
    const server = new grpc.Server();

    server.addService(wmsProto.WMSService.service, {
        ReportAGVTaskCompleted: async (call: any, callback: any) => {
            const req = call.request;
            console.log(`[gRPC Server] Nhận callback hoàn thành AGV task từ xe: ${req.agv_id}`);

            try {
                // Get inboundService from Awilix container
                const inboundService: any = container.resolve('inboundService');
                
                // completeInboundTask(orderId: string, agvId: string)
                await inboundService.completeInboundTask(req.inbound_order_id, req.agv_id);

                callback(null, { success: true, message: 'WMS updated successfully' });
            } catch (error: any) {
                console.error(`[gRPC Server] Lỗi xử lý ReportAGVTaskCompleted:`, error.message);
                callback(null, { success: false, message: error.message });
            }
        },
    });

    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
        if (err) {
            console.error('[gRPC Server] Không thể khởi động gRPC server:', err);
            return;
        }
        console.log(`🚀 [gRPC Server] WMS gRPC Server đang chạy tại port ${boundPort}`);
    });
}
