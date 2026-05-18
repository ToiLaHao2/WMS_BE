import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { InboundOrderRepository, InboundOrderItemRepository } from './repositories/inbound.repository';
import { InboundService } from './inbound.service';

export const inboundModule: IAppModule = {
    name: 'inbound',
    basePath: '/inbound',
    register: (_app, container: AwilixContainer) => {
        container.register({
            // Repositories
            inboundOrderRepository: asClass(InboundOrderRepository).singleton(),
            inboundOrderItemRepository: asClass(InboundOrderItemRepository).singleton(),

            // Service
            inboundService: asClass(InboundService).singleton(),
        });
        console.log('📦 Module registered: [inbound]');
    },
};

export default inboundModule;
