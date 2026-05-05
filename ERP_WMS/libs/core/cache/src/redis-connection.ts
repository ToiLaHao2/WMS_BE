import Redis from 'ioredis';
import { cacheConfig } from '@core/config';

/**
 * Factory tao ioredis client voi config da chuan hoa.
 * File nay KHONG khoi tao bat ky singleton nao.
 */
export function createRedisConnection(extraOptions: Record<string, unknown> = {}, label: string = '[Redis]'): Redis | null {
    const { host, port, password } = cacheConfig;

    if (!host) {
        console.warn(`⚠️  ${label} No REDIS_HOST configured, skipping Redis connection.`);
        return null;
    }

    const options: Record<string, unknown> = {
        host,
        port,
        password,
        lazyConnect: true,
        showFriendlyErrorStack: false,
        retryStrategy: (times: number) => {
            if (times > 3) return null;
            return Math.min(times * 500, 2000);
        },
        ...extraOptions,
    };

    if (typeof host === 'string' && host.includes('upstash')) {
        options.tls = {};
    }

    const client = new Redis(options as import('ioredis').RedisOptions);

    let _errorLogged = false;
    client.on('error', (err: Error) => {
        if (!_errorLogged) {
            _errorLogged = true;
            console.error(`\n❌ ${label} Redis connection failed: ${err.message}`);
            console.warn(`⚠️  ${label} Falling back to degraded mode (no Redis).\n`);
        }
    });
    client.on('ready', () => {
        _errorLogged = false;
        console.log(`✅ ${label} Redis connected.`);
    });

    return client;
}
