import { Pool } from 'pg';
import { hashPassword } from '@core/utils';

const SEED_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SEED_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD;

/**
 * Seed Super Admin into PostgreSQL (new schema: username, hashed_password, is_active)
 */
export const seedSuperAdminPostgres = async (pool: Pool): Promise<void> => {
    try {
        console.log('🌱 [Postgres] Checking system for Super Admin...');

        if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
            console.log('⚠️ ADMIN_EMAIL / ADMIN_DEFAULT_PASSWORD is missing. Skipping admin seed.');
            return;
        }

        // Check if admin exists
        const existing = await pool.query(
            `SELECT id FROM "users" WHERE role = 'admin' LIMIT 1`
        );

        if (existing.rows.length > 0) {
            console.log('✅ Super Admin already exists. Skipping seed.');
            return;
        }

        console.log('⚠️ No Admin found. Creating default Super Admin...');

        const hashedPassword = await hashPassword(SEED_ADMIN_PASSWORD);

        await pool.query(
            `INSERT INTO "users" (username, email, hashed_password, role, is_active)
             VALUES ($1, $2, $3, $4, $5)`,
            ['System Administrator', SEED_ADMIN_EMAIL, hashedPassword, 'admin', true]
        );

        console.log('🎉 Super Admin created successfully!');
        console.log(`👉 Email: ${SEED_ADMIN_EMAIL}`);
        console.log('⚠️ Default password was set from ADMIN_DEFAULT_PASSWORD. Please login and change it immediately.');

    } catch (error) {
        console.error('❌ [Postgres] Seeding failed:', error);
    }
};
