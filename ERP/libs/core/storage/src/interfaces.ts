/// <reference types="multer" />

export interface UploadResult {
    url: string;
    publicId: string;
    width?: number;
    height?: number;
    provider: string; // "cloudinary", "s3", "local"
}

export interface IStorageProvider {
    uploadImageFromBuffer(buffer: Buffer, folder?: string): Promise<UploadResult>;
    // Hàm tổng quát cho mọi file (PDF, Docx)
    uploadFileFromBuffer(buffer: Buffer, originalName: string, mimeType: string, folder?: string): Promise<UploadResult>;
    deleteFile(publicId: string): Promise<boolean>;
}
