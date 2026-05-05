// Enable combo mode before any imports so standalone listeners are bypassed
process.env.COMBO_MODE = 'true';

import { app } from './app';
import { bootstrapSocket } from '../../socket/src/socket';
import * as http from 'http';
import { appConfig } from '@core/config';
import { postgresAdapter } from '@core/database';
import { runMigrations, setupGracefulShutdown } from '@core/shared';

const PORT = appConfig.port;

async function startComboServer() {
    console.log(`\n===============================================`);
    console.log(`🌟 STARTING COMBO SERVER 🌟`);
    console.log(`===============================================`);

    try {
        // === STEP 1: Run all DB migrations sequentially before anything else ===
        // This guarantees FK dependencies are satisfied (no race condition).
        const pool = postgresAdapter.getDB();
        if (pool) {
            await runMigrations(pool);
        } else {
            console.error('❌ [Startup] PostgreSQL pool not available. Aborting migrations.');
            process.exit(1);
        }

        // === STEP 2: Create HTTP server and attach Socket.io ===
        const server = http.createServer(app);
        await bootstrapSocket(server);

        // === STEP 3: Start listening ===
        server.listen(PORT, () => {
             console.log(`🚀 API Gateway running at: http://localhost:${PORT}`);
             console.log(`📖 Swagger UI running at: http://localhost:${PORT}/docs`);
             console.log(`🔌 Socket Server gracefully attached to port ${PORT} `);
             console.log(`✅ [Combo] Architecture successfully merged on 1 Port`);
             console.log(`===============================================\n`);
        });

        // === STEP 4: Register graceful shutdown to avoid race conditions on exit ===
        setupGracefulShutdown(server, {
            pgPool: pool,
            label: 'ComboServer',
        });

    } catch (err) {
        console.error("❌ Failed to start combo server:", err);
        process.exit(1);
    }
}

startComboServer();
