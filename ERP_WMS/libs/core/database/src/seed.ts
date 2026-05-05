import admin from 'firebase-admin';
import { hashPassword } from '@core/utils';

const SEED_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SEED_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD;

export const seedSuperAdmin = async (db: FirebaseFirestore.Firestore, adminSdk: typeof admin): Promise<void> => {
    try {
        console.log('🌱 Checking system for Super Admin...');

        if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
            console.log('⚠️ ADMIN_EMAIL / ADMIN_DEFAULT_PASSWORD is missing. Skipping admin seed.');
            return;
        }

        const snapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();

        if (!snapshot.empty) {
            console.log('✅ Super Admin already exists. Skipping seed.');
            return;
        }

        console.log('⚠️ No Admin found. Creating default Super Admin...');

        let userRecord: admin.auth.UserRecord;
        try {
            userRecord = await adminSdk.auth().getUserByEmail(SEED_ADMIN_EMAIL!);
        } catch {
            userRecord = await adminSdk.auth().createUser({
                email: SEED_ADMIN_EMAIL,
                password: SEED_ADMIN_PASSWORD,
                displayName: 'System Administrator',
                emailVerified: true
            });
        }

        const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);

        const adminData = {
            email: SEED_ADMIN_EMAIL,
            fullName: 'System Administrator',
            passwordHash,
            role: 'admin',
            mustChangePassword: true,
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await db.collection('users').doc(userRecord.uid).set(adminData);

        console.log('🎉 Super Admin created successfully!');
        console.log(`👉 Email: ${SEED_ADMIN_EMAIL}`);
        console.log('⚠️ Default password was set from ADMIN_DEFAULT_PASSWORD. Please login and change it immediately.');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
    }
};
