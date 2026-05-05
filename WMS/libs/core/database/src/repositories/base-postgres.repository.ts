import { Pool } from 'pg';
import { NotFoundError } from '@core/exceptions';
import type { IDatabaseAdapter } from '../adapters/base.adapter';

/**
 * BasePostgresRepository — Generic CRUD cho PostgreSQL.
 * Các Module (Users, Courses, ...) kế thừa class này.
 *
 * Convention:
 *  - Mỗi table phải có cột `id` (UUID hoặc text), `created_at`, `updated_at`.
 *  - Column names dùng snake_case (Postgres convention).
 */
export class BasePostgresRepository {
    protected pool: Pool;
    protected tableName: string;

    constructor(db: IDatabaseAdapter, tableName: string) {
        const pool = db.getDB() as Pool;
        if (!pool) throw new Error(`PostgreSQL Pool is required for table "${tableName}"`);
        this.pool = pool;
        this.tableName = tableName;
    }

    async findById(id: string): Promise<Record<string, unknown> | null> {
        const result = await this.pool.query(
            `SELECT * FROM "${this.tableName}" WHERE id = $1 LIMIT 1`,
            [id]
        );
        return result.rows[0] ?? null;
    }

    async findByIdOrThrow(id: string): Promise<Record<string, unknown>> {
        const data = await this.findById(id);
        if (!data) {
            throw new NotFoundError(`Record with id '${id}' not found in ${this.tableName}`);
        }
        return data;
    }

    async findAll(): Promise<Record<string, unknown>[]> {
        const result = await this.pool.query(`SELECT * FROM "${this.tableName}"`);
        return result.rows;
    }

    async findWhere(conditions: Record<string, unknown>): Promise<Record<string, unknown>[]> {
        const keys = Object.keys(conditions);
        const values = Object.values(conditions);
        const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ');

        const result = await this.pool.query(
            `SELECT * FROM "${this.tableName}" WHERE ${whereClause}`,
            values
        );
        return result.rows;
    }

    async create(data: Record<string, unknown>, id?: string): Promise<Record<string, unknown>> {
        const now = new Date();
        const payload: Record<string, unknown> = {
            ...data,
            created_at: now,
            updated_at: now,
        };

        // If an explicit id is provided, include it
        if (id) {
            payload.id = id;
        }

        const keys = Object.keys(payload);
        const values = Object.values(payload);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const columns = keys.map(k => `"${k}"`).join(', ');

        const result = await this.pool.query(
            `INSERT INTO "${this.tableName}" (${columns}) VALUES (${placeholders}) RETURNING *`,
            values
        );

        return result.rows[0];
    }

    async update(id: string, partialData: Record<string, unknown>): Promise<Record<string, unknown>> {
        await this.findByIdOrThrow(id);

        const payload: Record<string, unknown> = {
            ...partialData,
            updated_at: new Date(),
        };

        const keys = Object.keys(payload);
        const values = Object.values(payload);
        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');

        const result = await this.pool.query(
            `UPDATE "${this.tableName}" SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
            [...values, id]
        );

        return result.rows[0];
    }

    async delete(id: string): Promise<boolean> {
        await this.findByIdOrThrow(id);
        await this.pool.query(`DELETE FROM "${this.tableName}" WHERE id = $1`, [id]);
        return true;
    }

    /**
     * Execute a raw query — cho các trường hợp đặc biệt.
     */
    async rawQuery<T = any>(text: string, params?: any[]): Promise<T[]> {
        const result = await this.pool.query(text, params);
        return result.rows;
    }
}
