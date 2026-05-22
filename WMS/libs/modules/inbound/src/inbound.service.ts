import fetch from 'node-fetch';
import { InboundOrderStatus } from './inbound.model';
import type { CreateInboundOrderDTO, IInboundOrder } from './inbound.model';
import type { InboundOrderRepository, InboundOrderItemRepository } from './repositories/inbound.repository';
import type { ProductRepository } from '../../master-data/src/repositories/product.repository';
import type { WarehouseSlotRepository } from '../../master-data/src/repositories/warehouse-slot.repository';
import type { AGVRepository } from '../../master-data/src/repositories/agv.repository';
import type { MesGrpcClient } from '@core/contracts/mes-grpc.client';
import { SlotStatus } from '../../master-data/src/master-data.model';
import { cacheManager } from '@core/cache';

// Cổng và địa chỉ của Go AGV Control Service
const AGV_SERVICE_URL = process.env.AGV_SERVICE_URL || 'http://localhost:8081';

// Cổng WMS để Go báo ngược về
const WMS_CALLBACK_URL = process.env.WMS_BASE_URL || 'http://localhost:3000';



export class InboundService {
    private inboundOrderRepo: InboundOrderRepository;
    private inboundOrderItemRepo: InboundOrderItemRepository;
    private productRepo: ProductRepository;
    private warehouseSlotRepo: WarehouseSlotRepository;
    private agvRepo: AGVRepository;
    private mesGrpcClient: MesGrpcClient;

    constructor({
        inboundOrderRepository,
        inboundOrderItemRepository,
        productRepository,
        warehouseSlotRepository,
        agvRepository,
        mesGrpcClient,
    }: {
        inboundOrderRepository: InboundOrderRepository;
        inboundOrderItemRepository: InboundOrderItemRepository;
        productRepository: ProductRepository;
        warehouseSlotRepository: WarehouseSlotRepository;
        agvRepository: AGVRepository;
        mesGrpcClient: MesGrpcClient;
    }) {
        this.inboundOrderRepo = inboundOrderRepository;
        this.inboundOrderItemRepo = inboundOrderItemRepository;
        this.productRepo = productRepository;
        this.warehouseSlotRepo = warehouseSlotRepository;
        this.agvRepo = agvRepository;
        this.mesGrpcClient = mesGrpcClient;
    }

    /**
     * Tạo lệnh nhập hàng: Xin slot MES, rồi xin Execution Plan và gửi sang Go
     */
    async createInboundOrder(dto: CreateInboundOrderDTO): Promise<IInboundOrder> {
        // 1. Tạo Inbound Order với trạng thái PENDING
        const order = await this.inboundOrderRepo.createOrder({
            warehouse_id: dto.warehouse_id,
            code: dto.code,
            status: InboundOrderStatus.PENDING,
        });

        let allAllocated = true;

        // 2. Xử lý từng item trong order
        for (const item of dto.items) {
            // Hỗ trợ tìm product bằng UUID hoặc bằng code
            let product = null;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(item.product_id)) {
                product = await this.productRepo.findById(item.product_id);
            }
            if (!product) {
                product = await this.productRepo.findByCode(item.product_id);
            }
            if (!product) {
                console.error(`[INBOUND] Product not found: ${item.product_id}`);
                allAllocated = false;
                continue;
            }
            const productId = (product as any).id;

            try {
                // === BƯỚC A: Xin cấp Slot từ MES ===
                const slotResult = await this.mesGrpcClient.allocateSlot(
                    dto.warehouse_id,
                    item.product_id,
                    Number(product.width),
                    Number(product.height)
                );

                if (!slotResult.success || !slotResult.slot_id) {
                    console.warn(`[INBOUND] Không cấp được slot: ${slotResult.message}`);
                    await this.inboundOrderItemRepo.createItem({
                        inbound_order_id: order.id,
                        product_id: productId,
                        assigned_slot_id: null,
                        quantity: item.quantity,
                    });
                    allAllocated = false;
                    continue;
                }

                console.log(`[INBOUND] Slot OK: ${slotResult.slot_id}`);

                // Lưu item và chuyển Slot thành RESERVED
                await this.inboundOrderItemRepo.createItem({
                    inbound_order_id: order.id,
                    product_id: productId,
                    assigned_slot_id: slotResult.slot_id,
                    quantity: item.quantity,
                });
                await this.warehouseSlotRepo.updateSlot(slotResult.slot_id, {
                    status: SlotStatus.RESERVED,
                });

                // Re-sync slot data lên Redis cho MES cập nhật trạng thái mới
                this.syncSlotsToRedis(dto.warehouse_id).catch(err =>
                    console.error(`[INBOUND] Lỗi sync Redis: ${err.message}`)
                );

                // === BƯỚC B: Lấy tọa độ Slot để gửi cho MES (Dispatch) ===
                const slot = await this.warehouseSlotRepo.findById(slotResult.slot_id);
                const slotPosition = slot
                    ? { x: Math.round(Number((slot as any).x)), y: Math.round(Number((slot as any).y)) }
                    : { x: 0, y: 0 };

                // === BƯỚC C: Lấy tọa độ thực tế của Pickup & AGV từ DB ===
                const { pickupPoint, agvPosition } = await this.getPickupAndAGVPosition(dto.warehouse_id);
                console.log(`[INBOUND] Pickup: (${pickupPoint.x},${pickupPoint.y}) | AGV: (${agvPosition.x},${agvPosition.y}) | Slot: (${slotPosition.x},${slotPosition.y})`);

                // === BƯỚC D: Gọi MES xin Execution Plan ===
                console.log(`[INBOUND] Xin Execution Plan từ MES...`);
                const dispatchResult = await this.mesGrpcClient.dispatchAGV({
                    warehouseId: dto.warehouse_id,
                    inboundOrderId: order.id,
                    agvPosition,
                    pickupPoint,
                    slotPosition,
                });

                if (!dispatchResult.success) {
                    console.warn(`[INBOUND] MES không tạo được Execution Plan: ${dispatchResult.message}`);
                    continue;
                }

                console.log(`[INBOUND] Execution Plan: ${dispatchResult.waypoints.length} buoc. Gui sang Go...`);

                // === Lấy AGV ID thực tế từ DB để gửi cho Go thay vì hardcode ===
                const agvs = await this.agvRepo.findByWarehouse(dto.warehouse_id);
                // Giả định chọn xe đầu tiên đang IDLE. Nếu không có, tạm lấy xe đầu tiên.
                const idleAgv = agvs.find(a => a.status === 'IDLE') || agvs[0];
                const targetAgvId = idleAgv ? idleAgv.id : 'AGV-01';

                // === BƯỚC E: Gửi Execution Plan sang Go AGV Control ===
                // Fire-and-forget (không chặn API response)
                this.sendPlanToGo(order.id, targetAgvId, dispatchResult.waypoints).catch(err =>
                    console.error(`[INBOUND] Lỗi gửi plan sang Go: ${err.message}`)
                );

            } catch (error: any) {
                console.error(`[INBOUND] Lỗi xử lý item: ${error.message}`);
                await this.inboundOrderItemRepo.createItem({
                    inbound_order_id: order.id,
                    product_id: productId,
                    assigned_slot_id: null,
                    quantity: item.quantity,
                });
                allAllocated = false;
            }
        }

        // 3. Cập nhật trạng thái Order
        const finalStatus = allAllocated ? InboundOrderStatus.ALLOCATED : InboundOrderStatus.FAILED;
        return this.inboundOrderRepo.updateOrderStatus(order.id, finalStatus);
    }

    /**
     * Gửi Execution Plan tới Go AGV Control Service
     */
    private async sendPlanToGo(orderId: string, agvId: string, waypoints: any[]): Promise<void> {
        const actionMap: Record<number, string> = {
            0: 'MOVE',
            1: 'PICK_UP',
            2: 'DROP_OFF'
        };

        const body = {
            agv_id: agvId,
            inbound_order_id: orderId,
            wms_callback_url: WMS_CALLBACK_URL,
            waypoints: waypoints.map((wp: any) => ({
                position: { x: wp.position?.x ?? wp.x, y: wp.position?.y ?? wp.y },
                action: typeof wp.action === 'number' ? actionMap[wp.action] : (wp.action || 'MOVE'),
            })),
        };

        console.log(`[INBOUND] >>> Gửi sang Go: ${AGV_SERVICE_URL}/execute | ${body.waypoints.length} buoc`);
        console.log(`[INBOUND] >>> Body mẫu (wp[0]):`, JSON.stringify(body.waypoints[0]));

        try {
            const response = await (fetch as any)(`${AGV_SERVICE_URL}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const result = await response.json();
            console.log(`[INBOUND] <<< Go AGV Service phan hoi:`, result);
        } catch (err: any) {
            console.error(`[INBOUND] !!! Lỗi gọi Go AGV Service: ${err.message}`);
            console.error(`[INBOUND] !!! URL: ${AGV_SERVICE_URL}/execute`);
        }
    }

    async getOrderById(id: string): Promise<any> {
        const order = await this.inboundOrderRepo.findById(id);
        if (!order) return null;
        const items = await this.inboundOrderItemRepo.getItemsByOrderId(id);
        return { ...order, items };
    }

    /**
     * Lấy tọa độ thực tế của điểm PICKUP và vị trí AGV (CHARGING) từ DB
     */
    private async getPickupAndAGVPosition(warehouseId: string): Promise<{
        pickupPoint: { x: number; y: number };
        agvPosition: { x: number; y: number };
    }> {
        const allSlots = await this.warehouseSlotRepo.findByWarehouseId(warehouseId);

        const pickupSlot = allSlots.find((s: any) => s.slot_type === 'PICKUP');
        const chargingSlot = allSlots.find((s: any) => s.slot_type === 'CHARGING');

        // Fallback: nếu không tìm thấy, dùng ô đầu tiên kiểu AISLE (lối đi)
        const aisleSlot = allSlots.find((s: any) => s.slot_type === 'AISLE');

        const pickupPoint = pickupSlot
            ? { x: Math.round(Number((pickupSlot as any).x)), y: Math.round(Number((pickupSlot as any).y)) }
            : aisleSlot
                ? { x: Math.round(Number((aisleSlot as any).x)), y: Math.round(Number((aisleSlot as any).y)) }
                : { x: 1, y: 1 };

        const agvPosition = chargingSlot
            ? { x: Math.round(Number((chargingSlot as any).x)), y: Math.round(Number((chargingSlot as any).y)) }
            : pickupPoint;

        return { pickupPoint, agvPosition };
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
        
        // Note: Trong thực tế sẽ cần InventoryRepository để tăng quantity.
        // Tạm thời log ra để chứng minh luồng thông suốt.
        for (const item of items) {
            if (item.assigned_slot_id) {
                console.log(`[INVENTORY] Ban can cong ${item.quantity} sp ${item.product_id} vao slot ${item.assigned_slot_id}`);
                // await this.inventoryRepo.addInventory(...)
                
                // Cập nhật slot status thành OCCUPIED
                await this.warehouseSlotRepo.updateSlot(item.assigned_slot_id, {
                    status: SlotStatus.OCCUPIED
                });
            }
        }
        // 3. Re-sync Redis cho MES
        // Lấy warehouse_id từ order
        const order = await this.inboundOrderRepo.findById(orderId);
        if (order) {
            this.syncSlotsToRedis((order as any).warehouse_id).catch(err =>
                console.error(`[INBOUND] Lỗi sync Redis sau complete: ${err.message}`)
            );
        }

        return { success: true, message: 'Inbound order completed successfully' };
    }

    /**
     * Đẩy lại danh sách slot lên Redis cho MES
     */
    private async syncSlotsToRedis(warehouseId: string): Promise<void> {
        const dbSlots = await this.warehouseSlotRepo.findByWarehouseId(warehouseId);
        const slotsForMES = dbSlots
            .filter((s: any) => s.slot_type === 'STORAGE')
            .map((s: any) => ({
                slot_id: s.id,
                max_length: Number(s.width),
                max_width: Number(s.height),
                is_occupied: s.status !== 'AVAILABLE',
                position: [Number(s.x), Number(s.y)],
            }));

        const cacheKey = `warehouse:${warehouseId}:slots`;
        await cacheManager.set(cacheKey, slotsForMES, 86400);
        console.log(`📦 [Redis Sync] Re-synced ${slotsForMES.length} slots cho kho ${warehouseId}`);
    }
}
