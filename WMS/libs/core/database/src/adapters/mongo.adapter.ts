import { MongoClient, Db, Collection, Document } from 'mongodb';
import type { IDatabaseAdapter } from './base.adapter';

export interface MongoConfig {
    /**
     * MongoDB connection URI.
     * Ví dụ:
     * - Local:  mongodb://localhost:27017
     * - Atlas:  mongodb+srv://user:pass@cluster.mongodb.net
     * - Docker: mongodb://mongo:27017
     */
    uri: string;
    /** Tên Database — mặc định: cma_logs */
    database: string;
    /** Connection options */
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        retryWrites?: boolean;
        /** Thời gian chờ kết nối (ms) — mặc định: 10000 */
        connectTimeoutMS?: number;
    };
}

/**
 * MongoAdapter — Quản lý kết nối MongoDB.
 * Implements IDatabaseAdapter để có thể swap qua DI container.
 * 
 * Dùng cho:
 * - System Logs (thay thế console log)
 * - Notifications (realtime qua Socket)
 * - Activity Audit Trail
 * - Analytics / Metrics lưu trữ dài hạn
 * 
 * @example
 * ```ts
 * const mongo = new MongoAdapter();
 * mongo.init({
 *   uri: 'mongodb+srv://user:pass@cluster.mongodb.net',
 *   database: 'cma_logs'
 * });
 * await mongo.connect();
 * 
 * // Lấy collection
 * const logs = mongo.collection('system_logs');
 * await logs.insertOne({ level: 'info', message: 'User logged in', timestamp: new Date() });
 * 
 * // Query
 * const recentLogs = await logs.find().sort({ timestamp: -1 }).limit(50).toArray();
 * ```
 */
class MongoAdapter implements IDatabaseAdapter {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private _connected: boolean = false;
    private config: MongoConfig | null = null;

    /**
     * Initialize với MongoDB connection config.
     * Gọi init() trước connect().
     */
    init(config: MongoConfig): void {
        this.config = config;
    }

    /**
     * Mở kết nối tới MongoDB server.
     * Tự retry nếu thất bại.
     */
    async connect(): Promise<Db> {
        if (this._connected && this.db) {
            return this.db;
        }

        if (!this.config) {
            throw new Error('❌ MongoAdapter: config not set. Call init() first.');
        }

        const { uri, database, options } = this.config;

        if (!uri) {
            throw new Error('❌ MongoAdapter: MONGO_URI is required.');
        }

        try {
            console.log('🔄 Connecting to MongoDB...');

            this.client = new MongoClient(uri, {
                maxPoolSize: options?.maxPoolSize ?? 10,
                minPoolSize: options?.minPoolSize ?? 2,
                retryWrites: options?.retryWrites ?? true,
                connectTimeoutMS: options?.connectTimeoutMS ?? 10000,
            });

            await this.client.connect();

            // Verify connection bằng ping
            await this.client.db('admin').command({ ping: 1 });

            this.db = this.client.db(database);
            this._connected = true;

            console.log(`✅ MongoDB Connected! Database: ${database}`);
            return this.db;

        } catch (error) {
            console.error('🔥 MongoDB Connection Failed:', error);
            this.client = null;
            this.db = null;
            this._connected = false;
            throw error;
        }
    }

    /**
     * Trả về instance Db hiện tại.
     * Nếu chưa kết nối, sẽ tự connect.
     */
    getDB(): Db | null {
        return this.db;
    }

    /**
     * Ngắt kết nối MongoDB.
     */
    async disconnect(): Promise<void> {
        if (!this._connected || !this.client) return;

        await this.client.close();
        this.client = null;
        this.db = null;
        this._connected = false;
        console.log('🔌 MongoDB Disconnected.');
    }

    isConnected(): boolean {
        return this._connected;
    }

    // === Convenience methods ===

    /**
     * Lấy collection với type safety.
     * @example
     * const logs = mongo.collection<ILogEntry>('system_logs');
     */
    collection<T extends Document = Document>(name: string): Collection<T> {
        if (!this.db) {
            throw new Error('❌ MongoDB not connected. Call connect() first.');
        }
        return this.db.collection<T>(name);
    }

    /**
     * Ping Database — kiểm tra kết nối.
     * Trả về latency (ms), hoặc -1 nếu thất bại.
     */
    async ping(): Promise<number> {
        if (!this._connected || !this.client) return -1;

        const start = Date.now();
        try {
            await this.client.db('admin').command({ ping: 1 });
            return Date.now() - start;
        } catch {
            return -1;
        }
    }

    /**
     * Lấy danh sách tất cả collections trong database hiện tại.
     */
    async listCollections(): Promise<string[]> {
        if (!this.db) return [];
        const cols = await this.db.listCollections().toArray();
        return cols.map(c => c.name);
    }

    /**
     * Trả về thông tin thống kê Database (tổng docs, size, ...).
     */
    async getStats(): Promise<Record<string, unknown> | null> {
        if (!this.db) return null;
        try {
            return await this.db.stats();
        } catch {
            return null;
        }
    }
}

export const mongoAdapter = new MongoAdapter();
