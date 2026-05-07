import type { WarehouseRepository } from './repositories/warehouse.repository';
import type { WarehouseSlotRepository } from './repositories/warehouse-slot.repository';
import type { ProductRepository } from './repositories/product.repository';
import type {
    IWarehouse, IWarehouseSlot, IProduct,
    CreateWarehouseDTO, UpdateWarehouseDTO,
    CreateWarehouseSlotDTO, UpdateWarehouseSlotDTO,
    CreateProductDTO, UpdateProductDTO,
} from './master-data.model';

/**
 * MasterDataService — Business Logic cho dữ liệu gốc (Warehouse, Slot, Product).
 * Dependencies được inject qua Awilix (constructor injection).
 */
export class MasterDataService {
    private warehouseRepo: WarehouseRepository;
    private warehouseSlotRepo: WarehouseSlotRepository;
    private productRepo: ProductRepository;

    constructor({
        warehouseRepository,
        warehouseSlotRepository,
        productRepository,
    }: {
        warehouseRepository: WarehouseRepository;
        warehouseSlotRepository: WarehouseSlotRepository;
        productRepository: ProductRepository;
    }) {
        this.warehouseRepo = warehouseRepository;
        this.warehouseSlotRepo = warehouseSlotRepository;
        this.productRepo = productRepository;
    }

    // ============================================================
    // Warehouse
    // ============================================================

    async getAllWarehouses(): Promise<IWarehouse[]> {
        return this.warehouseRepo.getAllWarehouses();
    }

    async getWarehouseById(id: string): Promise<IWarehouse> {
        return this.warehouseRepo.findByIdOrThrow(id) as Promise<IWarehouse>;
    }

    async createWarehouse(data: CreateWarehouseDTO): Promise<IWarehouse> {
        return this.warehouseRepo.createWarehouse(data);
    }

    async updateWarehouse(id: string, data: UpdateWarehouseDTO): Promise<IWarehouse> {
        return this.warehouseRepo.updateWarehouse(id, data);
    }

    async deleteWarehouse(id: string): Promise<boolean> {
        return this.warehouseRepo.delete(id);
    }

    // ============================================================
    // Warehouse Slot
    // ============================================================

    async getSlotsByWarehouseId(warehouseId: string): Promise<IWarehouseSlot[]> {
        return this.warehouseSlotRepo.findByWarehouseId(warehouseId);
    }

    async getSlotById(id: string): Promise<IWarehouseSlot> {
        return this.warehouseSlotRepo.findByIdOrThrow(id) as Promise<IWarehouseSlot>;
    }

    async createSlot(data: CreateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        // Validate: Warehouse must exist
        await this.warehouseRepo.findByIdOrThrow(data.warehouse_id);
        return this.warehouseSlotRepo.createSlot(data);
    }

    async updateSlot(id: string, data: UpdateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        return this.warehouseSlotRepo.updateSlot(id, data);
    }

    async deleteSlot(id: string): Promise<boolean> {
        return this.warehouseSlotRepo.delete(id);
    }

    async getAvailableStorageSlots(warehouseId: string): Promise<IWarehouseSlot[]> {
        return this.warehouseSlotRepo.getAvailableStorageSlots(warehouseId);
    }

    // ============================================================
    // Product
    // ============================================================

    async getAllProducts(): Promise<IProduct[]> {
        return this.productRepo.getAllProducts();
    }

    async getProductById(id: string): Promise<IProduct> {
        return this.productRepo.findByIdOrThrow(id) as Promise<IProduct>;
    }

    async createProduct(data: CreateProductDTO): Promise<IProduct> {
        return this.productRepo.createProduct(data);
    }

    async updateProduct(id: string, data: UpdateProductDTO): Promise<IProduct> {
        return this.productRepo.updateProduct(id, data);
    }

    async deleteProduct(id: string): Promise<boolean> {
        return this.productRepo.delete(id);
    }
}
