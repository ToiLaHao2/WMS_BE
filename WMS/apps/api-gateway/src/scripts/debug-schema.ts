import { Pool } from 'pg';
import { databaseConfig } from '@core/config';

async function inspect() {
    const pool = new Pool({
        host: databaseConfig.pg.host,
        port: databaseConfig.pg.port,
        user: databaseConfig.pg.user,
        password: databaseConfig.pg.password,
        database: databaseConfig.pg.database,
        ssl: databaseConfig.pg.ssl ? { rejectUnauthorized: false } : false,
    });

    try {
        const res = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'classes'
            ORDER BY ordinal_position;
        `);
        console.log('--- Classes Table Schema ---');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

inspect();
