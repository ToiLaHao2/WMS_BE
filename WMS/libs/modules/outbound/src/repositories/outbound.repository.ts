import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IOutboundOrder, IOutboundOrderItem } from '../outbound.model';

export class OutboundOrderRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'outbound_order');
    }

    async findByCode(code: string): Promise<IOutboundOrder | null> {
        const result = await this.findWhere({ code });
        return result[0] as unknown as IOutboundOrder ?? null;
    }

    async createOrder(data: Partial<IOutboundOrder>): Promise<IOutboundOrder> {
        const result = await this.create(data as any);
        return result as unknown as IOutboundOrder;
    }

    async updateOrderStatus(id: string, status: string): Promise<IOutboundOrder> {
        const result = await this.update(id, { status } as any);
        return result as unknown as IOutboundOrder;
    }

    async getAllOrders(): Promise<IOutboundOrder[]> {
        const query = `SELECT id, warehouse_id, code, status, created_at, updated_at FROM "${this.tableName}" ORDER BY created_at DESC`;
        const results = await this.rawQuery(query);
        return results as unknown as IOutboundOrder[];
    }
}

export class OutboundOrderItemRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'outbound_order_item');
    }

    async createItem(data: Partial<IOutboundOrderItem>): Promise<IOutboundOrderItem> {
        const result = await this.create(data as any);
        return result as unknown as IOutboundOrderItem;
    }

    async getItemsByOrderId(orderId: string): Promise<IOutboundOrderItem[]> {
        const result = await this.findWhere({ outbound_order_id: orderId });
        return result as unknown as IOutboundOrderItem[];
    }
}
