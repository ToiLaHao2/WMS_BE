import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { BadRequestError } from '@core/exceptions';

const storage = multer.memoryStorage();

// Lọc ảnh
const imageFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new BadRequestError('Chỉ hỗ trợ upload hình ảnh!'));
    }
};

// Lọc file đính kèm (Ảnh + PDF + Word + Excel, Zip, etc)
const genericFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
    const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword', // doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
        'application/vnd.ms-excel', // xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
        'application/zip',
        'text/plain'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new BadRequestError(`Định dạng file không được hỗ trợ: ${file.mimetype}`));
    }
}

export const uploadImage = multer({
    storage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

export const uploadFile = multer({
    storage,
    fileFilter: genericFilter,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});
