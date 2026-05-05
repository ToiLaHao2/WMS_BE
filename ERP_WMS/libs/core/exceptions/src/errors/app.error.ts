/**
 * Base class cho tat ca cac Custom Errors trong toan bo he thong.
 * 1. Co status code HTTP ro rang (400, 401, 404, 500)
 * 2. Phan biet loi nghiep vu (isOperational) va loi he thong (bug)
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly status: string;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}
