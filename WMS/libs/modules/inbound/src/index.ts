import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { InboundOrderRepository, InboundOrderItemRepository } from './repositories/inbound.repository';
import { InboundService } from './inbound.service';
import { eventBus } from '@core/shared/src/in-memory-event-bus';

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

        // Event Listeners
        eventBus.subscribe('INBOUND_ORDER_FAILED', async (payload: any) => {
            const { orderId, reason } = payload;
            try {
                const inboundOrderRepo = container.resolve<InboundOrderRepository>('inboundOrderRepository');
                await inboundOrderRepo.updateOrderStatus(orderId, 'FAILED');
                console.log(`[INBOUND] Đã cập nhật Order ${orderId} thành FAILED do lỗi AGV: ${reason}`);
            } catch (err) {
                console.error(`[INBOUND] Lỗi khi cập nhật Order ${orderId} thành FAILED:`, err);
            }
        });

        console.log('📦 Module registered: [inbound]');
    },
};

export default inboundModule;
