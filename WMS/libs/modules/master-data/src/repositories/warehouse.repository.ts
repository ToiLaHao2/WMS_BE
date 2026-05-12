import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IWarehouse, CreateWarehouseDTO, UpdateWarehouseDTO } from '../master-data.model';

export class WarehouseRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'warehouse');
    }

    async findByCode(code: string): Promise<IWarehouse | null> {
        const result = await this.findWhere({ code });
        return result[0] as unknown as IWarehouse ?? null;
    }

    async createWarehouse(data: CreateWarehouseDTO): Promise<IWarehouse> {
        const result = await this.create(data as any);
        return result as unknown as IWarehouse;
    }

    async updateWarehouse(id: string, data: UpdateWarehouseDTO): Promise<IWarehouse> {
        const result = await this.update(id, data as any);
        return result as unknown as IWarehouse;
    }

    async getAllWarehouses(): Promise<IWarehouse[]> {
        const query = `SELECT id, code, name, description, width, height, layout_type, created_at, updated_at FROM "${this.tableName}" ORDER BY created_at DESC`;
        const results = await this.rawQuery(query);
        return results as unknown as IWarehouse[];
    }
}
