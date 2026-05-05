import { Pool } from 'pg';

// Import tất cả migration theo thứ tự dependency đúng
import { USERS_MIGRATION } from '../../../modules/users/src/user.migration';
import { CATEGORIES_MIGRATION, CATEGORIES_SEED } from '../../../modules/categories/src/category.migration';
import { PROFILES_MIGRATION } from '../../../modules/profiles/src/profiles.migration';
import { CLASSES_MIGRATION } from '../../../modules/classes/src/classes.migration';
import { ATTACHMENTS_MIGRATION } from '../../../modules/attachments/src/attachments.migration';
import { ASSIGNMENTS_MIGRATION } from '../../../modules/assignments/src/assignments.migration';
import { SCHEDULES_MIGRATION } from '../../../modules/schedules/src/schedules.migration';
import { NOTIFICATIONS_MIGRATION } from '../../../modules/notifications/src/notifications.migration';

/**
 * Ordered Migration Steps
 * 
 * Thứ tự tuần tự tránh FK violation:
 *   1. users           — bảng gốc, không FK nào
 *   2. categories      — bảng lookup, không FK nào
 *   3. profiles        — FK → users, categories
 *   4. classes         — FK → teacher_profiles, categories
 *   5. attachments     — FK → users (uploaded_by)
 *   6. assignments     — FK → classes, teacher_profiles, student_profiles, categories
 *   7. schedules       — FK → classes, student_profiles, categories
 *   8. notifications   — FK → users
 */
const MIGRATION_STEPS: Array<{ name: string; sql: string; seedSql?: string }> = [
    { name: 'users',         sql: USERS_MIGRATION },
    { name: 'categories',    sql: CATEGORIES_MIGRATION, seedSql: CATEGORIES_SEED },
    { name: 'profiles',      sql: PROFILES_MIGRATION },
    { name: 'classes',       sql: CLASSES_MIGRATION },
    { name: 'attachments',   sql: ATTACHMENTS_MIGRATION },
    { name: 'assignments',   sql: ASSIGNMENTS_MIGRATION },
    { name: 'schedules',     sql: SCHEDULES_MIGRATION },
    { name: 'notifications', sql: NOTIFICATIONS_MIGRATION },
];

/**
 * runMigrations — Chạy tất cả bảng theo thứ tự tuần tự (sequential await).
 * Đảm bảo FK constraint không bao giờ bị vi phạm.
 *
 * Gọi 1 lần duy nhất từ `combo.ts` / `server.ts` trước khi server nhận request.
 */
export async function runMigrations(pool: Pool): Promise<void> {
    console.log('\n🗄️  [Migration] Starting sequential database migrations...');
    console.log('─'.repeat(55));

    for (const step of MIGRATION_STEPS) {
        try {
            await pool.query(step.sql);
            console.log(`  ✅ [${step.name.padEnd(14)}] Tables ready.`);

            // Chạy seed nếu có (chỉ dùng INSERT ... ON CONFLICT DO NOTHING)
            if (step.seedSql) {
                await pool.query(step.seedSql);
                console.log(`  🌱 [${step.name.padEnd(14)}] Default data seeded.`);
            }
        } catch (err) {
            const error = err as Error;
            // Lỗi critical (users/categories) thì throw để dừng server
            if (step.name === 'users' || step.name === 'categories') {
                console.error(`  ❌ [${step.name}] CRITICAL migration failed: ${error.message}`);
                throw new Error(`Critical migration failed at step [${step.name}]: ${error.message}`);
            }
            // Lỗi ở bảng phụ: log cảnh báo và tiếp tục để server vẫn khởi động
            console.warn(`  ⚠️  [${step.name.padEnd(14)}] Non-critical migration warning: ${error.message}`);
        }
    }

    console.log('─'.repeat(55));
    console.log('✅ [Migration] All migrations completed successfully.\n');
}
