import { Job } from 'bullmq';
import { container } from '@core/container';
import { InboundOrderStatus } from '../../../../libs/modules/inbound/src/inbound.model';
import fetch from 'node-fetch';

export default async function processInboundOrder(job: Job) {
    const { orderId, dto } = job.data;
    console.log(`[WORKER] Bắt đầu xử lý Inbound Order: ${orderId}`);

    // Resolve dependencies from Awilix container
    const productRepo = container.resolve('productRepository');
    const inboundOrderItemRepo = container.resolve('inboundOrderItemRepository');
    const inboundOrderRepo = container.resolve('inboundOrderRepository');
    const warehouseSlotRepo = container.resolve('warehouseSlotRepository');
    const agvRepo = container.resolve('agvRepository');
    const mesGrpcClient = container.resolve('mesGrpcClient');
    const cacheManager = container.resolve('cache');

    let allAllocated = true;
    const allocatedSlots: any[] = [];

    // Helper functions (duplicated from InboundService for simplicity in worker, or we could resolve inboundService and expose methods)
    const syncSlotsToRedis = async (warehouseId: string) => {
        const slots = await warehouseSlotRepo.findByWarehouseId(warehouseId);
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
        const allSlots = await warehouseSlotRepo.findByWarehouseId(warehouseId);
        const pickupSlot = allSlots.find((s: any) => s.slot_type === 'PICKUP');
        const agvSlot = allSlots.find((s: any) => s.slot_type === 'CHARGING_DOCK');
        return {
            pickupPoint: pickupSlot ? { x: Math.round(Number((pickupSlot as any).x)), y: Math.round(Number((pickupSlot as any).y)) } : { x: 1, y: 1 },
            agvPosition: agvSlot ? { x: Math.round(Number((agvSlot as any).x)), y: Math.round(Number((agvSlot as any).y)) } : { x: 0, y: 0 }
        };
    };

    const getAvailableAgv = async (warehouseId: string) => {
        const agvs = await agvRepo.findByWarehouse(warehouseId);
        for (const agv of agvs) {
            const cachedStatus = await cacheManager.get(`agv_status:${agv.id}`);
            const status = cachedStatus || agv.status;
            if (status === 'IDLE' || status === 'CHARGING') return agv;
        }
        return null;
    };

    const sendPlanToGo = async (orderId: string, agvId: string, waypoints: any[]) => {
        const agvGrpcClient = container.resolve('agvGrpcClient');
        const wmsCallbackUrl = process.env.WMS_CALLBACK_URL || 'http://host.docker.internal:3000/api/inbound/agv-complete';
        
        await agvGrpcClient.executePlan(
            agvId,
            orderId,
            wmsCallbackUrl,
            waypoints
        );
    };

    // Process items
    for (const item of dto.items) {
        let product = null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(item.product_id)) {
            product = await productRepo.findById(item.product_id);
        } else {
            product = await productRepo.findByCode(item.product_id);
        }
        
        if (!product) {
            console.error(`[WORKER] Product not found: ${item.product_id}`);
            allAllocated = false;
            continue;
        }
        const productId = (product as any).id;

        try {
            // === BƯỚC A: Xin cấp Slot từ MES (Kèm retry chống lock tồn dư từ lần crash trước) ===
            let slotResult: any;
            let retries = 5;
            
            while (retries > 0) {
                slotResult = await mesGrpcClient.allocateSlot(
                    dto.warehouse_id,
                    item.product_id,
                    Number(product.width),
                    Number(product.height)
                );

                if (slotResult.success && slotResult.slot_id) break;
                
                if (slotResult.error_code === 'RACE_CONDITION_RETRY') {
                    console.log(`[WORKER] Bị dính lock (có thể do lỗi tồn dư), thử lại sau 1s... (Còn ${retries - 1} lần thử)`);
                    await new Promise(res => setTimeout(res, 1000));
                    retries--;
                } else {
                    break;
                }
            }

            if (!slotResult.success || !slotResult.slot_id) {
                console.warn(`[WORKER] Không cấp được slot: ${slotResult.message}`);
                await inboundOrderItemRepo.createItem({
                    inbound_order_id: orderId,
                    product_id: productId,
                    assigned_slot_id: null,
                    quantity: item.quantity,
                });
                allAllocated = false;
                
                // Ném lỗi để BullMQ retry job (hoặc bạn có thể cho fail luôn)
                // throw new Error(`Không đủ slot cho item ${item.product_id}`);
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

            await warehouseSlotRepo.updateSlot(slotResult.slot_id, {
                status: 'RESERVED',
            });

            // Re-sync slot data lên Redis cho MES cập nhật trạng thái mới
            await syncSlotsToRedis(dto.warehouse_id);

            // === BƯỚC B: Lấy tọa độ Slot để gửi cho MES (Dispatch) ===
            const slot = await warehouseSlotRepo.findById(slotResult.slot_id);
            const slotPosition = slot
                ? { x: Math.round(Number((slot as any).x)), y: Math.round(Number((slot as any).y)) }
                : { x: 0, y: 0 };

            // === BƯỚC C: Lấy AGV rảnh từ Redis ===
            let idleAgv = null;
            let waitAgvRetries = 10;
            while (waitAgvRetries > 0) {
                idleAgv = await getAvailableAgv(dto.warehouse_id);
                if (idleAgv) break;
                console.log(`[WORKER] Chưa có AGV rảnh. Đợi 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                waitAgvRetries--;
            }

            if (!idleAgv) {
                console.warn(`[WORKER] Không có xe AGV nào rảnh rỗi sau khi chờ. Worker sẽ Fail Job này để thử lại sau.`);
                throw new Error("Timeout waiting for AGV");
            }
            
            const targetAgvId = idleAgv.id;
            
            // Lấy tọa độ AGV thực tế
            const agvPosition = { x: Math.round(Number(idleAgv.current_x || 1)), y: Math.round(Number(idleAgv.current_y || 1)) };

            // === BƯỚC D: Lấy tọa độ thực tế của Pickup từ DB ===
            const { pickupPoint: defaultPickup } = await getPickupAndAGVPosition(dto.warehouse_id);
            const pickupPoint = (item.pickup_x !== undefined && item.pickup_y !== undefined) 
                ? { x: item.pickup_x, y: item.pickup_y } 
                : defaultPickup;

            console.log(`[WORKER] Pickup: (${pickupPoint.x},${pickupPoint.y}) | AGV: (${agvPosition.x},${agvPosition.y}) | Slot: (${slotPosition.x},${slotPosition.y})`);

            allocatedSlots.push({ slot_id: slotResult.slot_id, x: slotPosition.x, y: slotPosition.y });

            // === BƯỚC D: Gọi MES xin Execution Plan ===
            console.log(`[WORKER] Xin Execution Plan từ MES...`);
            const dispatchResult = await mesGrpcClient.dispatchAGV({
                warehouseId: dto.warehouse_id,
                inboundOrderId: orderId,
                agvPosition,
                pickupPoint,
                slotPosition,
            });

            if (!dispatchResult.success) {
                console.warn(`[WORKER] MES không tạo được Execution Plan: ${dispatchResult.message}`);
                continue;
            }

            console.log(`[WORKER] Execution Plan: ${dispatchResult.waypoints.length} buoc. Gui sang Go...`);

            // === KHOÁ AGV NGAY LẬP TỨC TRÊN REDIS (BUSY) ===
            await cacheManager.set(`agv_status:${targetAgvId}`, 'BUSY', 86400);
            await agvRepo.updateStatus(targetAgvId, 'BUSY');

            // === BƯỚC E: Gửi Execution Plan sang Go AGV Control ===
            await sendPlanToGo(orderId, targetAgvId, dispatchResult.waypoints);
            
            // Bắn WebSocket (thông qua Redis PubSub) để Frontend đổi màu kệ hàng
            const { Emitter } = require('@socket.io/redis-emitter');
            const redisClient = cacheManager.getRedisClient();
            if (redisClient) {
                const io = new Emitter(redisClient);
                io.emit('slot_allocated', {
                    order_id: orderId,
                    slots: [{ slot_id: slotResult.slot_id, x: slotPosition.x, y: slotPosition.y }]
                });
                console.log(`[WORKER] Bắn event slot_allocated qua Redis Pub/Sub`);
            }

        } catch (error: any) {
            console.error(`[WORKER] Lỗi xử lý item: ${error.message}`);
            // Nếu lỗi do thiếu AGV hoặc đứt kết nối, ta throw error để BullMQ tự retry Job
            throw error;
        }
    }

    // 3. Cập nhật trạng thái Order
    const finalStatus = allAllocated ? InboundOrderStatus.ALLOCATED : InboundOrderStatus.FAILED;
    await inboundOrderRepo.updateOrderStatus(orderId, finalStatus);
    
    console.log(`[WORKER] Đã hoàn thành Inbound Order: ${orderId}`);
    return { success: true, allocated_slots: allocatedSlots };
}
