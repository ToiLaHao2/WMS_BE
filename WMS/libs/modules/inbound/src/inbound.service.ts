import fetch from 'node-fetch';
import { InboundOrderStatus } from './inbound.model';
import type { CreateInboundOrderDTO, IInboundOrder } from './inbound.model';
import type { InboundOrderRepository, InboundOrderItemRepository } from './repositories/inbound.repository';
import type { MesGrpcClient } from '@core/contracts/mes-grpc.client';

import { cacheManager } from '@core/cache';
import { eventBus } from '@core/shared/src/in-memory-event-bus';

// Cổng và địa chỉ của Go AGV Control Service
const AGV_SERVICE_URL = process.env.AGV_SERVICE_URL || 'http://localhost:8081';

// Cổng WMS để Go báo ngược về
const WMS_CALLBACK_URL = process.env.WMS_BASE_URL || 'http://localhost:3000';



export class InboundService {
    private inboundOrderRepo: InboundOrderRepository;
    private inboundOrderItemRepo: InboundOrderItemRepository;
    private mesGrpcClient: MesGrpcClient;
    private systemQueue: any; // BullMQ Queue

    constructor({
        inboundOrderRepository,
        inboundOrderItemRepository,
        mesGrpcClient,
        systemQueue,
    }: {
        inboundOrderRepository: InboundOrderRepository;
        inboundOrderItemRepository: InboundOrderItemRepository;
        mesGrpcClient: MesGrpcClient;
        systemQueue: any;
    }) {
        this.inboundOrderRepo = inboundOrderRepository;
        this.inboundOrderItemRepo = inboundOrderItemRepository;
        this.mesGrpcClient = mesGrpcClient;
        this.systemQueue = systemQueue;
    }

    /**
     * Tạo lệnh nhập hàng: Xin slot MES, rồi xin Execution Plan và gửi sang Go
     */
    async createInboundOrder(dto: CreateInboundOrderDTO): Promise<any> {
        // 1. Tạo Inbound Order với trạng thái PENDING
        const order = await this.inboundOrderRepo.createOrder({
            warehouse_id: dto.warehouse_id,
            code: dto.code,
            status: InboundOrderStatus.PENDING,
        });

        // 2. Đẩy job vào Queue để Worker xử lý ngầm (Tránh Race Condition và timeout API)
        if (this.systemQueue) {
            await this.systemQueue.add('inbound-process', { orderId: order.id, dto });
            console.log(`[INBOUND] Đã đưa Inbound Order ${order.id} vào system-queue.`);
        } else {
            console.warn(`[INBOUND] systemQueue không tồn tại! Order ${order.id} sẽ bị treo ở trạng thái PENDING.`);
        }

        // 3. Trả về ngay lập tức để giải phóng API
        // Mảng allocated_slots trống vì chưa có slot nào được cấp ở thời điểm này (sẽ cập nhật qua Socket)
        return { order, allocated_slots: [] };
    }



    async getOrderById(id: string): Promise<any> {
        const order = await this.inboundOrderRepo.findById(id);
        if (!order) return null;
        const items = await this.inboundOrderItemRepo.getItemsByOrderId(id);
        return { ...order, items };
    }

    async getAllOrders(): Promise<IInboundOrder[]> {
        return this.inboundOrderRepo.getAllOrders();
    }

    /**
     * Nhận callback từ AGV Service khi xe đã cất hàng xong.
     */
    async completeInboundTask(orderId: string, agvId: string): Promise<any> {
        console.log(`[INBOUND] AGV ${agvId} bao cao da hoan thanh InboundOrder: ${orderId}`);
        
        // 1. Cập nhật trạng thái Order thành COMPLETED
        await this.inboundOrderRepo.updateOrderStatus(orderId, InboundOrderStatus.COMPLETED);

        // 2. Lấy các items trong order để cập nhật vào Inventory
        const items = await this.inboundOrderItemRepo.getItemsByOrderId(orderId);
        
        const order = await this.inboundOrderRepo.findById(orderId);
        
        if (order) {
            const slotIds = items.map((i: any) => i.assigned_slot_id).filter((id: string) => id);
            if (slotIds.length > 0) {
                // Phóng Event để Master-Data lo việc update slot
                eventBus.publish('SLOTS_OCCUPIED', {
                    warehouseId: (order as any).warehouse_id,
                    slotIds
                });
            }
        }

        // 4 & 5. Phát sự kiện AGV_TASK_COMPLETED để module AGV tự xử lý
        eventBus.publish('AGV_TASK_COMPLETED', {
            agvId,
            warehouseId: order ? (order as any).warehouse_id : null
        });

        console.log(`[INBOUND] Đã phát sự kiện AGV_TASK_COMPLETED cho AGV ${agvId}.`);

        return { success: true, message: 'Inbound task completed successfully' };
    }

}
