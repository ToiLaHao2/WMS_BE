import { cacheManager } from '@core/cache';
import { MesGrpcClient } from '@core/contracts/mes-grpc.client';
import { AgvGrpcClient } from '@core/contracts/agv-grpc.client';
import { AGVRepository } from './repositories/agv.repository';
import { eventBus } from '@core/shared/src/in-memory-event-bus';

export class AgvDispatcherService {
    private mesGrpcClient: MesGrpcClient;
    private agvGrpcClient: AgvGrpcClient;
    private agvRepo: AGVRepository;


    constructor(opts: {
        mesGrpcClient: MesGrpcClient;
        agvGrpcClient: AgvGrpcClient;
        agvRepository: AGVRepository;

    }) {
        this.mesGrpcClient = opts.mesGrpcClient;
        this.agvGrpcClient = opts.agvGrpcClient;
        this.agvRepo = opts.agvRepository;

    }

    async getAvailableAgv(warehouseId: string) {
        const agvs = await this.agvRepo.findByWarehouse(warehouseId);
        for (const agv of agvs) {
            const cachedStatus = await cacheManager.get(`agv_status:${agv.id}`);
            const status = cachedStatus || agv.status;
            if (status === 'IDLE' || status === 'CHARGING') return agv;
        }
        return null;
    }

    async dispatchAgv(warehouseId: string): Promise<void> {
        const redisClient = cacheManager.getRedisClient();
        if (!redisClient) return;

        // 1. Thử lấy xe rảnh
        const idleAgv = await this.getAvailableAgv(warehouseId);
        if (!idleAgv) {
            console.log(`[DISPATCHER] Không có AGV rảnh tại kho ${warehouseId}. Dừng dispatch.`);
            return;
        }

        // 2. Lấy Task cũ nhất từ Redis (LPOP)
        const taskStr = await redisClient.lpop(`pending_tasks:${warehouseId}`);
        if (!taskStr) {
            // Không log để tránh spam khi queue rỗng
            return; 
        }

        const task = JSON.parse(taskStr);
        const { orderId, pickupPoint, slotPosition } = task;

        const targetAgvId = idleAgv.id;
        const agvPosition = { 
            x: Math.round(Number(idleAgv.current_x || 1)), 
            y: Math.round(Number(idleAgv.current_y || 1)) 
        };

        // 3. Khóa AGV thành BUSY
        await cacheManager.set(`agv_status:${targetAgvId}`, 'BUSY', 86400);
        await this.agvRepo.updateStatus(targetAgvId, 'BUSY');

        console.log(`[DISPATCHER] Lấy task ${orderId}. Giao cho AGV: ${targetAgvId}`);

        // 4. Xin Execution Plan từ MES
        try {
            const dispatchResult = await this.mesGrpcClient.dispatchAGV({
                warehouseId,
                inboundOrderId: orderId,
                agvPosition,
                pickupPoint,
                slotPosition,
                agvId: targetAgvId,
            });

            if (!dispatchResult.success) {
                throw new Error(dispatchResult.message);
            }

            // 5. Gửi lệnh sang Go AGV
            const wmsGrpcUrl = process.env.WMS_GRPC_URL || 'erp-backend:50053';
            await this.agvGrpcClient.executePlan(
                targetAgvId,
                orderId,
                wmsGrpcUrl,
                dispatchResult.waypoints
            );

            console.log(`[DISPATCHER] Đã phái xe ${targetAgvId} đi làm đơn ${orderId} thành công.`);
            
            // Xong, nếu trong hàng đợi CÒN NHIỆM VỤ, và còn xe rảnh khác, ta gọi đệ quy để dispatch nốt!
            await this.dispatchAgv(warehouseId);

        } catch (err: any) {
            console.error(`[DISPATCHER] Lỗi dispatch đơn ${orderId}: ${err.message}`);
            // Đánh dấu Inbound Order thất bại
            eventBus.publish('INBOUND_ORDER_FAILED', { orderId, reason: err.message });
            
            // Nhả AGV về lại IDLE vì nó chưa kịp làm gì
            await cacheManager.set(`agv_status:${targetAgvId}`, 'IDLE', 86400);
            await this.agvRepo.updateStatus(targetAgvId, 'IDLE');

            // AGV lại rảnh rỗi, có thể xử lý Task tiếp theo (task bị lỗi kia đã bị ném đi)
            await this.dispatchAgv(warehouseId);
        }
    }

    async markAgvIdle(agvId: string): Promise<void> {
        await cacheManager.set(`agv_status:${agvId}`, 'IDLE', 86400);
        await this.agvRepo.updateStatus(agvId, 'IDLE');
    }

    async createInitialAGVs(warehouseId: string, warehouseCode: string, initialAgvCount: number, chargingSlots: any[]): Promise<void> {
        const agvToCreate = Math.min(initialAgvCount, chargingSlots.length);
        
        for (let i = 0; i < agvToCreate; i++) {
            const slot = chargingSlots[i];
            
            // Re-using the standard create method (which doesn't require a client)
            // Wait, does agvRepo have a non-client create method? Let's assume yes or use direct DB if needed.
            // Let's create an AGV using the pool (not a transaction client).
            // Usually repos have `create` method.
            await this.agvRepo.createAGVWithClient(null, {
                code: `AGV-${warehouseCode}-${(i + 1).toString().padStart(3, '0')}`,
                warehouse_id: warehouseId,
                model: 'STANDARD-X1',
                max_weight: 500,
                battery_capacity: 100,
                current_x: slot.x,
                current_y: slot.y
            });
        }
        console.log(`🤖 Spawned ${agvToCreate} AGVs for warehouse ${warehouseCode}`);
    }

    async getAGVsByWarehouse(warehouseId: string): Promise<any> {
        return this.agvRepo.findByWarehouse(warehouseId);
    }
}
