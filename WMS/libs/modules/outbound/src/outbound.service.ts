import { OutboundOrderStatus } from './outbound.model';
import type { CreateOutboundOrderDTO, IOutboundOrder } from './outbound.model';
import type { OutboundOrderRepository, OutboundOrderItemRepository } from './repositories/outbound.repository';
import type { InventoryRepository } from './repositories/inventory.repository';
import type { ProductRepository } from '../../master-data/src/repositories/product.repository';

export class OutboundService {
    private outboundOrderRepo: OutboundOrderRepository;
    private outboundOrderItemRepo: OutboundOrderItemRepository;
    private inventoryRepo: InventoryRepository;
    private productRepo: ProductRepository;

    constructor({
        outboundOrderRepository,
        outboundOrderItemRepository,
        inventoryRepository,
        productRepository,
    }: {
        outboundOrderRepository: OutboundOrderRepository;
        outboundOrderItemRepository: OutboundOrderItemRepository;
        inventoryRepository: InventoryRepository;
        productRepository: ProductRepository;
    }) {
        this.outboundOrderRepo = outboundOrderRepository;
        this.outboundOrderItemRepo = outboundOrderItemRepository;
        this.inventoryRepo = inventoryRepository;
        this.productRepo = productRepository;
    }

    /**
     * Khởi tạo lệnh xuất hàng, check tồn kho và giữ hàng (reserve)
     */
    async createOutboundOrder(dto: CreateOutboundOrderDTO): Promise<IOutboundOrder> {
        // 1. Khởi tạo Order trạng thái PENDING
        const order = await this.outboundOrderRepo.createOrder({
            warehouse_id: dto.warehouse_id,
            code: dto.code,
            status: OutboundOrderStatus.PENDING,
        });

        let allItemsValidated = true;

        // 2. Xử lý tìm kiếm tồn kho cho từng món hàng yêu cầu
        for (const item of dto.items) {
            let remainingQuantityToPick = item.quantity;
            
            // Tìm tất cả các slot đang chứa product này và còn hàng khả dụng
            const availableInventories = await this.inventoryRepo.findAvailableInventory(
                dto.warehouse_id, 
                item.product_id
            );

            // Bắt đầu nhặt hàng từ các slot cho đến khi đủ số lượng yêu cầu
            for (const inv of availableInventories) {
                if (remainingQuantityToPick <= 0) break;

                const availableQtyInSlot = inv.quantity - inv.reserved_quantity;
                const pickQty = Math.min(availableQtyInSlot, remainingQuantityToPick);

                // Giữ chỗ số lượng hàng này
                await this.inventoryRepo.reserveQuantity(inv.id, pickQty);

                // Ghi nhận vào Order Item
                await this.outboundOrderItemRepo.createItem({
                    outbound_order_id: order.id,
                    product_id: item.product_id,
                    picked_slot_id: inv.slot_id,
                    quantity: pickQty,
                });

                remainingQuantityToPick -= pickQty;
            }

            // Nếu sau khi quét toàn bộ kho mà vẫn không đủ hàng
            if (remainingQuantityToPick > 0) {
                console.warn(`[OUTBOUND] Không đủ hàng cho SP ${item.product_id}. Cần thêm: ${remainingQuantityToPick}`);
                allItemsValidated = false;
                
                // Vẫn lưu lại lượng còn thiếu (không có slot_id) để report
                await this.outboundOrderItemRepo.createItem({
                    outbound_order_id: order.id,
                    product_id: item.product_id,
                    picked_slot_id: null,
                    quantity: remainingQuantityToPick,
                });
            }
        }

        // 3. Chốt trạng thái Order
        // Nếu tất cả đều đủ hàng -> VALIDATED (sẵn sàng điều AGV đi lấy)
        // Nếu thiếu hàng -> FAILED
        const finalStatus = allItemsValidated ? OutboundOrderStatus.VALIDATED : OutboundOrderStatus.FAILED;
        return this.outboundOrderRepo.updateOrderStatus(order.id, finalStatus);
    }

    async getOrderById(id: string): Promise<any> {
        const order = await this.outboundOrderRepo.findById(id);
        if (!order) return null;
        
        const items = await this.outboundOrderItemRepo.getItemsByOrderId(id);
        return { ...order, items };
    }

    async getAllOrders(): Promise<IOutboundOrder[]> {
        return this.outboundOrderRepo.getAllOrders();
    }
}
