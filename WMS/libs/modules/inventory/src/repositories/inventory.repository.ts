import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IInventory } from '../inventory.model';

export class InventoryRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'inventory');
    }

    async getByWarehouse(warehouseId: string): Promise<IInventory[]> {
        const query = `
            SELECT i.*, p.name as product_name
            FROM "inventory" i
            LEFT JOIN "product" p ON i.product_id = p.id
            WHERE i.warehouse_id = $1
            ORDER BY i.created_at DESC
        `;
        const results = await this.rawQuery(query, [warehouseId]);
        return results as unknown as IInventory[];
    }

    async addInventory(warehouseId: string, slotId: string, productId: string, quantity: number): Promise<IInventory> {
        // Kiểm tra xem đã có tồn kho tại slot này với product này chưa
        const existing = await this.findWhere({
            warehouse_id: warehouseId,
            slot_id: slotId,
            product_id: productId
        });

        if (existing && existing.length > 0) {
            const current = existing[0] as unknown as IInventory;
            const updated = await this.update(current.id, {
                quantity: current.quantity + quantity
            } as any);
            return updated as unknown as IInventory;
        } else {
            const result = await this.create({
                warehouse_id: warehouseId,
                slot_id: slotId,
                product_id: productId,
                quantity: quantity,
                reserved_quantity: 0
            } as any);
            return result as unknown as IInventory;
        }
    }

    /**
     * Tìm tất cả các record inventory trong một kho chứa productId cụ thể
     * có số lượng khả dụng (quantity - reserved_quantity) > 0.
     */
    async findAvailableInventory(warehouseId: string, productId: string): Promise<IInventory[]> {
        const query = `
            SELECT * FROM "${this.tableName}"
            WHERE warehouse_id = $1 
              AND product_id = $2 
              AND (quantity - reserved_quantity) > 0
            ORDER BY (quantity - reserved_quantity) DESC
        `;
        const results = await this.rawQuery(query, [warehouseId, productId]);
        return results as unknown as IInventory[];
    }

    /**
     * Tăng số lượng dự trữ (khi có lệnh xuất hàng mới)
     */
    async reserveQuantity(inventoryId: string, amount: number): Promise<void> {
        const query = `
            UPDATE "${this.tableName}"
            SET reserved_quantity = reserved_quantity + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `;
        await this.rawQuery(query, [amount, inventoryId]);
    }
}
