import { postgresAdapter, seedSuperAdminPostgres } from '@core/database';
import { cloudinaryAdapter } from '@core/storage';
import { cacheManager } from '@core/cache';
import { Pool } from 'pg';

/**
 * System Check - Kiem tra ket noi cac service khi khoi dong
 */
export const runSystemCheck = async (): Promise<void> => {
    console.log('\n--- 🛠️  SYSTEM CHECK ---');

    try {
        // 1. Verify PostgreSQL connection
        const pool = postgresAdapter.getDB() as Pool;

        if (pool) {
            // Quick connectivity test
            const result = await pool.query('SELECT NOW()');
            console.log(`✅ PostgreSQL connected. Server time: ${result.rows[0].now}`);

            // 1.1 Seed default Super Admin (optional, env-driven)
            await seedSuperAdminPostgres(pool);
        }

        // 2. Khoi tao Storage (Cloudinary)
        cloudinaryAdapter.connect();

        // 3. Dam bao Cache Manager duoc load
        if (cacheManager) {
            // Redis tu connect ngam trong CacheManager, ioredis se tu log
        }
    } catch (error) {
        console.error('❌ [System Check] Error:', (error as Error).message);
    }

    console.log('----------------------\n');
};
