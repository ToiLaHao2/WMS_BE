import { Controller, Get, Route, Tags, Path } from '@tsoa/runtime';
import type { InventoryService } from './inventory.service';
import type { IInventory, InventoryStats } from './inventory.model';

@Route('inventory')
@Tags('Inventory')
export class InventoryController extends Controller {
    private inventoryService: InventoryService;

    constructor({ inventoryService }: { inventoryService: InventoryService }) {
        super();
        this.inventoryService = inventoryService;
    }

    /**
     * Lấy danh sách hàng hóa đang nằm trên các kệ trong kho.
     */
    @Get('warehouses/{warehouseId}')
    public async getInventoryByWarehouse(@Path() warehouseId: string): Promise<IInventory[]> {
        return this.inventoryService.getInventoryByWarehouse(warehouseId);
    }

    /**
     * Lấy thông số tổng quan của kho (total capacity, used capacity).
     */
    @Get('warehouses/{warehouseId}/stats')
    public async getInventoryStats(@Path() warehouseId: string): Promise<InventoryStats> {
        return this.inventoryService.getInventoryStats(warehouseId);
    }
}
