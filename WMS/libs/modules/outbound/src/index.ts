import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { OutboundOrderRepository, OutboundOrderItemRepository } from './repositories/outbound.repository';
import { OutboundService } from './outbound.service';

export const outboundModule: IAppModule = {
    name: 'outbound',
    basePath: '/outbound',
    register: (_app, container: AwilixContainer) => {
        container.register({
            // Repositories
            outboundOrderRepository: asClass(OutboundOrderRepository).singleton(),
            outboundOrderItemRepository: asClass(OutboundOrderItemRepository).singleton(),

            // Service
            outboundService: asClass(OutboundService).singleton(),
        });
        console.log('📦 Module registered: [outbound]');
    },
};

export default outboundModule;
