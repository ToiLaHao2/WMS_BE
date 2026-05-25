import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { WarehouseRepository } from './repositories/warehouse.repository';
import { WarehouseSlotRepository } from './repositories/warehouse-slot.repository';
import { ProductRepository } from './repositories/product.repository';
import { MasterDataService } from './master-data.service';
import { eventBus } from '@core/shared/src/in-memory-event-bus';
import { SlotStatus } from './master-data.model';

export const masterDataModule: IAppModule = {
    name: 'master-data',
    basePath: '/master-data',
    register: (_app, container: AwilixContainer) => {
        container.register({
            // Repositories
            warehouseRepository: asClass(WarehouseRepository).singleton(),
            warehouseSlotRepository: asClass(WarehouseSlotRepository).singleton(),
            productRepository: asClass(ProductRepository).singleton(),

            // Service
            masterDataService: asClass(MasterDataService).singleton(),
        });

        // Event Listeners
        eventBus.subscribe('SLOTS_OCCUPIED', async (payload: any) => {
            const { warehouseId, slotIds } = payload;
            try {
                const masterDataService = container.resolve<MasterDataService>('masterDataService');
                for (const slotId of slotIds) {
                    await masterDataService.updateSlot(slotId, { status: SlotStatus.OCCUPIED });
                }
                await masterDataService.syncSlotsToRedis(warehouseId);
                console.log(`[MASTER-DATA] Đã cập nhật ${slotIds.length} slot thành OCCUPIED`);
            } catch (err) {
                console.error(`[MASTER-DATA] Lỗi khi xử lý SLOTS_OCCUPIED:`, err);
            }
        });

        console.log('📦 Module registered: [master-data]');
    },
};

export default masterDataModule;
