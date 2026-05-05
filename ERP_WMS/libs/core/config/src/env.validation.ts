import { z } from 'zod';
import dotenv from 'dotenv';
import { join } from 'path';

// Load .env tu thu muc goc cua monorepo
dotenv.config({ path: join(__dirname, '../../../../.env') });

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000').transform(Number),

    JWT_SECRET: z.string().min(10, 'JWT_SECRET is required and must be at least 10 chars'),

    // Firebase (optional now — only needed if using Firebase adapter)
    FIREBASE_CREDENTIALS: z.string().optional(),

    // PostgreSQL
    PG_HOST: z.string().default('localhost'),
    PG_PORT: z.string().default('5432').transform(Number),
    PG_DATABASE: z.string().default('cma_db'),
    PG_USER: z.string().default('postgres'),
    PG_PASSWORD: z.string().default(''),
    PG_SSL: z.string().default('false').transform(val => val === 'true'),

    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.string().transform(val => val ? Number(val) : undefined).optional(),
    REDIS_PASSWORD: z.string().optional(),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    STORAGE_PROVIDER: z.enum(['local', 'cloudflare_r2', 'cloudinary', 'aws_s3']).default('local'),

    // Cloudflare R2 (optional — only when STORAGE_PROVIDER=cloudflare_r2)
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.string().optional(),

    // MongoDB (optional — for Logs, Notifications, Analytics)
    MONGO_URI: z.string().optional(),
    MONGO_DATABASE: z.string().default('cma_logs'),

    RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),    // 15 minutes
    RATE_LIMIT_MAX: z.string().default('100').transform(Number),
    RATE_LIMIT_AUTH_MAX: z.string().default('10').transform(Number),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Environment (.env) is MISSING or INVALID:');
    _env.error.issues.forEach(issue => {
        console.error(`  - Field: ${issue.path.join('.')} | Error: ${issue.message}`);
    });
    console.error('⚠️ Please update .env before restarting the server.');
    process.exit(1);
}

const envVars = _env.data;

// === Typed Config Exports ===

export const appConfig = {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
} as const;

export const securityConfig = {
    jwtSecret: envVars.JWT_SECRET,
} as const;

export const databaseConfig = {
    // Firebase (legacy/optional)
    credentials: envVars.FIREBASE_CREDENTIALS,
    // PostgreSQL
    pg: {
        host: envVars.PG_HOST,
        port: envVars.PG_PORT,
        database: envVars.PG_DATABASE,
        user: envVars.PG_USER,
        password: envVars.PG_PASSWORD,
        ssl: envVars.PG_SSL,
    },
} as const;

export const cacheConfig = {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    password: envVars.REDIS_PASSWORD,
} as const;

/**
 * Free-tier storage limits (GB) per provider.
 * Khi đổi STORAGE_PROVIDER trong .env, hệ thống tự biết giới hạn tương ứng.
 * - local: chạy dev không giới hạn thực tế, đặt mốc 5GB làm chuẩn monitoring
 * - cloudflare_r2: Free 10 GB/tháng
 * - cloudinary: Free 25 GB bandwidth nhưng chỉ ~10 GB storage
 * - aws_s3: Free 5 GB (12 tháng đầu)
 */
const PROVIDER_STORAGE_LIMITS_GB: Record<string, number> = {
    local: 5,
    cloudflare_r2: 10,
    cloudinary: 10,
    aws_s3: 5,
};

export const storageConfig = {
    provider: envVars.STORAGE_PROVIDER,
    cloudName: envVars.CLOUDINARY_CLOUD_NAME,
    apiKey: envVars.CLOUDINARY_API_KEY,
    apiSecret: envVars.CLOUDINARY_API_SECRET,
    /** Giới hạn lưu trữ tự động tra theo provider — không cần ghi cứng */
    storageLimitGb: PROVIDER_STORAGE_LIMITS_GB[envVars.STORAGE_PROVIDER] ?? 5,
} as const;

export const r2Config = {
    accountId: envVars.R2_ACCOUNT_ID,
    accessKeyId: envVars.R2_ACCESS_KEY_ID,
    secretAccessKey: envVars.R2_SECRET_ACCESS_KEY,
    bucketName: envVars.R2_BUCKET_NAME,
    publicUrl: envVars.R2_PUBLIC_URL,
} as const;

export const mongoConfig = {
    uri: envVars.MONGO_URI,
    database: envVars.MONGO_DATABASE,
} as const;

export const rateLimitConfig = {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    max: envVars.RATE_LIMIT_MAX,
    authMax: envVars.RATE_LIMIT_AUTH_MAX,
} as const;
