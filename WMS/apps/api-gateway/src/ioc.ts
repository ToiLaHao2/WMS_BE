import { IocContainer } from '@tsoa/runtime';
import { container } from '@core/container';
import { asClass } from 'awilix';

export const iocContainer: IocContainer = {
    get<T>(controller: { new(...args: any[]): T }): T {
        // Build instance bằng Awilix Resolver (tự động inject deps qua Proxy)
        return container.build(asClass(controller)) as T;
    },
};
