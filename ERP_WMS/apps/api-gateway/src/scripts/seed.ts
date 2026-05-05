import { Pool } from 'pg';
import { databaseConfig } from '@core/config';
import { hashPassword } from '@core/utils';

async function seed() {
    const pool = new Pool({
        host: databaseConfig.pg.host,
        port: databaseConfig.pg.port,
        user: databaseConfig.pg.user,
        password: databaseConfig.pg.password,
        database: databaseConfig.pg.database,
        ssl: databaseConfig.pg.ssl ? { rejectUnauthorized: false } : false,
    });

    // Helper to get or create a category UUID
    const getCategoryId = async (name: string, type: string) => {
        const res = await pool.query(
            `INSERT INTO categories (name, type, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (name, type) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [name, type, `Category for ${name}`]
        );
        return res.rows[0].id;
    };

    try {
        console.log('🌱 Starting business data seeding...');
        const password = await hashPassword('Password123');

        // 0. Get/Create necessary Categories
        console.log('  - Syncing Categories...');
        const statusActiveId = await getCategoryId('active', 'status');
        const modelOnlineId = await getCategoryId('online', 'teaching_model');
        const catMathId = await getCategoryId('Toán học', 'class_category');

        // 1. Create Teacher
        console.log('  - Creating Teacher User & Profile...');
        const teacherUserResult = await pool.query(
            `INSERT INTO "users" (username, email, hashed_password, role, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (email) DO UPDATE SET role = 'teacher'
             RETURNING id`,
            ['Teacher Nguyễn', 'teacher@example.com', password, 'teacher', true]
        );
        const userId = teacherUserResult.rows[0].id;
        
        const teacherResult = await pool.query(
            `INSERT INTO "teacher_profiles" (user_id, bio, experience)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [userId, 'Giáo viên toán nhiệt huyết', '5 năm kinh nghiệm']
        );
        const teacherId = teacherResult.rows[0].id;
        console.log(`    -> Created Teacher Profile ID: ${teacherId}`);

        // 2. Create Students
        console.log('  - Creating Student Users & Profiles...');
        const s1U = await pool.query(
            `INSERT INTO "users" (username, email, hashed_password, role, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (email) DO UPDATE SET role = 'student'
             RETURNING id`,
            ['Sinh viên A', 'student1@example.com', password, 'student', true]
        );
        const s2U = await pool.query(
            `INSERT INTO "users" (username, email, hashed_password, role, is_active)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (email) DO UPDATE SET role = 'student'
             RETURNING id`,
            ['Sinh viên B', 'student2@example.com', password, 'student', true]
        );
        const s1UserId = s1U.rows[0].id;
        const s2UserId = s2U.rows[0].id;

        const student1Result = await pool.query(
            `INSERT INTO "student_profiles" (user_id, school)
             VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW() RETURNING id`,
            [s1UserId, 'Trường THPT Chuyên']
        );
        const student2Result = await pool.query(
            `INSERT INTO "student_profiles" (user_id, school)
             VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW() RETURNING id`,
            [s2UserId, 'Trường THPT Năng Khiếu']
        );
        const student1Id = student1Result.rows[0].id;
        const student2Id = student2Result.rows[0].id;
        console.log(`    -> Created Students Profile IDs: ${student1Id}, ${student2Id}`);

        // 3. Create Class
        console.log('  - Creating Class...');
        const classResult = await pool.query(
            `INSERT INTO "classes" (name, description, owner_id, status, teaching_model, class_category_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            ['Lớp Toán 10 - Nâng cao', 'Khóa học toán chuyên sâu cho học sinh lớp 10', teacherId, statusActiveId, modelOnlineId, catMathId]
        );
        const classId = classResult.rows[0].id;
        console.log(`    -> Created Class ID: ${classId}`);

        // 4. Associate Teacher to Class
        console.log('  - Assigning Teacher to Class...');
        await pool.query(
            `INSERT INTO "teachers_classes" (teacher_id, class_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [teacherId, classId]
        );

        // 5. Enroll Students
        console.log('  - Enrolling Students...');
        await pool.query(
            `INSERT INTO "classes_students" (class_id, student_id, status)
             VALUES ($1, $2, $3), ($4, $5, $3)
             ON CONFLICT DO NOTHING`,
            [classId, student1Id, statusActiveId, classId, student2Id]
        );

        // 6. Create Lessons
        console.log('  - Creating Lessons...');
        await pool.query(
            `INSERT INTO "lessons" (class_id, teacher_id, title, description, order_index)
             VALUES 
             ($1, $2, $3, $4, $5),
             ($1, $2, $6, $7, $8),
             ($1, $2, $9, $10, $11)`,
            [
                classId, teacherId, 'Bài 1: Đại số cơ bản', 'Học về các biểu thức đại số', 1,
                'Bài 2: Hình học mặt phẳng', 'Học về các định lý hình học', 2,
                'Bài 3: Lượng giác', 'Làm quen với các hàm số lượng giác', 3
            ]
        );

        console.log('✅ Business data seeding completed successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        await pool.end();
    }
}

seed();
