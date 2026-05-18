import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IInboundOrder, IInboundOrderItem, CreateInboundOrderDTO } from '../inbound.model';

export class InboundOrderRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'inbound_order');
    }

    async findByCode(code: string): Promise<IInboundOrder | null> {
        const result = await this.findWhere({ code });
        return result[0] as unknown as IInboundOrder ?? null;
    }

    async createOrder(data: Partial<IInboundOrder>): Promise<IInboundOrder> {
        const result = await this.create(data as any);
        return result as unknown as IInboundOrder;
    }

    async updateOrderStatus(id: string, status: string): Promise<IInboundOrder> {
        const result = await this.update(id, { status } as any);
        return result as unknown as IInboundOrder;
    }

    async getAllOrders(): Promise<IInboundOrder[]> {
        const query = `SELECT id, warehouse_id, code, status, created_at, updated_at FROM "${this.tableName}" ORDER BY created_at DESC`;
        const results = await this.rawQuery(query);
        return results as unknown as IInboundOrder[];
    }
}

export class InboundOrderItemRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'inbound_order_item');
    }

    async createItem(data: Partial<IInboundOrderItem>): Promise<IInboundOrderItem> {
        const result = await this.create(data as any);
        return result as unknown as IInboundOrderItem;
    }

    async getItemsByOrderId(orderId: string): Promise<IInboundOrderItem[]> {
        const result = await this.findWhere({ inbound_order_id: orderId });
        return result as unknown as IInboundOrderItem[];
    }
}
