import { Request, Response, NextFunction } from 'express';
import { AppError } from './errors/app.error';

interface ErrorWithExtras extends Error {
    statusCode?: number;
    status?: string;
    isOperational?: boolean;
    path?: string;
    value?: unknown;
}

const handleCastErrorDB = (err: ErrorWithExtras): AppError => {
    const message = `Invalid ${err.path}: ${err.value}.`;
    return new AppError(message, 400);
};

const sendErrorDev = (err: ErrorWithExtras, res: Response): void => {
    // Log lỗi ra console để dev vẫn thấy chi tiết khi debug backend
    console.error('💥 [DEV ERROR]:', err);
    
    // Gửi response sạch sẽ về frontend (không lộ file path / stack trace)
    res.status(err.statusCode || 500).json({
        status: err.status,
        message: err.message,
    });
};

const sendErrorProd = (err: ErrorWithExtras, res: Response): void => {
    if (err.isOperational) {
        res.status(err.statusCode || 500).json({
            status: err.status,
            message: err.message
        });
    } else {
        console.error('ERROR 💥', err);
        res.status(500).json({
            status: 'error',
            message: 'Something went very wrong!'
        });
    }
};

/**
 * Express Global Error Handling Middleware
 * Middleware co 4 tham so luon duoc Express hieu la Error Handler
 */
export const globalErrorHandler = (
    err: ErrorWithExtras,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    const nodeEnv = process.env.NODE_ENV || 'development';

    if (nodeEnv === 'development') {
        sendErrorDev(err, res);
    } else {
        const error: ErrorWithExtras = { ...err, message: err.message, name: err.name };

        if (error.name === 'CastError') {
            sendErrorProd(handleCastErrorDB(error), res);
        } else {
            sendErrorProd(error, res);
        }
    }
};
