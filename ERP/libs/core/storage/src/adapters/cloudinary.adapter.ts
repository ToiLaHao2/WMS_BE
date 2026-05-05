import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { storageConfig } from '@core/config';
import { IStorageProvider, UploadResult } from '../interfaces';

export class CloudinaryAdapter implements IStorageProvider {
    private _connected: boolean = false;
    public readonly providerName = 'cloudinary';

    public connect(): void {
        if (this._connected) return;

        const { cloudName, apiKey, apiSecret } = storageConfig;

        if (!cloudName || !apiKey || !apiSecret) {
            console.warn('⚠️ Cloudinary config is missing. Upload will fail.');
            return;
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
        });

        this._connected = true;
        console.log('✅ Cloudinary Configured Successfully!');
    }

    async uploadImageFromBuffer(buffer: Buffer, folder: string = 'cma_general'): Promise<UploadResult> {
        if (!this._connected) this.connect();

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder, resource_type: 'image' },
                (error, result) => {
                    if (error) return reject(error);
                    const res = result as UploadApiResponse;
                    resolve({
                        url: res.secure_url,
                        publicId: res.public_id,
                        width: res.width,
                        height: res.height,
                        provider: this.providerName
                    });
                }
            );

            const bufferStream = new Readable();
            bufferStream.push(buffer);
            bufferStream.push(null);
            bufferStream.pipe(uploadStream);
        });
    }

    async uploadFileFromBuffer(buffer: Buffer, originalName: string, mimeType: string, folder: string = 'cma_files'): Promise<UploadResult> {
        if (!this._connected) this.connect();
        
        // Cloudinary tự động check mimeType qua resource_type: 'auto'
        return new Promise((resolve, reject) => {
            const publicId = (typeof originalName === 'string' && originalName.includes('.')) 
                ? originalName.split('.')[0] 
                : `file_${Date.now()}`;

            const uploadStream = cloudinary.uploader.upload_stream(
                { folder, resource_type: 'auto', public_id: publicId },
                (error, result) => {
                    if (error) return reject(error);
                    const res = result as UploadApiResponse;
                    resolve({
                        url: res.secure_url,
                        publicId: res.public_id,
                        provider: this.providerName
                    });
                }
            );

            const bufferStream = new Readable();
            bufferStream.push(buffer);
            bufferStream.push(null);
            bufferStream.pipe(uploadStream);
        });
    }

    async deleteFile(publicId: string): Promise<boolean> {
        if (!this._connected) this.connect();
        const res = await cloudinary.uploader.destroy(publicId);
        return res.result === 'ok';
    }

    // Tương thích ngược
    async deleteImage(publicId: string): Promise<unknown> {
        return this.deleteFile(publicId);
    }
}

export const cloudinaryAdapter = new CloudinaryAdapter();
