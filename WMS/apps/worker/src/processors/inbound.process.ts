import { Job } from 'bullmq';
import { container } from '@core/container';
import { InboundOrderStatus } from '../../../../libs/modules/inbound/src/inbound.model';
import { eventBus } from '../../../../libs/core/shared/src/in-memory-event-bus';
import fetch from 'node-fetch';

export default async function processInboundOrder(job: Job) {
    const { orderId, dto } = job.data;
    console.log(`[WORKER] Bắt đầu xử lý Inbound Order: ${orderId}`);

    // Resolve dependencies from Awilix container
    const inboundOrderItemRepo = container.resolve('inboundOrderItemRepository');
    const inboundOrderRepo = container.resolve('inboundOrderRepository');
    const masterDataService = container.resolve('masterDataService');
    const mesGrpcClient = container.resolve('mesGrpcClient');
    const cacheManager = container.resolve('cache');

    let allAllocated = true;
    const allocatedSlots: any[] = [];

    // Helper functions (duplicated from InboundService for simplicity in worker, or we could resolve inboundService and expose methods)
    const syncSlotsToRedis = async (warehouseId: string) => {
        const slots = await masterDataService.getSlotsByWarehouseId(warehouseId);
        const mappedSlots = slots.map((s: any) => ({
            slot_id: s.id,
            warehouse_id: s.warehouse_id,
            x: s.x,
            y: s.y,
            z: s.z,
            status: s.status,
            max_weight: s.max_weight,
            max_length: s.max_length,
            max_width: s.max_width,
            max_height: s.max_height,
            is_occupied: s.status !== 'AVAILABLE',
            slot_type: s.slot_type
        }));
        await cacheManager.set(`warehouse:${warehouseId}:slots`, JSON.stringify(mappedSlots));
    };

    const getPickupAndAGVPosition = async (warehouseId: string) => {
        const allSlots = await masterDataService.getSlotsByWarehouseId(warehouseId);
        const pickupSlot = allSlots.find((s: any) => s.slot_type === 'PICKUP');
        const agvSlot = allSlots.find((s: any) => s.slot_type === 'CHARGING_DOCK');
        return {
            pickupPoint: pickupSlot ? { x: Math.round(Number((pickupSlot as any).x)), y: Math.round(Number((pickupSlot as any).y)) } : { x: 1, y: 1 },
            agvPosition: agvSlot ? { x: Math.round(Number((agvSlot as any).x)), y: Math.round(Number((agvSlot as any).y)) } : { x: 0, y: 0 }
        };
    };

    const getAvailableAgv = async (warehouseId: string) => {
        // Obsolete
        return null;
    };

    const sendPlanToGo = async (orderId: string, agvId: string, waypoints: any[]) => {
        // Obsolete
    };

    // Process items
    for (const item of dto.items) {
        let product = null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(item.product_id)) {
            product = await masterDataService.getProductById(item.product_id);
        } else {
            product = await masterDataService.getProductByCode(item.product_id);
        }
        
        if (!product) {
            console.error(`[WORKER] Product not found: ${item.product_id}`);
            allAllocated = false;
            continue;
        }
        const productId = (product as any).id;

        try {
            // === BƯỚC A: Xin cấp Slot từ MES ===
            const slotResult = await mesGrpcClient.allocateSlot(
                dto.warehouse_id,
                item.product_id,
                Number(product.width),
                Number(product.height)
            );

            if (!slotResult.success || !slotResult.slot_id) {
                console.warn(`[WORKER] Không cấp được slot: ${slotResult.message}`);
                await inboundOrderItemRepo.createItem({
                    inbound_order_id: orderId,
                    product_id: productId,
                    assigned_slot_id: null,
                    quantity: item.quantity,
                });
                allAllocated = false;
                continue; 
            }

            console.log(`[WORKER] Slot OK: ${slotResult.slot_id}`);

            // Lưu item và chuyển Slot thành RESERVED
            await inboundOrderItemRepo.createItem({
                inbound_order_id: orderId,
                product_id: productId,
                assigned_slot_id: slotResult.slot_id,
                quantity: item.quantity,
            });

            await masterDataService.updateSlot(slotResult.slot_id, {
                status: 'RESERVED',
            });

            // Re-sync slot data lên Redis cho MES cập nhật trạng thái mới
            await syncSlotsToRedis(dto.warehouse_id);

            // === BƯỚC B: Lấy tọa độ Slot để gửi cho MES (Dispatch) ===
            const slot = await masterDataService.getSlotById(slotResult.slot_id);
            const slotPosition = slot
                ? { x: Math.round(Number((slot as any).x)), y: Math.round(Number((slot as any).y)) }
                : { x: 0, y: 0 };

            // === BƯỚC C: Lấy tọa độ thực tế của Pickup từ DB ===
            const { pickupPoint: defaultPickup } = await getPickupAndAGVPosition(dto.warehouse_id);
            const pickupPoint = (item.pickup_x !== undefined && item.pickup_y !== undefined) 
                ? { x: item.pickup_x, y: item.pickup_y } 
                : defaultPickup;

            console.log(`[WORKER] Order ${orderId} - Pickup: (${pickupPoint.x},${pickupPoint.y}) | Slot: (${slotPosition.x},${slotPosition.y})`);

            allocatedSlots.push({ slot_id: slotResult.slot_id, x: slotPosition.x, y: slotPosition.y });

            // === BƯỚC D: Đẩy Nhiệm vụ vào Redis Queue ===
            const redisClient = cacheManager.getRedisClient();
            if (redisClient) {
                const taskPayload = {
                    orderId,
                    warehouseId: dto.warehouse_id,
                    slotId: slotResult.slot_id,
                    pickupPoint,
                    slotPosition
                };
                await redisClient.rpush(`pending_tasks:${dto.warehouse_id}`, JSON.stringify(taskPayload));
                console.log(`[WORKER] Đã thêm Task vào hàng đợi Redis (pending_tasks:${dto.warehouse_id})`);
            }
            
            // Bắn WebSocket (thông qua Redis PubSub) để Frontend cập nhật Package và đổi màu kệ hàng
            const eventPublisher = container.resolve<any>('eventPublisher');
            
            // Broadcast cho tất cả user đang ở trong kho này biết có hàng mới ở bến
            eventPublisher.emitToWarehouse(dto.warehouse_id, 'inbound_created', {
                id: `PKG-${orderId}`,
                x: pickupPoint.x,
                y: pickupPoint.y,
                code: item.product_id
            });

            // Broadcast slot_allocated
            eventPublisher.emitToWarehouse(dto.warehouse_id, 'slot_allocated', {
                order_id: orderId,
                slots: [{ slot_id: slotResult.slot_id, x: slotPosition.x, y: slotPosition.y }]
            });
            console.log(`[WORKER] Bắn event inbound_created & slot_allocated qua Redis Pub/Sub cho kho ${dto.warehouse_id}`);

        } catch (error: any) {
            console.error(`[WORKER] Lỗi xử lý item: ${error.message}`);
            throw error;
        }
    }

    // 3. Cập nhật trạng thái Order
    const finalStatus = allAllocated ? InboundOrderStatus.ALLOCATED : InboundOrderStatus.FAILED;
    await inboundOrderRepo.updateOrderStatus(orderId, finalStatus);
    
    // 4. Kích hoạt Dispatcher qua Event Bus
    eventBus.publish('NEW_AGV_TASK_ADDED', { warehouseId: dto.warehouse_id });

    console.log(`[WORKER] Đã hoàn thành Inbound Order: ${orderId}`);
    return { success: true, allocated_slots: allocatedSlots };
}
