import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IWarehouse, CreateWarehouseDTO, UpdateWarehouseDTO } from '../master-data.model';

export class WarehouseRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'warehouse');
    }

    async findByCode(code: string): Promise<IWarehouse | null> {
        const rows = await this.findWhere({ code });
        return (rows[0] as IWarehouse) ?? null;
    }

    async createWarehouse(data: CreateWarehouseDTO): Promise<IWarehouse> {
        return this.create(data) as Promise<IWarehouse>;
    }

    async updateWarehouse(id: string, data: UpdateWarehouseDTO): Promise<IWarehouse> {
        return this.update(id, data) as Promise<IWarehouse>;
    }

    async getAllWarehouses(): Promise<IWarehouse[]> {
        return this.findAll() as Promise<IWarehouse[]>;
    }
}
