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
    private systemQueue: any; // BullMQ Queue

    constructor({
        inboundOrderRepository,
        inboundOrderItemRepository,
        productRepository,
        warehouseSlotRepository,
        agvRepository,
        mesGrpcClient,
        systemQueue,
    }: {
        inboundOrderRepository: InboundOrderRepository;
        inboundOrderItemRepository: InboundOrderItemRepository;
        productRepository: ProductRepository;
        warehouseSlotRepository: WarehouseSlotRepository;
        agvRepository: AGVRepository;
        mesGrpcClient: MesGrpcClient;
        systemQueue: any;
    }) {
        this.inboundOrderRepo = inboundOrderRepository;
        this.inboundOrderItemRepo = inboundOrderItemRepository;
        this.productRepo = productRepository;
        this.warehouseSlotRepo = warehouseSlotRepository;
        this.agvRepo = agvRepository;
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

    /**
     * Lấy AGV rảnh từ Redis (fallback DB)
     */
    private async getAvailableAgv(warehouseId: string): Promise<any> {
        const agvs = await this.agvRepo.findByWarehouse(warehouseId);
        
        for (const agv of agvs) {
            const cacheKey = `agv_status:${agv.id}`;
            let status = await cacheManager.get(cacheKey);
            
            // Nếu Redis chưa có, lấy từ DB và cache lại
            if (!status) {
                status = agv.status;
                await cacheManager.set(cacheKey, status, 86400); // Cache 1 ngày
            }
            
            if (status === 'IDLE') {
                return agv;
            }
        }
        
        // Nếu không có xe nào rảnh, tạm trả về undefined để xử lý chờ
        return undefined;
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

        // 4. Giải phóng AGV (Cập nhật lại thành IDLE)
        await cacheManager.set(`agv_status:${agvId}`, 'IDLE', 86400);
        this.agvRepo.updateStatus(agvId, 'IDLE').catch(err =>
            console.error(`[INBOUND] Lỗi update DB AGV IDLE: ${err.message}`)
        );

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
