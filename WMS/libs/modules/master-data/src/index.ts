import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { WarehouseRepository } from './repositories/warehouse.repository';
import { WarehouseSlotRepository } from './repositories/warehouse-slot.repository';
import { ProductRepository } from './repositories/product.repository';
import { AGVRepository } from './repositories/agv.repository';
import { MasterDataService } from './master-data.service';

export const masterDataModule: IAppModule = {
    name: 'master-data',
    basePath: '/master-data',
    register: (_app, container: AwilixContainer) => {
        container.register({
            // Repositories
            warehouseRepository: asClass(WarehouseRepository).singleton(),
            warehouseSlotRepository: asClass(WarehouseSlotRepository).singleton(),
            productRepository: asClass(ProductRepository).singleton(),
            agvRepository: asClass(AGVRepository).singleton(),

            // Service
            masterDataService: asClass(MasterDataService).singleton(),
        });
        console.log('📦 Module registered: [master-data]');
    },
};

export default masterDataModule;
