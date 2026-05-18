import { InboundOrderStatus } from './inbound.model';
import type { CreateInboundOrderDTO, IInboundOrder } from './inbound.model';
import type { InboundOrderRepository, InboundOrderItemRepository } from './repositories/inbound.repository';
import type { ProductRepository } from '../../master-data/src/repositories/product.repository';
import type { WarehouseSlotRepository } from '../../master-data/src/repositories/warehouse-slot.repository';
import type { MesGrpcClient } from '@core/contracts/mes-grpc.client';
import { SlotStatus } from '../../master-data/src/master-data.model';

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
     * Tạo lệnh nhập hàng và xin cấp phát slot qua MES
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
            // Lấy thông tin kích thước của product
            const product = await this.productRepo.findById(item.product_id);
            if (!product) {
                console.error(`Product not found: ${item.product_id}`);
                allAllocated = false;
                continue;
            }

            try {
                // GỌI SANG MES (gRPC) ĐỂ XIN CẤP PHÁT SLOT
                const result = await this.mesGrpcClient.allocateSlot(
                    dto.warehouse_id,
                    item.product_id,
                    Number(product.width), // Lưu ý: models.py nhận length và width. Trong TS ta có width, height. Ta map width->width, height->length
                    Number(product.height)
                );

                if (result.success && result.slot_id) {
                    // Đã có slot, lưu item với assigned_slot_id
                    await this.inboundOrderItemRepo.createItem({
                        inbound_order_id: order.id,
                        product_id: item.product_id,
                        assigned_slot_id: result.slot_id,
                        quantity: item.quantity,
                    });

                    // Cập nhật trạng thái slot thành RESERVED để giữ chỗ
                    await this.warehouseSlotRepo.updateSlot(result.slot_id, {
                        status: SlotStatus.RESERVED
                    });
                    
                    console.log(`[INBOUND] Cấp slot ${result.slot_id} thành công cho SP ${item.product_id}`);
                } else {
                    console.warn(`[INBOUND] MES từ chối cấp slot cho SP ${item.product_id}: ${result.message}`);
                    // Vẫn lưu item nhưng không có slot
                    await this.inboundOrderItemRepo.createItem({
                        inbound_order_id: order.id,
                        product_id: item.product_id,
                        assigned_slot_id: null,
                        quantity: item.quantity,
                    });
                    allAllocated = false;
                }
            } catch (error: any) {
                console.error(`[INBOUND] Lỗi gọi gRPC tới MES: ${error.message}`);
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

    async getOrderById(id: string): Promise<any> {
        const order = await this.inboundOrderRepo.findById(id);
        if (!order) return null;
        
        const items = await this.inboundOrderItemRepo.getItemsByOrderId(id);
        return { ...order, items };
    }

    async getAllOrders(): Promise<IInboundOrder[]> {
        return this.inboundOrderRepo.getAllOrders();
    }
}
