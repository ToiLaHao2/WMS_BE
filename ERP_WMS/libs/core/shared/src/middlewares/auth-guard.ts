import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '@core/exceptions';

// Extend Express Request de them thuoc tinh user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: string;
            };
        }
    }
}

/**
 * Middleware: Kiem tra JWT Token hop le.
 * TODO: Tich hop jsonwebtoken verify sau khi cai @core/container (DI)
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('You are not logged in. Please log in to get access.');
        }

        const _token = authHeader.split(' ')[1];

        // TODO: jwt.verify(token, securityConfig.jwtSecret)
        req.user = { id: '1', role: 'ADMIN' }; // Fake data for now

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware: Check Role-based access
 */
export const requireRole = (...roles: string[]) => {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(new UnauthorizedError('Please log in first.'));
        }

        if (!roles.includes(req.user.role)) {
            return next(new ForbiddenError('You do not have permission to perform this action.'));
        }

        next();
    };
};
