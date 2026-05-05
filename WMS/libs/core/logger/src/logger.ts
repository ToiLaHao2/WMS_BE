import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const env = process.env.NODE_ENV || 'development';

// Format Console dep cho Developer
const devFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

// Format JSON khi dua len Production (AWS, Google Cloud, Datadog...)
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: env === 'development' ? 'debug' : 'info',
    format: env === 'development'
        ? combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), devFormat)
        : prodFormat,
    defaultMeta: { service: 'cma-backend' },
    transports: [new winston.transports.Console()],
});

// Ghi them log ra file khi Production
if (env === 'production') {
    logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

export default logger;
