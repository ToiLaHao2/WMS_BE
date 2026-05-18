import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';

export interface IInventory {
    id: string;
    warehouse_id: string;
    slot_id: string;
    product_id: string;
    quantity: number;
    reserved_quantity: number;
    created_at: Date;
    updated_at: Date;
}

export class InventoryRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'inventory');
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
