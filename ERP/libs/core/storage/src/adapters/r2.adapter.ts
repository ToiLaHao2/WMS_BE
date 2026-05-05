import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { IStorageProvider, UploadResult } from '../interfaces';

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    /** 
     * Cloudflare R2 public URL. Ví dụ:
     * - Custom domain: https://cdn.yourdomain.com
     * - R2.dev subdomain: https://<bucket>.r2.dev
     */
    publicUrl?: string;
}

/**
 * CloudflareR2Adapter — Sử dụng AWS S3 SDK (S3-compatible API).
 * 
 * Cloudflare R2 tương thích 100% S3 API nên ta dùng @aws-sdk/client-s3.
 * Free Tier: 10 GB storage, 10M Class A ops, 1M Class B ops.
 * 
 * @example
 * ```ts
 * const r2 = new CloudflareR2Adapter();
 * r2.init({
 *   accountId: 'your-cf-account-id',
 *   accessKeyId: 'your-r2-access-key',
 *   secretAccessKey: 'your-r2-secret',
 *   bucketName: 'cma-storage',
 *   publicUrl: 'https://cdn.yourapp.com'
 * });
 * r2.connect();
 * const result = await r2.uploadImageFromBuffer(buffer, 'avatars');
 * ```
 */
export class CloudflareR2Adapter implements IStorageProvider {
    private client: S3Client | null = null;
    private _connected: boolean = false;
    private config: R2Config | null = null;
    public readonly providerName = 'cloudflare_r2';

    /**
     * Initialize with Cloudflare R2 credentials.
     * Gọi init() trước connect().
     */
    init(config: R2Config): void {
        this.config = config;
    }

    /**
     * Tạo S3Client kết nối tới endpoint R2 của Cloudflare.
     */
    connect(): void {
        if (this._connected && this.client) return;

        if (!this.config) {
            throw new Error('❌ CloudflareR2Adapter: config not set. Call init() first.');
        }

        const { accountId, accessKeyId, secretAccessKey } = this.config;

        if (!accountId || !accessKeyId || !secretAccessKey) {
            console.warn('⚠️ Cloudflare R2 config is missing. Upload will fail.');
            return;
        }

        this.client = new S3Client({
            region: 'auto', // R2 luôn dùng 'auto'
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });

        this._connected = true;
        console.log('✅ Cloudflare R2 Client Configured Successfully!');
    }

    isConnected(): boolean {
        return this._connected;
    }

    /**
     * Upload ảnh từ Buffer lên R2 bucket.
     * Key format: {folder}/{uuid}.{ext}
     */
    async uploadImageFromBuffer(buffer: Buffer, folder: string = 'cma_images'): Promise<UploadResult> {
        if (!this._connected || !this.client) this.connect();
        if (!this.client || !this.config) throw new Error('R2 Client not initialized');

        const key = `${folder}/${uuidv4()}.webp`;

        await this.client.send(new PutObjectCommand({
            Bucket: this.config.bucketName,
            Key: key,
            Body: buffer,
            ContentType: 'image/webp',
        }));

        return {
            url: this.buildPublicUrl(key),
            publicId: key,
            provider: this.providerName,
        };
    }

    /**
     * Upload bất kỳ file nào (PDF, DOCX, MP4, ...) từ Buffer lên R2.
     * Giữ tên gốc (sanitize) để dễ tìm kiếm.
     */
    async uploadFileFromBuffer(
        buffer: Buffer,
        originalName: string,
        mimeType: string,
        folder: string = 'cma_files'
    ): Promise<UploadResult> {
        if (!this._connected || !this.client) this.connect();
        if (!this.client || !this.config) throw new Error('R2 Client not initialized');

        // Sanitize filename: giữ lại ext, thay tên bằng uuid để tránh trùng
        const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
        const safeName = `${uuidv4()}.${ext}`;
        const key = `${folder}/${safeName}`;

        await this.client.send(new PutObjectCommand({
            Bucket: this.config.bucketName,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
            Metadata: {
                'original-name': encodeURIComponent(originalName),
            },
        }));

        return {
            url: this.buildPublicUrl(key),
            publicId: key,
            provider: this.providerName,
        };
    }

    /**
     * Xóa file bằng key (publicId chính là key trên R2).
     */
    async deleteFile(publicId: string): Promise<boolean> {
        if (!this._connected || !this.client) this.connect();
        if (!this.client || !this.config) throw new Error('R2 Client not initialized');

        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.config.bucketName,
                Key: publicId,
            }));
            return true;
        } catch (err) {
            console.error('❌ R2 Delete Error:', err);
            return false;
        }
    }

    /**
     * Stream download file từ R2 (hữu ích cho proxy download).
     */
    async getFileStream(key: string): Promise<Readable | null> {
        if (!this._connected || !this.client) this.connect();
        if (!this.client || !this.config) return null;

        try {
            const response = await this.client.send(new GetObjectCommand({
                Bucket: this.config.bucketName,
                Key: key,
            }));
            return response.Body as Readable;
        } catch (err) {
            console.error('❌ R2 GetObject Error:', err);
            return null;
        }
    }

    /**
     * Build public URL cho file đã upload.
     * Ưu tiên custom domain, fallback sang r2.dev subdomain.
     */
    private buildPublicUrl(key: string): string {
        if (this.config?.publicUrl) {
            // Custom domain: https://cdn.yourapp.com/avatars/uuid.webp
            return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
        }
        // Fallback: R2 dev subdomain (cần bật trên Cloudflare Dashboard)
        return `https://${this.config?.bucketName}.r2.dev/${key}`;
    }
}

/**
 * Singleton instance — init & connect sẽ được gọi từ DI container.
 */
export const r2Adapter = new CloudflareR2Adapter();
