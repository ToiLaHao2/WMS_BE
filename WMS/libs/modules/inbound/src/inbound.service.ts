import fetch from 'node-fetch';
import { InboundOrderStatus } from './inbound.model';
import type { CreateInboundOrderDTO, IInboundOrder } from './inbound.model';
import type { InboundOrderRepository, InboundOrderItemRepository } from './repositories/inbound.repository';
import type { ProductRepository } from '../../master-data/src/repositories/product.repository';
import type { WarehouseSlotRepository } from '../../master-data/src/repositories/warehouse-slot.repository';
import type { MesGrpcClient } from '@core/contracts/mes-grpc.client';
import { SlotStatus } from '../../master-data/src/master-data.model';

// Cổng và địa chỉ của Go AGV Control Service
const AGV_SERVICE_URL = process.env.AGV_SERVICE_URL || 'http://localhost:8081';

// Cổng WMS để Go báo ngược về
const WMS_CALLBACK_URL = process.env.WMS_BASE_URL || 'http://localhost:3000';

// Cửa kho mặc định (pickup point) — Điểm AGV tới gắp hàng
const DEFAULT_PICKUP_POINT = { x: 0, y: 0 };

// Vị trí mặc định của AGV khi idle
const DEFAULT_AGV_POSITION = { x: 0, y: 0 };

export class InboundService {
    private inboundOrderRepo: InboundOrderRepository;
    private inboundOrderItemRepo: InboundOrderItemRepository;
    private productRepo: ProductRepository;
    private warehouseSlotRepo: WarehouseSlotRepository;
    private mesGrpcClient: MesGrpcClient;

    constructor({
        inboundOrderRepository,
        inboundOrderItemRepository,
        productRepository,
        warehouseSlotRepository,
        mesGrpcClient,
    }: {
        inboundOrderRepository: InboundOrderRepository;
        inboundOrderItemRepository: InboundOrderItemRepository;
        productRepository: ProductRepository;
        warehouseSlotRepository: WarehouseSlotRepository;
        mesGrpcClient: MesGrpcClient;
    }) {
        this.inboundOrderRepo = inboundOrderRepository;
        this.inboundOrderItemRepo = inboundOrderItemRepository;
        this.productRepo = productRepository;
        this.warehouseSlotRepo = warehouseSlotRepository;
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
            const product = await this.productRepo.findById(item.product_id);
            if (!product) {
                console.error(`[INBOUND] Product not found: ${item.product_id}`);
                allAllocated = false;
                continue;
            }

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
                        product_id: item.product_id,
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
                    product_id: item.product_id,
                    assigned_slot_id: slotResult.slot_id,
                    quantity: item.quantity,
                });
                await this.warehouseSlotRepo.updateSlot(slotResult.slot_id, {
                    status: SlotStatus.RESERVED,
                });

                // === BƯỚC B: Lấy tọa độ Slot để gửi cho MES (Dispatch) ===
                const slot = await this.warehouseSlotRepo.findById(slotResult.slot_id);
                const slotPosition = slot
                    ? { x: Math.round(Number((slot as any).x)), y: Math.round(Number((slot as any).y)) }
                    : { x: 0, y: 0 };

                // === BƯỚC C: Gọi MES xin Execution Plan ===
                console.log(`[INBOUND] Xin Execution Plan từ MES...`);
                const dispatchResult = await this.mesGrpcClient.dispatchAGV({
                    warehouseId: dto.warehouse_id,
                    inboundOrderId: order.id,
                    agvPosition: DEFAULT_AGV_POSITION,
                    pickupPoint: DEFAULT_PICKUP_POINT,
                    slotPosition,
                });

                if (!dispatchResult.success) {
                    console.warn(`[INBOUND] MES không tạo được Execution Plan: ${dispatchResult.message}`);
                    continue;
                }

                console.log(`[INBOUND] Execution Plan: ${dispatchResult.waypoints.length} buoc. Gui sang Go...`);

                // === BƯỚC D: Gửi Execution Plan sang Go AGV Control ===
                // Fire-and-forget (không chặn API response)
                this.sendPlanToGo(order.id, dispatchResult.waypoints).catch(err =>
                    console.error(`[INBOUND] Lỗi gửi plan sang Go: ${err.message}`)
                );

            } catch (error: any) {
                console.error(`[INBOUND] Lỗi xử lý item: ${error.message}`);
                await this.inboundOrderItemRepo.createItem({
                    inbound_order_id: order.id,
                    product_id: item.product_id,
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
    private async sendPlanToGo(orderId: string, waypoints: any[]): Promise<void> {
        const body = {
            agv_id: 'AGV-01', // TODO: Chọn xe động sau khi có AGV Manager
            inbound_order_id: orderId,
            wms_callback_url: WMS_CALLBACK_URL,
            waypoints: waypoints.map((wp: any) => ({
                position: { x: wp.position.x, y: wp.position.y },
                action: wp.action,
            })),
        };

        const response = await (fetch as any)(`${AGV_SERVICE_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const result = await response.json();
        console.log(`[INBOUND] Go AGV Service phan hoi:`, result);
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
        
        // 3. TODO: Giải phóng AGV state thành IDLE (gọi qua Master Data hoặc AGV service)

        return { success: true, message: 'Inbound order completed successfully' };
    }
}
