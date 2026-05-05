import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { IDatabaseAdapter } from './base.adapter';

export interface PostgresConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    max?: number; // max pool connections
}

/**
 * PostgresAdapter — Manages a pg Pool connection.
 * Implements IDatabaseAdapter so it can be swapped with Firebase via DI.
 */
class PostgresAdapter implements IDatabaseAdapter {
    private pool: Pool | null = null;
    private _connected: boolean = false;
    private config: PostgresConfig | null = null;

    /**
     * Initialize with config. Call this before connect().
     */
    init(config: PostgresConfig): void {
        this.config = config;
    }

    connect(): Pool {
        if (this._connected && this.pool) {
            return this.pool;
        }

        if (!this.config) {
            throw new Error('❌ PostgresAdapter: config not set. Call init() first.');
        }

        try {
            console.log('🔄 Connecting to PostgreSQL...');

            this.pool = new Pool({
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                user: this.config.user,
                password: this.config.password,
                ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
                max: this.config.max ?? 20,
            });

            // Verify connection
            this.pool.on('error', (err) => {
                console.error('🔥 PostgreSQL Pool Error:', err.message);
            });

            this._connected = true;
            console.log('✅ PostgreSQL Pool Created Successfully!');
            return this.pool;

        } catch (error) {
            console.error('🔥 PostgreSQL Connection Failed:', error);
            this.pool = null;
            this._connected = false;
            throw error;
        }
    }

    getDB(): Pool | null {
        if (!this._connected) this.connect();
        return this.pool;
    }

    async disconnect(): Promise<void> {
        if (!this._connected || !this.pool) return;
        await this.pool.end();
        this.pool = null;
        this._connected = false;
        console.log('🔌 PostgreSQL Disconnected.');
    }

    isConnected(): boolean {
        return this._connected;
    }

    // === Convenience methods for raw queries ===

    async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
        const pool = this.getDB();
        if (!pool) throw new Error('PostgreSQL pool is not initialized');
        return pool.query<T>(text, params);
    }

    async getClient(): Promise<PoolClient> {
        const pool = this.getDB();
        if (!pool) throw new Error('PostgreSQL pool is not initialized');
        return pool.connect();
    }
}

export const postgresAdapter = new PostgresAdapter();
