import { InventoryRepository } from './repositories/inventory.repository';
import type { IInventory, InventoryStats } from './inventory.model';

export class InventoryService {
    private inventoryRepo: InventoryRepository;

    constructor({ inventoryRepository }: { inventoryRepository: InventoryRepository }) {
        this.inventoryRepo = inventoryRepository;
    }

    async getInventoryByWarehouse(warehouseId: string): Promise<IInventory[]> {
        return this.inventoryRepo.getByWarehouse(warehouseId);
    }

    async addInventory(warehouseId: string, slotId: string, productId: string, quantity: number): Promise<IInventory> {
        return this.inventoryRepo.addInventory(warehouseId, slotId, productId, quantity);
    }

    async getInventoryStats(warehouseId: string): Promise<InventoryStats> {
        const inventory = await this.inventoryRepo.getByWarehouse(warehouseId);

        let usedCapacity = 0;
        inventory.forEach((i: any) => {
            usedCapacity += i.quantity; // Hoặc nếu tính slot thì dùng inventory.length
        });

        // totalCapacity sẽ được điền ở controller bằng cách gọi sang MasterData 
        return {
            totalCapacity: 0,
            usedCapacity: inventory.length // Vì một slot chứa 1 item, ta đếm theo dòng
        };
    }
}
