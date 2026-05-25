import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { AgvDispatcherService } from './agv-dispatcher.service';
import { AGVRepository } from './repositories/agv.repository';
import { eventBus } from '@core/shared/src/in-memory-event-bus';

export const agvModule: IAppModule = {
    name: 'agv',
    basePath: '/agv',
    register: (_app: any, container: AwilixContainer) => {
        container.register({
            agvRepository: asClass(AGVRepository).singleton(),
            agvDispatcherService: asClass(AgvDispatcherService).singleton(),
        });

        // Event Listeners
        eventBus.subscribe('AGV_TASK_COMPLETED', async (payload: any) => {
            const { agvId, warehouseId } = payload;
            try {
                const dispatcher = container.resolve<AgvDispatcherService>('agvDispatcherService');
                await dispatcher.markAgvIdle(agvId);
                console.log(`[AGV] Đã chuyển AGV ${agvId} sang trạng thái IDLE`);
                
                if (warehouseId) {
                    await dispatcher.dispatchAgv(warehouseId);
                }
            } catch (err) {
                console.error(`[AGV] Lỗi xử lý AGV_TASK_COMPLETED:`, err);
            }
        });

        eventBus.subscribe('NEW_AGV_TASK_ADDED', async (payload: any) => {
            const { warehouseId } = payload;
            try {
                const dispatcher = container.resolve<AgvDispatcherService>('agvDispatcherService');
                await dispatcher.dispatchAgv(warehouseId);
                console.log(`[AGV] Đã kích hoạt dispatch cho warehouse: ${warehouseId}`);
            } catch (err) {
                console.error(`[AGV] Lỗi xử lý NEW_AGV_TASK_ADDED:`, err);
            }
        });

        eventBus.subscribe('WAREHOUSE_CREATED', async (payload: any) => {
            const { warehouseId, warehouseCode, initialAgvCount, chargingSlots } = payload;
            try {
                const dispatcher = container.resolve<AgvDispatcherService>('agvDispatcherService');
                await dispatcher.createInitialAGVs(warehouseId, warehouseCode, initialAgvCount, chargingSlots);
            } catch (err) {
                console.error(`[AGV] Lỗi xử lý WAREHOUSE_CREATED:`, err);
            }
        });

        console.log('📦 Module registered: [agv]');
    }
};

export default agvModule;
