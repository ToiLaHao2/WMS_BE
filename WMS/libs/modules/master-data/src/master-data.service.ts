import type { WarehouseRepository } from './repositories/warehouse.repository';
import type { WarehouseSlotRepository } from './repositories/warehouse-slot.repository';
import type { ProductRepository } from './repositories/product.repository';
import type { AGVRepository } from './repositories/agv.repository';
import type {
    IWarehouse, IWarehouseSlot, IProduct, IAGV,
    CreateWarehouseDTO, UpdateWarehouseDTO,
    CreateWarehouseSlotDTO, UpdateWarehouseSlotDTO,
    CreateProductDTO, UpdateProductDTO,
} from './master-data.model';

import { transactionManager } from '@core/database';
import { cacheManager } from '@core/cache';
import { SlotType } from './master-data.model';
import { NotFoundError } from '@core/exceptions';

/**
 * MasterDataService — Business Logic cho dữ liệu gốc (Warehouse, Slot, Product).
 * Dependencies được inject qua Awilix (constructor injection).
 */
export class MasterDataService {
    private warehouseRepo: WarehouseRepository;
    private warehouseSlotRepo: WarehouseSlotRepository;
    private productRepo: ProductRepository;
    private agvRepo: AGVRepository;

    constructor({
        warehouseRepository,
        warehouseSlotRepository,
        productRepository,
        agvRepository,
    }: {
        warehouseRepository: WarehouseRepository;
        warehouseSlotRepository: WarehouseSlotRepository;
        productRepository: ProductRepository;
        agvRepository: AGVRepository;
    }) {
        this.warehouseRepo = warehouseRepository;
        this.warehouseSlotRepo = warehouseSlotRepository;
        this.productRepo = productRepository;
        this.agvRepo = agvRepository;
    }

    // ============================================================
    // Warehouse
    // ============================================================

    async getAllWarehouses(): Promise<IWarehouse[]> {
        return this.warehouseRepo.getAllWarehouses();
    }

    async getWarehouseByIdOrCode(idOrCode: string): Promise<IWarehouse> {
        // Check if idOrCode is a valid UUID format
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrCode);
        
        if (isUuid) {
            return this.warehouseRepo.findByIdOrThrow(idOrCode) as unknown as Promise<IWarehouse>;
        }
        
        const warehouse = await this.warehouseRepo.findByCode(idOrCode);
        if (!warehouse) {
            throw new NotFoundError(`Warehouse with code '${idOrCode}' not found`);
        }
        return warehouse;
    }

    async checkWarehouseCodeExists(code: string): Promise<boolean> {
        // 1. Check Cache first (O(1))
        const cached = await cacheManager.get(`wms:code:${code}`);
        if (cached === 1) return true;

        // 2. Check Database (Fallback)
        const warehouse = await this.warehouseRepo.findByCode(code);
        if (warehouse) {
            // Fill cache for next time
            await cacheManager.set(`wms:code:${code}`, 1, 3600);
            return true;
        }

        return false;
    }

    async createWarehouse(data: CreateWarehouseDTO): Promise<IWarehouse> {
        return transactionManager.runInTransaction(async (client) => {
            const cols = data.width;
            const rows = data.height;

            // ── 1. Generate Grid Matrix ──────────────────────────
            // Grid values: 0=AISLE, 1=STORAGE, 2=BLOCKED(wall), 3=CHARGING
            const GRID_AISLE = 0;
            const GRID_STORAGE = 1;
            const GRID_BLOCKED = 2;
            const GRID_CHARGING = 3;

            const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(GRID_AISLE));

            // Step 1: Outer walls
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
                        grid[r][c] = GRID_BLOCKED;
                    }
                }
            }

            // Step 2: Perimeter aisles (ring inside walls) — already AISLE by default

            // Step 3: Inner core — rack blocks (2-wide, 4-tall, separated by 1-cell aisles)
            for (let r = 2; r < rows - 2; r++) {
                for (let c = 2; c < cols - 2; c++) {
                    const cr = r - 2;
                    const cc = c - 2;
                    const isRackCol = cc % 3 < 2;
                    const isRackRow = cr % 5 < 4;
                    if (isRackCol && isRackRow) {
                        grid[r][c] = GRID_STORAGE;
                    }
                }
            }

            // Step 4: Adaptive Charging Zone
            // Calculate number of charging stations based on warehouse size
            const innerWidth = cols - 4;
            const chargingCount = Math.max(4, Math.min(innerWidth, Math.ceil((cols * rows) / 200)));
            const chargingRow = rows - 3;
            if (chargingRow >= 2) {
                for (let i = 0; i < chargingCount && (2 + i) < cols - 2; i++) {
                    grid[chargingRow][2 + i] = GRID_CHARGING;
                }
            }

            // ── 2. Create Warehouse with layout_data ────────────
            const warehouseResult = await this.warehouseRepo.rawQueryWithClient<IWarehouse>(client,
                `INSERT INTO "warehouse" (code, name, description, width, height, layout_type, layout_data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [data.code, data.name, data.description || null, cols, rows, data.layout_type, JSON.stringify(grid)]
            );
            const warehouse = warehouseResult[0];
            const wId = warehouse.id;

            // ── 3. Extract ONLY functional slots (STORAGE + CHARGING) ──
            const functionalSlots: CreateWarehouseSlotDTO[] = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cellValue = grid[r][c];
                    if (cellValue === GRID_STORAGE || cellValue === GRID_CHARGING) {
                        const slotType = cellValue === GRID_STORAGE ? SlotType.STORAGE : SlotType.CHARGING;
                        functionalSlots.push({
                            warehouse_id: wId,
                            slot_code: `R${r}-C${c}`,
                            x: c,
                            y: r,
                            width: 1,
                            height: 1,
                            slot_type: slotType,
                        });
                    }
                }
            }

            // ── 4. Batch Insert (1000 slots per batch) ───────────
            const BATCH_SIZE = 1000;
            for (let i = 0; i < functionalSlots.length; i += BATCH_SIZE) {
                const batch = functionalSlots.slice(i, i + BATCH_SIZE);
                await this.warehouseSlotRepo.bulkCreateSlotsWithClient(client, batch);
            }

            // ── 5. Spawn Initial AGVs ───────────────────────────
            if (data.initial_agv_count && data.initial_agv_count > 0) {
                const chargingSlots = functionalSlots.filter(s => s.slot_type === SlotType.CHARGING);
                const agvToCreate = Math.min(data.initial_agv_count, chargingSlots.length);
                
                for (let i = 0; i < agvToCreate; i++) {
                    const slot = chargingSlots[i];
                    await this.agvRepo.createAGVWithClient(client, {
                        code: `AGV-${warehouse.code}-${(i + 1).toString().padStart(3, '0')}`,
                        warehouse_id: warehouse.id,
                        model: 'STANDARD-X1',
                        max_weight: 500,
                        battery_capacity: 100,
                        current_x: slot.x,
                        current_y: slot.y
                    });
                }
                console.log(`🤖 Spawned ${agvToCreate} AGVs for warehouse ${warehouse.code}`);
            }

            // ── 6. Cache to Redis ────────────────────────────────
            if (cacheManager) {
                await cacheManager.set(`warehouse:${wId}:layout`, grid, 86400);
                // Index the code for quick existence check (Facebook-style)
                await cacheManager.set(`wms:code:${warehouse.code}`, 1, 86400);
            }

            console.log(`✅ Warehouse "${data.code}" created: ${cols}x${rows} grid, ${functionalSlots.length} functional slots saved (${cols * rows - functionalSlots.length} static cells in layout_data)`);

            return warehouse;
        });
    }

    async updateWarehouse(id: string, data: UpdateWarehouseDTO): Promise<IWarehouse> {
        return this.warehouseRepo.updateWarehouse(id, data);
    }

    async getAGVsByWarehouse(warehouseId: string): Promise<IAGV[]> {
        return this.agvRepo.findByWarehouse(warehouseId);
    }

    async deleteWarehouse(id: string): Promise<boolean> {
        return this.warehouseRepo.delete(id);
    }

    // ============================================================
    // Warehouse Slot
    // ============================================================

    async getSlotsByWarehouseId(warehouseIdOrCode: string): Promise<IWarehouseSlot[]> {
        // Resolve warehouse first to get the correct UUID
        const warehouse = await this.getWarehouseByIdOrCode(warehouseIdOrCode);
        return this.warehouseSlotRepo.findByWarehouseId(warehouse.id);
    }

    async getSlotById(id: string): Promise<IWarehouseSlot> {
        return this.warehouseSlotRepo.findByIdOrThrow(id) as unknown as Promise<IWarehouseSlot>;
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
        return this.productRepo.findByIdOrThrow(id) as unknown as Promise<IProduct>;
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
