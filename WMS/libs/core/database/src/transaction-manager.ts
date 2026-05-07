import { Pool, PoolClient } from 'pg';
import { postgresAdapter } from './adapters/postgres.adapter';

/**
 * TransactionManager — Quản lý Database Transactions theo mẫu Unit of Work.
 *
 * Cách dùng trong Service:
 * ```
 * const result = await transactionManager.runInTransaction(async (client) => {
 *     await inventoryRepo.updateWithClient(client, itemId, { status: 'LOCKED' });
 *     await outboundRepo.createWithClient(client, orderData);
 *     return { success: true };
 * });
 * ```
 *
 * Nếu bất kỳ lệnh nào trong callback lỗi → tự động ROLLBACK.
 * Nếu tất cả thành công → tự động COMMIT.
 */
class TransactionManager {
    private getPool(): Pool {
        const pool = postgresAdapter.getDB();
        if (!pool) throw new Error('❌ TransactionManager: PostgreSQL Pool chưa được khởi tạo.');
        return pool;
    }

    /**
     * Chạy một nhóm các thao tác DB trong một Transaction duy nhất.
     * @param callback - Hàm chứa logic nghiệp vụ, nhận vào PoolClient để thực hiện query.
     * @returns Kết quả trả về từ callback.
     */
    async runInTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const pool = this.getPool();
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

export const transactionManager = new TransactionManager();
