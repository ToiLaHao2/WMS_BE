import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '@core/exceptions';

type RequestSource = 'body' | 'query' | 'params';

/**
 * Validation Middleware dung Zod
 * Su dung: router.post('/users', validateRequest(createUserSchema), controller.create)
 */
export const validateRequest = (schema: ZodSchema, source: RequestSource = 'body') => {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            const validatedData = schema.parse(req[source]);
            // Ghi de du lieu da validate len request object
            Object.assign(req, { [source]: validatedData });
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessages = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
                const message = `Validation failed: ${errorMessages.join(', ')}`;
                return next(new BadRequestError(message));
            }
            next(error);
        }
    };
};
