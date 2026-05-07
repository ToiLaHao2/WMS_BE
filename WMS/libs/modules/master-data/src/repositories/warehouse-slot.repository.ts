import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IWarehouseSlot, CreateWarehouseSlotDTO, UpdateWarehouseSlotDTO } from '../master-data.model';

export class WarehouseSlotRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'warehouse_slot');
    }

    async findByWarehouseId(warehouseId: string): Promise<IWarehouseSlot[]> {
        return this.findWhere({ warehouse_id: warehouseId }) as Promise<IWarehouseSlot[]>;
    }

    async findBySlotCode(warehouseId: string, slotCode: string): Promise<IWarehouseSlot | null> {
        const rows = await this.rawQuery<IWarehouseSlot>(
            `SELECT * FROM "warehouse_slot" WHERE warehouse_id = $1 AND slot_code = $2 LIMIT 1`,
            [warehouseId, slotCode]
        );
        return rows[0] ?? null;
    }

    async createSlot(data: CreateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        return this.create(data) as Promise<IWarehouseSlot>;
    }

    async updateSlot(id: string, data: UpdateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        return this.update(id, data) as Promise<IWarehouseSlot>;
    }

    async getAvailableStorageSlots(warehouseId: string): Promise<IWarehouseSlot[]> {
        return this.rawQuery<IWarehouseSlot>(
            `SELECT * FROM "warehouse_slot" 
             WHERE warehouse_id = $1 
             AND slot_type = 'STORAGE' 
             AND status = 'AVAILABLE' 
             AND occupied_percent < 100
             ORDER BY x, y`,
            [warehouseId]
        );
    }
}
