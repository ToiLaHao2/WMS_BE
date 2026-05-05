import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';

import { appConfig, rateLimitConfig } from '@core/config';
import { runSystemCheck } from '@core/utils';
import { loadModules } from '@core/shared';
import { globalErrorHandler, NotFoundError } from '@core/exceptions';
import { container } from '@core/container';
import { RegisterRoutes } from './generated/routes';
import swaggerDocument from './generated/swagger.json';
import { ValidateError } from '@tsoa/runtime';

// === APP SETUP ===
export const app = express();
const PORT = appConfig.port;
const API_PREFIX = '/api';

// === MIDDLEWARES ===
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:5173'], // Frontend Vite default port
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json());

// === RATE LIMITING ===
const globalLimiter = rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});
const authLimiter = rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please wait before trying again.' },
});
app.use(globalLimiter);

// === SYSTEM CHECK ===
runSystemCheck();

// === GATEWAY HEALTH CHECK ===
app.get('/', (_req: Request, res: Response) => {
    res.json({
        service: 'CMA Backend Gateway',
        status: 'active',
        timestamp: new Date(),
        docs: `http://localhost:${PORT}/docs`,
        apiBaseUrl: `http://localhost:${PORT}${API_PREFIX}`,
    });
});

// === SWAGGER UI ===
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// === API APP ===
const api = express();
api.use('/auth', authLimiter);

// === TSOA GENERATED ROUTES ===
RegisterRoutes(api);

// === LOAD LEGACY MODULES ===
loadModules(api, container);

app.use(API_PREFIX, api);

// === 404 NOT FOUND HANDLER ===
app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Can't find ${req.method} ${req.originalUrl} on this server!`));
});

// === TSOA ERROR HANDLER ===
app.use((err: any, req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof ValidateError) {
        console.warn(`Caught Validation Error for ${req.path}:`, err.fields);
        res.status(422).json({
            message: "Validation Failed",
            details: err?.fields,
        });
        return;
    }
    if (err instanceof Error && (err.message === 'No token provided' || err.message === 'Invalid token' || err.message === 'Insufficient scope/role')) {
        res.status(401).json({
            message: "Authentication Failed",
            details: err.message,
        });
        return;
    }
    next(err);
});

// === GLOBAL ERROR HANDLER ===
app.use(globalErrorHandler);
