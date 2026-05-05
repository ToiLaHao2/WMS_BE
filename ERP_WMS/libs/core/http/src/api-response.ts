import { Response } from 'express';

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

/**
 * API Response Formatter
 * Giup toan bo ung dung tra ve JSON cung 1 format chuan nhat.
 */
export class ApiResponse {
    static success<T>(res: Response, data: T = null as T, message: string = 'Success', statusCode: number = 200): Response {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            meta: {
                timestamp: new Date().toISOString()
            }
        });
    }

    static paginate<T>(res: Response, data: T, paginationMeta: PaginationMeta, message: string = 'Success', statusCode: number = 200): Response {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                pagination: paginationMeta
            }
        });
    }
}
