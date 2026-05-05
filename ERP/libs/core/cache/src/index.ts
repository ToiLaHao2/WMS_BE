import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { cacheConfig } from '@core/config';

/**
 * CacheManager — Singleton: Redis (primary) + LRU Memory (fallback).
 */
class CacheManager {
    private memoryCache: LRUCache<string, NonNullable<unknown>>;
    private redisClient: Redis | null = null;
    private useRedis: boolean = false;
    private _promptShown: boolean = false;

    constructor() {
        this.memoryCache = new LRUCache<string, NonNullable<unknown>>({
            max: 500,
            ttl: 1000 * 60 * 60, // 1h
        });
        this.initRedis();
    }

    private initRedis(): void {
        const { host, port, password } = cacheConfig;

        if (!host) {
            console.log('⚠️  No REDIS_HOST in env, using In-Memory Cache only.');
            return;
        }

        console.log('🔄 Connecting to Redis...');

        const MAX_RETRIES = 3;
        let errorLogged = false;

        const redisOptions: Record<string, unknown> = {
            host,
            port,
            password,
            lazyConnect: true,
            showFriendlyErrorStack: false,
            maxRetriesPerRequest: null, // Required by BullMQ & recommended for custom retryStrategy
            retryStrategy: (times: number) => {
                if (times > MAX_RETRIES) return null;
                return Math.min(times * 500, 2000);
            },
        };

        if (typeof host === 'string' && host.includes('upstash')) {
            console.log('🔒 Redis TLS Enabled (Upstash Detected)');
            redisOptions.tls = {};
        }

        this.redisClient = new Redis(redisOptions as import('ioredis').RedisOptions);

        this.redisClient.connect().catch(() => {
            // Error handled by event listeners below
        });

        this.redisClient.on('error', (err: Error) => {
            this.useRedis = false;
            if (!errorLogged) {
                errorLogged = true;
                console.error(`\n❌ [Cache] Redis connection failed: ${err.message}`);
            }
        });

        this.redisClient.on('ready', () => {
            console.log('✅ Redis Connected Successfully!');
            this.useRedis = true;
            errorLogged = false;
        });

        this.redisClient.on('close', () => {
            if (!this.useRedis && !this._promptShown) {
                this._promptShown = true;
                this._promptFallback();
            }
        });
    }

    private _promptFallback(): void {
        process.stdout.write(
            '\n⚠️  Redis is unavailable after multiple retries.\n' +
            '   [1] Continue with In-Memory cache (data lost on restart)\n' +
            '   [2] Exit and fix Redis config\n' +
            'Your choice (1/2): '
        );

        if (!process.stdin.isTTY) {
            console.log('\n[Auto] Non-interactive mode: using In-Memory cache.');
            this.useRedis = false;
            return;
        }

        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.once('data', (input: string) => {
            process.stdin.pause();
            const choice = input.trim();
            if (choice === '2') {
                console.log('\n👋 Exiting. Please fix your Redis configuration.');
                process.exit(0);
            } else {
                console.log('\n✅ Using In-Memory cache. All data will be lost on restart.\n');
                this.useRedis = false;
            }
        });
    }

    connect(): { redis: Redis | null; memory: LRUCache<string, NonNullable<unknown>>; isReady: boolean } {
        return {
            redis: this.useRedis ? this.redisClient : null,
            memory: this.memoryCache,
            isReady: true
        };
    }

    getRedisClient(): Redis | null {
        return this.redisClient;
    }

    async get<T = unknown>(key: string): Promise<T | null> {
        try {
            if (this.useRedis && this.redisClient?.status === 'ready') {
                const data = await this.redisClient.get(key);
                return data ? JSON.parse(data) as T : null;
            }
        } catch (error) {
            console.warn(`⚠️ Cache GET failed for "${key}" (Redis), trying Memory.`, (error as Error).message);
        }
        return (this.memoryCache.get(key) as T) ?? null;
    }

    async set(key: string, value: unknown, ttlSeconds: number = 3600): Promise<void> {
        const dataStr = JSON.stringify(value);
        try {
            if (this.useRedis && this.redisClient?.status === 'ready') {
                await this.redisClient.set(key, dataStr, 'EX', ttlSeconds);
                return;
            }
        } catch (error) {
            console.warn(`⚠️ Cache SET failed for "${key}" (Redis), using Memory.`, (error as Error).message);
        }
        this.memoryCache.set(key, value as NonNullable<unknown>, { ttl: ttlSeconds * 1000 });
    }

    async del(key: string): Promise<void> {
        try {
            if (this.useRedis && this.redisClient?.status === 'ready') {
                await this.redisClient.del(key);
            }
        } catch {
            console.warn(`⚠️ Cache DEL failed for "${key}" (Redis).`);
        }
        this.memoryCache.delete(key);
    }

    async flush(): Promise<void> {
        try {
            if (this.useRedis && this.redisClient?.status === 'ready') {
                await this.redisClient.flushdb();
            }
        } catch {
            console.warn('⚠️ Cache FLUSH failed (Redis).');
        }
        this.memoryCache.clear();
    }
}

export const cacheManager = new CacheManager();
