import crypto from 'crypto';

export const generateUUID = (): string => {
    return crypto.randomUUID();
};

export const generateShortId = (length: number = 8): string => {
    return crypto.randomBytes(length).toString('hex').slice(0, length).toUpperCase();
};
