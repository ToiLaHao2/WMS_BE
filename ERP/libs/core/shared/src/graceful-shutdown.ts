import * as http from 'http';
import { Pool } from 'pg';

/**
 * Graceful Shutdown Handler
 *
 * Vấn đề nếu KHÔNG có graceful shutdown:
 * - PostgreSQL pool: các query đang chạy dở sẽ bị cut off đột ngột → data corruption
 * - Socket.io: client không nhận được disconnect event → zombie connections
 * - Race condition khi tắt: nếu có request đang được xử lý cùng lúc với lệnh shutdown
 *   thì response sẽ không bao giờ được gửi về client
 *
 * Giải pháp:
 * 1. Bắt SIGTERM / SIGINT / uncaughtException
 * 2. Dừng nhận request mới (server.close)
 * 3. Đợi các request đang xử lý hoàn thành (timeout 10s)
 * 4. Đóng kết nối Database/Cache
 * 5. process.exit(0)
 */
export function setupGracefulShutdown(
    server: http.Server,
    dependencies: {
        pgPool?: Pool;
        label?: string;
    } = {}
): void {
    const { pgPool, label = 'Server' } = dependencies;
    let isShuttingDown = false;

    async function shutdown(signal: string): Promise<void> {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`\n🛑 [${label}] ${signal} received. Starting graceful shutdown...`);

        // Timeout bảo vệ: nếu sau 10s vẫn chưa xong, force exit
        const forceExit = setTimeout(() => {
            console.error(`❌ [${label}] Graceful shutdown timed out after 10s. Force exiting.`);
            process.exit(1);
        }, 10_000);

        try {
            // 1. Ngừng nhận request mới
            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log(`  ✅ [${label}] HTTP server closed (no new requests accepted).`);

            // 2. Đóng PostgreSQL Pool — chờ tất cả query đang chạy hoàn thành
            if (pgPool) {
                await pgPool.end();
                console.log('  ✅ [Postgres] Connection pool drained.');
            }

            clearTimeout(forceExit);
            console.log(`✅ [${label}] Graceful shutdown complete.\n`);
            process.exit(0);
        } catch (err) {
            console.error(`❌ [${label}] Error during shutdown:`, err);
            clearTimeout(forceExit);
            process.exit(1);
        }
    }

    // Ctrl+C from terminal (dev)
    process.on('SIGINT',  () => shutdown('SIGINT'));
    // kill <pid> or Docker/k8s stop signal (production)
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Bắt lỗi không được xử lý để tránh process crash đột ngột không có log
    process.on('uncaughtException', (err) => {
        console.error('🔥 [CRITICAL] Uncaught Exception:', err.message, err.stack);
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
        console.error('🔥 [CRITICAL] Unhandled Promise Rejection:', reason);
        // Không shutdown ngay — chỉ log để debug (có thể upgrade lên shutdown nếu cần)
    });

    console.log(`🛡️  [${label}] Graceful shutdown handlers registered (SIGINT, SIGTERM).`);
}
