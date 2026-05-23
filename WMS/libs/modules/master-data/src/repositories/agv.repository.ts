import { BasePostgresRepository, IDatabaseAdapter } from '@core/database';
import { IAGV, CreateAGVDTO, AGVStatus } from '../master-data.model';
import { PoolClient } from 'pg';

export class AGVRepository extends BasePostgresRepository {
    public static readonly injectionKey = 'agvRepository';
    db: any;
    constructor({ db }: { db: IDatabaseAdapter }) {
        super(db, 'agv');
    }

    async createAGVWithClient(client: PoolClient, data: CreateAGVDTO & { current_x: number, current_y: number }): Promise<IAGV> {
        const query = `
            INSERT INTO agv (
                id, code, warehouse_id, model, max_weight, battery_capacity, status, current_x, current_y
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
            ) RETURNING *;
        `;
        const values = [
            data.code,
            data.warehouse_id,
            data.model,
            data.max_weight,
            data.battery_capacity,
            AGVStatus.IDLE,
            data.current_x,
            data.current_y
        ];
        const res = await client.query(query, values);
        return res.rows[0] as IAGV;
    }

    async findByWarehouse(warehouseId: string): Promise<IAGV[]> {
        const results = await this.findWhere({ warehouse_id: warehouseId });
        return results as unknown as IAGV[];
    }

    async updateStatus(id: string, status: string): Promise<void> {
        const query = `UPDATE agv SET status = $1 WHERE id = $2`;
        await this.pool.query(query, [status, id]);
    }
}
