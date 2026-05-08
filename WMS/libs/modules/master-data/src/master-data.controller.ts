import { Controller, Get, Post, Put, Delete, Route, Tags, Path, Body, Query } from '@tsoa/runtime';
import type { MasterDataService } from './master-data.service';
import type {
    IWarehouse, IWarehouseSlot, IProduct,
    CreateWarehouseDTO, UpdateWarehouseDTO,
    CreateWarehouseSlotDTO, UpdateWarehouseSlotDTO,
    CreateProductDTO, UpdateProductDTO,
} from './master-data.model';

/**
 * MasterDataController — API Endpoints cho Warehouse, Slot, Product.
 * Chỉ làm 2 việc: Định nghĩa Route (tsoa) và Gọi Service.
 * KHÔNG chứa Business Logic (theo Bone Guide).
 */
@Route('master-data')
@Tags('Master Data')
export class MasterDataController extends Controller {
    private masterDataService: MasterDataService;

    constructor({ masterDataService }: { masterDataService: MasterDataService }) {
        super();
        this.masterDataService = masterDataService;
    }

    // ============================================================
    // Warehouse Endpoints
    // ============================================================

    @Get('warehouses')
    public async getAllWarehouses(): Promise<IWarehouse[]> {
        return this.masterDataService.getAllWarehouses();
    }

    @Get('warehouses/{idOrCode}')
    public async getWarehouseById(@Path() idOrCode: string): Promise<IWarehouse> {
        return this.masterDataService.getWarehouseByIdOrCode(idOrCode);
    }

    @Get('warehouses/check/{code}')
    public async checkWarehouseCodeExists(@Path() code: string): Promise<{ exists: boolean }> {
        const exists = await this.masterDataService.checkWarehouseCodeExists(code);
        return { exists };
    }

    @Post('warehouses')
    public async createWarehouse(@Body() body: CreateWarehouseDTO): Promise<IWarehouse> {
        this.setStatus(201);
        return this.masterDataService.createWarehouse(body);
    }

    @Put('warehouses/{id}')
    public async updateWarehouse(@Path() id: string, @Body() body: UpdateWarehouseDTO): Promise<IWarehouse> {
        return this.masterDataService.updateWarehouse(id, body);
    }

    @Delete('warehouses/{id}')
    public async deleteWarehouse(@Path() id: string): Promise<{ success: boolean }> {
        const result = await this.masterDataService.deleteWarehouse(id);
        return { success: result };
    }

    // ============================================================
    // Warehouse Slot Endpoints
    // ============================================================

    @Get('warehouses/{idOrCode}/slots')
    public async getSlotsByWarehouseId(@Path() idOrCode: string): Promise<IWarehouseSlot[]> {
        return this.masterDataService.getSlotsByWarehouseId(idOrCode);
    }

    @Get('warehouses/{warehouseId}/slots/available')
    public async getAvailableSlots(@Path() warehouseId: string): Promise<IWarehouseSlot[]> {
        return this.masterDataService.getAvailableStorageSlots(warehouseId);
    }

    @Get('slots/{id}')
    public async getSlotById(@Path() id: string): Promise<IWarehouseSlot> {
        return this.masterDataService.getSlotById(id);
    }

    @Post('slots')
    public async createSlot(@Body() body: CreateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        this.setStatus(201);
        return this.masterDataService.createSlot(body);
    }

    @Put('slots/{id}')
    public async updateSlot(@Path() id: string, @Body() body: UpdateWarehouseSlotDTO): Promise<IWarehouseSlot> {
        return this.masterDataService.updateSlot(id, body);
    }

    @Delete('slots/{id}')
    public async deleteSlot(@Path() id: string): Promise<{ success: boolean }> {
        const result = await this.masterDataService.deleteSlot(id);
        return { success: result };
    }

    // ============================================================
    // Product Endpoints
    // ============================================================

    @Get('products')
    public async getAllProducts(): Promise<IProduct[]> {
        return this.masterDataService.getAllProducts();
    }

    @Get('products/{id}')
    public async getProductById(@Path() id: string): Promise<IProduct> {
        return this.masterDataService.getProductById(id);
    }

    @Post('products')
    public async createProduct(@Body() body: CreateProductDTO): Promise<IProduct> {
        this.setStatus(201);
        return this.masterDataService.createProduct(body);
    }

    @Put('products/{id}')
    public async updateProduct(@Path() id: string, @Body() body: UpdateProductDTO): Promise<IProduct> {
        return this.masterDataService.updateProduct(id, body);
    }

    @Delete('products/{id}')
    public async deleteProduct(@Path() id: string): Promise<{ success: boolean }> {
        const result = await this.masterDataService.deleteProduct(id);
        return { success: result };
    }
}
