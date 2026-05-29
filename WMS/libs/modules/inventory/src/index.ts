import { AwilixContainer, asClass } from 'awilix';
import type { IAppModule } from '@core/shared';
import { InventoryRepository } from './repositories/inventory.repository';
import { InventoryService } from './inventory.service';
import { eventBus } from '@core/shared/src/in-memory-event-bus';

export const inventoryModule: IAppModule = {
    name: 'inventory',
    basePath: '/inventory',
    register: (_app, container: AwilixContainer) => {
        container.register({
            // Repository
            inventoryRepository: asClass(InventoryRepository).singleton(),
            // Service
            inventoryService: asClass(InventoryService).singleton(),
        });

        // Listen for AGV_TASK_COMPLETED to update inventory
        // Actually, we'll listen for INBOUND_COMPLETED or we can just hook into inbound service
        // Let's listen to INBOUND_ORDER_ITEM_COMPLETED
        eventBus.subscribe('INBOUND_ORDER_ITEM_COMPLETED', async (payload: any) => {
            const { warehouseId, slotId, productId, quantity } = payload;
            try {
                const inventoryService = container.resolve<InventoryService>('inventoryService');
                const newItem = await inventoryService.addInventory(warehouseId, slotId, productId, quantity);
                
                // Emit to Socket via core EventPublisher
                const eventPublisher = container.resolve<any>('eventPublisher');
                eventPublisher.emitToWarehouse(warehouseId, 'inventory_added', newItem);

                console.log(`[INVENTORY] Đã cập nhật tồn kho tại slot ${slotId} cho product ${productId}`);
            } catch (err: any) {
                console.error(`[INVENTORY] Lỗi khi cập nhật tồn kho:`, err.message);
            }
        });

        console.log('📦 Module registered: [inventory]');
    },
};

export default inventoryModule;
