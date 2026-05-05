import admin from 'firebase-admin';
import type { IDatabaseAdapter } from './base.adapter';
import { databaseConfig } from '@core/config';

interface FirebaseConnection {
    db: FirebaseFirestore.Firestore | null;
    auth: admin.auth.Auth | null;
    admin: typeof admin | null;
}

class FirebaseAdapter implements IDatabaseAdapter {
    private db: FirebaseFirestore.Firestore | null = null;
    private auth: admin.auth.Auth | null = null;
    private _admin: typeof admin | null = null;
    private _connected: boolean = false;

    connect(): FirebaseConnection {
        if (this._connected) {
            return { db: this.db, auth: this.auth, admin: this._admin };
        }

        try {
            console.log('🔄 Connecting to Firebase...');

            const serviceAccountStr = databaseConfig.credentials;
            if (!serviceAccountStr) {
                throw new Error('❌ MISSING FIREBASE_CREDENTIALS IN .ENV');
            }

            let serviceAccount: admin.ServiceAccount;
            try {
                serviceAccount = JSON.parse(serviceAccountStr) as admin.ServiceAccount;
            } catch {
                throw new Error('❌ FIREBASE_CREDENTIALS JSON IS INVALID');
            }

            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
            }

            this._admin = admin;
            this.db = admin.firestore();
            this.auth = admin.auth();
            this._connected = true;

            console.log('✅ Firebase Connected Successfully!');
            return { db: this.db, auth: this.auth, admin: this._admin };

        } catch (error) {
            console.error('🔥 Firebase Connection Failed:', error);
            this.db = null;
            this.auth = null;
            this._admin = null;
            this._connected = false;
            return { db: null, auth: null, admin: null };
        }
    }

    getDB(): FirebaseFirestore.Firestore | null {
        if (!this._connected) this.connect();
        return this.db;
    }

    getAuth(): admin.auth.Auth | null {
        if (!this._connected) this.connect();
        return this.auth;
    }

    async disconnect(): Promise<void> {
        if (!this._connected) return;
        await admin.app().delete();
        this.db = null;
        this.auth = null;
        this._admin = null;
        this._connected = false;
        console.log('🔌 Firebase Disconnected.');
    }

    isConnected(): boolean {
        return this._connected;
    }
}

export const firebaseAdapter = new FirebaseAdapter();
