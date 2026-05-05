import { Application } from 'express';
import { AwilixContainer } from 'awilix';

/**
 * IAppModule — Interface contract cho tat ca business modules.
 * Moi module (users, courses, auth, ...) PHAI implement interface nay.
 */
export interface IAppModule {
    readonly name: string;
    readonly basePath: string;
    register(app: Application, container: AwilixContainer): void;
}

