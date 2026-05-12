import { BasePostgresRepository } from '@core/database';
import type { IDatabaseAdapter } from '@core/database';
import type { IWarehouseSlot, CreateWarehouseSlotDTO, UpdateWarehouseSlotDTO } from '../master-data.model';

export class WarehouseSlotRepository extends BasePostgresRepository {
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'warehouse_slot');
    }

    async findByWarehouseId(warehouseId: string): Promise<IWarehouseSlot[]> {
        const query = `SELECT id, slot_code, x, y, width, height, slot_type, occupied_percent, status, metadata, created_at, updated_at 
                       FROM "warehouse_slot" WHERE warehouse_id = $1 ORDER BY y, x`;
        const results = await this.rawQuery(query, [warehouseId]);
        return results as unknown as IWarehouseSlot[];
    }

    async findBySlotCode(warehouseId: string, slotCode: string): Promise<IWarehouseSlot | null> {
        const rows = await this.rawQuery<IWarehouseSlot>(
            `SELECT * FROM "warehouse_slot" WHERE warehouse_id = $1 AND slot_code = $2 LIMIT 1`,
            [warehouseId, slotCode]
        );
        return rows[0] ?? null;
    }

    async createSlot(data: CreateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        return this.create(data as any) as unknown as Promise<IWarehouseSlot>;
    }

    async updateSlot(id: string, data: UpdateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        return this.update(id, data as any) as unknown as Promise<IWarehouseSlot>;
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

    async bulkCreateSlotsWithClient(client: any, slots: CreateWarehouseSlotDTO[]): Promise<void> {
        if (slots.length === 0) return;

        const values: any[] = [];
        const placeholders: string[] = [];

        slots.forEach((slot, index) => {
            const offset = index * 8;
            placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`);
            values.push(
                slot.warehouse_id,
                slot.slot_code,
                slot.x,
                slot.y,
                slot.width,
                slot.height,
                slot.slot_type,
                JSON.stringify(slot.metadata || {})
            );
        });

        const query = `
            INSERT INTO "warehouse_slot" 
            (warehouse_id, slot_code, x, y, width, height, slot_type, metadata) 
            VALUES ${placeholders.join(', ')}
        `;

        await this.rawQueryWithClient(client, query, values);
    }
}
