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

let wmsServerInstance: grpc.Server;

export function startWmsGrpcServer(port: number = 50053) {
    console.log('[gRPC Server] Khởi tạo WMS gRPC Server...');
    console.log('[gRPC Server] Các keys trong packageDefinition:', Object.keys(packageDefinition));
    console.log('[gRPC Server] Các keys trong wmsProto.WMSService:', wmsProto && wmsProto.WMSService ? Object.keys(wmsProto.WMSService) : 'undefined');
    wmsServerInstance = new grpc.Server();

    wmsServerInstance.addService(wmsProto.WMSService.service, {
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
        RequestReplan: async (call: any, callback: any) => {
            const req = call.request;
            console.log(`[gRPC Server] Nhận yêu cầu Replan từ AGV: ${req.agv_id}`);

            try {
                // Get mesGrpcClient from Awilix container
                const mesGrpcClient: any = container.resolve('mesGrpcClient');
                
                // Call replanAGV on MES
                const replanResult = await mesGrpcClient.replanAGV({
                    agvId: req.agv_id,
                    warehouseId: req.warehouse_id,
                    currentPosition: req.current_position,
                    milestones: req.milestones,
                    obstacles: req.obstacles
                });

                if (!replanResult.success) {
                    callback(null, { success: false, message: replanResult.message, waypoints: [] });
                    return;
                }

                // Trả về waypoints mới cho Go
                callback(null, { 
                    success: true, 
                    message: 'Replan successful', 
                    waypoints: replanResult.waypoints 
                });
            } catch (error: any) {
                console.error(`[gRPC Server] Lỗi xử lý RequestReplan:`, error.message);
                callback(null, { success: false, message: error.message, waypoints: [] });
            }
        },
    });

    wmsServerInstance.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
        if (err) {
            console.error('[gRPC Server] Không thể khởi động gRPC server:', err);
            return;
        }
        wmsServerInstance.start();
        console.log(`🚀 [gRPC Server] WMS gRPC Server đang chạy tại port ${boundPort}`);
    });
}
