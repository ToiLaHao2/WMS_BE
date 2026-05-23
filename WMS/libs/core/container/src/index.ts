import { createContainer, InjectionMode, asValue } from 'awilix';
import { postgresAdapter } from '@core/database';
import { mongoAdapter } from '@core/database';
import { databaseConfig, storageConfig, r2Config, mongoConfig } from '@core/config';
import { cacheManager } from '@core/cache';
import { cloudinaryAdapter, r2Adapter, IStorageProvider } from '@core/storage';
import { logger } from '@core/logger';
import { eventBus } from '@core/shared';
import { MesGrpcClient } from '@core/contracts/mes-grpc.client';
import { AgvGrpcClient } from '@core/contracts/agv-grpc.client';
import { Queue } from 'bullmq';

// 1. Initialize PostgreSQL
postgresAdapter.init({
    host: databaseConfig.pg.host,
    port: databaseConfig.pg.port,
    database: databaseConfig.pg.database,
    user: databaseConfig.pg.user,
    password: databaseConfig.pg.password,
    ssl: databaseConfig.pg.ssl,
});
postgresAdapter.connect();

// 2. Initialize Cloudflare R2 (Required if provider is r2)
if (r2Config.accountId && r2Config.accessKeyId) {
    r2Adapter.init({
        accountId: r2Config.accountId,
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey!,
        bucketName: r2Config.bucketName!,
        publicUrl: r2Config.publicUrl,
    });
    // connection is lazy so we don't need to await here
}

// 3. Initialize MongoDB (Optional/Async)
if (mongoConfig.uri) {
    mongoAdapter.init({
        uri: mongoConfig.uri,
        database: mongoConfig.database,
    });
    mongoAdapter.connect()
        .then(() => console.log('✅ [DI] MongoDB connected successfully.'))
        .catch(err => console.error('❌ [DI] MongoDB connection failed:', err.message));
}

// Select storage provider based on config
const storageProvider: IStorageProvider = storageConfig.provider === 'cloudflare_r2' 
    ? r2Adapter 
    : cloudinaryAdapter;

// Define the shape of our core dependencies
export interface ICradle {
    db: typeof postgresAdapter;
    mongoDb: typeof mongoAdapter;
    cache: typeof cacheManager;
    storage: IStorageProvider;
    logger: typeof logger;
    eventBus: typeof eventBus;
    mesGrpcClient: MesGrpcClient;
    agvGrpcClient: AgvGrpcClient;
    systemQueue: Queue;
    // Allow dynamic registration for business services later
    [key: string]: any;
}

/**
 * Global Dependency Injection Container
 */
export const container = createContainer<ICradle>({
    injectionMode: InjectionMode.PROXY,
});

// Define systemQueue
let systemQueue: Queue | null = null;
if (postgresAdapter) {
    const redisClient = cacheManager.getRedisClient();
    if (redisClient) {
        systemQueue = new Queue('system-queue', { connection: redisClient as any });
    }
}

// Register Core Infrastructure (Singletons)
container.register({
    db: asValue(postgresAdapter),
    mongoDb: asValue(mongoAdapter),
    cache: asValue(cacheManager),
    storage: asValue(storageProvider),
    logger: asValue(logger),
    eventBus: asValue(eventBus),
    mesGrpcClient: asValue(new MesGrpcClient()),
    agvGrpcClient: asValue(new AgvGrpcClient()),
    // Queue setup
    systemQueue: asValue(systemQueue as Queue),
});

console.log('📦 [DI] Core Container initialized with Awilix.');

export function getContainer() {
    return container;
}
