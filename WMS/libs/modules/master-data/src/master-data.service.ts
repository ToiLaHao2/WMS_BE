import type { WarehouseRepository } from './repositories/warehouse.repository';
import type { WarehouseSlotRepository } from './repositories/warehouse-slot.repository';
import type { ProductRepository } from './repositories/product.repository';

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

    async getWarehouseByIdOrCode(idOrCode: string): Promise<IWarehouse> {
        // Check if idOrCode is a valid UUID format
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrCode);
        
        const warehouse = isUuid 
            ? await this.warehouseRepo.findByIdOrThrow(idOrCode) as unknown as IWarehouse
            : await this.warehouseRepo.findByCode(idOrCode);

        if (!warehouse) {
            throw new NotFoundError(`Warehouse with code '${idOrCode}' not found`);
        }

        // Tự động sync layout lên Redis (Self-healing cache)
        if (warehouse.layout_data) {
            const grid = typeof warehouse.layout_data === 'string' 
                ? JSON.parse(warehouse.layout_data) 
                : warehouse.layout_data;
            cacheManager.set(`warehouse:${warehouse.id}:layout`, grid, 86400).catch(err =>
                console.error(`❌ [Redis Auto-Sync] Lỗi auto-sync layout: ${err.message}`)
            );
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

    // ─────────────────────────────────────────────────────────
    // LAYOUT GENERATION HELPERS
    // ─────────────────────────────────────────────────────────
    private readonly GRID_AISLE = 0;
    private readonly GRID_STORAGE = 1;
    private readonly GRID_BLOCKED = 2;
    private readonly GRID_CHARGING = 3;
    private readonly GRID_INBOUND = 4;
    private readonly GRID_OUTBOUND = 5;
    private readonly GRID_EMPTY = 6;
    private readonly GRID_AISLE_H = 7;
    private readonly GRID_AISLE_V = 8;

    private generateBaseGrid(rows: number, cols: number): number[][] {
        const grid = Array.from({ length: rows }, () => Array(cols).fill(this.GRID_EMPTY));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
                    grid[r][c] = this.GRID_BLOCKED;
                }
            }
        }
        return grid;
    }

    private applyStorageLayout(grid: number[][], layoutType: string, rows: number, cols: number): void {
        let blockWidth = layoutType === 'HIGH_DENSITY' ? 5 : 3;
        let blockHeight = layoutType === 'HIGH_DENSITY' ? 9 : 5;
        if (layoutType === 'CROSS_DOCKING') {
            blockWidth = 1; 
            blockHeight = 4;
        }

        // Top-Left Packing Strategy to maximize density
        const startR = 2;
        const startC = 2;
        
        // Reserve bottom rows for Main Highway (rows-5), Charging/Dock Access (rows-4, rows-3), Docks (rows-2), Wall (rows-1)
        const maxRackR = rows - 5;
        const maxRackC = cols - 3; // reserve right perimeter

        for (let r = startR; r <= maxRackR; r++) {
            for (let c = startC; c <= maxRackC; c++) {
                const cr = r - startR;
                const cc = c - startC;

                switch (layoutType) {
                    case 'HIGH_DENSITY':
                        if (cc % 5 < 4 && cr % 9 < 8) grid[r][c] = this.GRID_STORAGE;
                        break;
                    case 'CROSS_DOCKING':
                        const isWing = c < 5 || c > cols - 6;
                        if (isWing && cr % 4 < 3) grid[r][c] = this.GRID_STORAGE;
                        break;
                    case 'STANDARD':
                    default:
                        if (cc % 3 < 2 && cr % 5 < 4) grid[r][c] = this.GRID_STORAGE;
                        break;
                }
            }
        }
    }

    private applyChargingStations(grid: number[][], rows: number, cols: number): void {
        const innerWidthForCharge = cols - 4;
        const chargingCount = Math.max(4, Math.min(innerWidthForCharge, Math.ceil((cols * rows) / 200)));
        const chargingRow = rows - 3;
        const chargeOffsetX = 2; // Góc trái theo yêu cầu

        if (chargingRow >= 2) {
            for (let i = 0; i < chargingCount; i++) {
                grid[chargingRow][chargeOffsetX + i] = this.GRID_CHARGING;
            }
        }
    }

    private applyDocks(grid: number[][], rows: number, cols: number): void {
        const dockRow = rows - 2; // Ngay trên bức tường dưới cùng
        if (dockRow <= 2) return;

        // INBOUND Docks
        const inStart = 8;
        const inWidth = Math.floor(cols / 4);
        for (let c = inStart; c < inStart + inWidth && c < cols - 2; c++) {
            grid[dockRow][c] = this.GRID_INBOUND;
        }

        // OUTBOUND Docks
        const outStart = inStart + inWidth + 2; // Cách 2 ô
        const outWidth = Math.floor(cols / 4);
        for (let c = outStart; c < outStart + outWidth && c < cols - 2; c++) {
            grid[dockRow][c] = this.GRID_OUTBOUND;
        }
    }

    private applyNavMesh(grid: number[][], rows: number, cols: number): void {
        const isRackCol = (col: number) => {
            for (let r = 0; r < rows; r++) if (grid[r][col] === this.GRID_STORAGE) return true;
            return false;
        };
        const isRackRow = (row: number) => {
            for (let c = 0; c < cols; c++) if (grid[row][c] === this.GRID_STORAGE) return true;
            return false;
        };

        let minRackR = rows, maxRackR = 0, minRackC = cols, maxRackC = 0;
        let chargeRow = -1;
        const dockCols = new Set<number>();
        const chargeCols = new Set<number>();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === this.GRID_STORAGE) {
                    if (r < minRackR) minRackR = r;
                    if (r > maxRackR) maxRackR = r;
                    if (c < minRackC) minRackC = c;
                    if (c > maxRackC) maxRackC = c;
                } else if (grid[r][c] === this.GRID_CHARGING) {
                    chargeRow = r;
                    chargeCols.add(c);
                } else if (grid[r][c] === this.GRID_INBOUND || grid[r][c] === this.GRID_OUTBOUND) {
                    dockCols.add(c);
                }
            }
        }

        const horizontalPathRows = new Set<number>();
        horizontalPathRows.add(1); // Top Highway
        horizontalPathRows.add(maxRackR + 1); // Bottom Highway
        for (let r = minRackR; r <= maxRackR; r++) {
            if (!isRackRow(r)) horizontalPathRows.add(r); // Intermediate cross-aisles
        }

        const verticalPathCols = new Set<number>();
        for (let c = minRackC - 1; c <= maxRackC + 1; c++) {
            if (!isRackCol(c)) verticalPathCols.add(c); // Main vertical aisles
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === this.GRID_EMPTY) {
                    const isHPath = horizontalPathRows.has(r) && c >= minRackC - 1 && c <= maxRackC + 1;
                    
                    let isVPath = false;
                    if (verticalPathCols.has(c) && r >= 1 && r <= maxRackR + 1) isVPath = true;
                    if (dockCols.has(c) && r >= maxRackR + 1 && r < rows - 1) isVPath = true;
                    if (chargeCols.has(c) && r >= maxRackR + 1 && r < chargeRow) isVPath = true;

                    if (isHPath && isVPath) {
                        grid[r][c] = this.GRID_AISLE;
                    } else if (isHPath) {
                        grid[r][c] = this.GRID_AISLE_H;
                    } else if (isVPath) {
                        grid[r][c] = this.GRID_AISLE_V;
                    }
                }
            }
        }
    }
    // ─────────────────────────────────────────────────────────

    async createWarehouse(data: CreateWarehouseDTO): Promise<IWarehouse> {
        const result = await transactionManager.runInTransaction(async (client) => {
            const cols = data.width;
            const rows = data.height;

            // ── 1. Generate Grid Matrix ──────────────────────────
            const grid = this.generateBaseGrid(rows, cols);
            this.applyStorageLayout(grid, data.layout_type || 'STANDARD', rows, cols);
            this.applyChargingStations(grid, rows, cols);
            this.applyDocks(grid, rows, cols);
            this.applyNavMesh(grid, rows, cols);

            // ── 2. Create Warehouse with layout_data ────────────
            const warehouseResult = await this.warehouseRepo.rawQueryWithClient<IWarehouse>(client,
                `INSERT INTO "warehouse" (code, name, description, width, height, layout_type, layout_data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [data.code, data.name, data.description || null, cols, rows, data.layout_type, JSON.stringify(grid)]
            );
            const warehouse = warehouseResult[0];
            const wId = warehouse.id;

            // ── 3. Extract ONLY functional slots (STORAGE + CHARGING + DOCKS) ──
            const functionalSlots: CreateWarehouseSlotDTO[] = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cellValue = grid[r][c];
                    if (cellValue === this.GRID_STORAGE || cellValue === this.GRID_CHARGING || cellValue === this.GRID_INBOUND || cellValue === this.GRID_OUTBOUND) {
                        let slotType = SlotType.STORAGE;
                        if (cellValue === this.GRID_CHARGING) slotType = SlotType.CHARGING;
                        if (cellValue === this.GRID_INBOUND) slotType = SlotType.PICKUP;
                        if (cellValue === this.GRID_OUTBOUND) slotType = SlotType.DROPOFF;

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
            // Không tạo AGV trực tiếp ở đây nữa. Ta sẽ bắn Event sau khi commit xong!

            // ── 6. Cache to Redis (chỉ layout + code, KHÔNG sync slot ở đây) ──
            if (cacheManager) {
                await cacheManager.set(`warehouse:${wId}:layout`, grid, 86400);
                await cacheManager.set(`wms:code:${warehouse.code}`, 1, 86400);
            }

            console.log(`✅ Warehouse "${data.code}" created: ${cols}x${rows} grid, ${functionalSlots.length} functional slots saved (${cols * rows - functionalSlots.length} static cells in layout_data)`);

            return warehouse;
        });

        // ── 7. Sync slots SAU KHI transaction đã commit thành công ──
        // (Phải nằm ngoài runInTransaction để findByWarehouseId thấy data đã commit)
        await this.syncSlotsToRedis(result.id);

        // 8. Bắn event để AGV Module tự tạo xe
        if (data.initial_agv_count && data.initial_agv_count > 0) {
            const chargingSlots = await this.warehouseSlotRepo.findWhere({ 
                warehouse_id: result.id, 
                slot_type: SlotType.CHARGING 
            });
            import('@core/shared/src/in-memory-event-bus').then(({ eventBus }) => {
                eventBus.publish('WAREHOUSE_CREATED', {
                    warehouseId: result.id,
                    warehouseCode: result.code,
                    initialAgvCount: data.initial_agv_count,
                    chargingSlots
                });
            });
        }

        return result;
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

    async getSlotsByWarehouseId(warehouseIdOrCode: string): Promise<IWarehouseSlot[]> {
        // Resolve warehouse first to get the correct UUID
        const warehouse = await this.getWarehouseByIdOrCode(warehouseIdOrCode);
        const slots = await this.warehouseSlotRepo.findByWarehouseId(warehouse.id);
        
        // Tự động sync/refresh cache Redis khi được truy vấn (self-healing cache)
        this.syncSlotsToRedis(warehouse.id).catch(err => 
            console.error(`❌ [Redis Auto-Sync] Lỗi auto-sync slots: ${err.message}`)
        );

        return slots;
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

    async getProductByCode(code: string): Promise<IProduct | null> {
        return this.productRepo.findByCode(code);
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

    // ============================================================
    // Redis Slot Sync (WMS → Redis → MES)
    // ============================================================

    /**
     * Đẩy danh sách slot lên Redis cho MES (Python) đọc.
     * MES dùng key: warehouse:{warehouse_id}:slots
     * Format phải khớp với SlotConfig model bên MES:
     *   { slot_id, max_length, max_width, is_occupied, position: [x, y] }
     */
    async syncSlotsToRedis(warehouseId: string, slotsInput?: CreateWarehouseSlotDTO[]): Promise<void> {
        try {
            let slotsForMES: any[];

            if (slotsInput) {
                // Khi gọi ngay lúc tạo warehouse (chưa có id từ DB, dùng slot_code thay)
                // Cần query lại từ DB để lấy UUID thật của slot
                const dbSlots = await this.warehouseSlotRepo.findByWarehouseId(warehouseId);
                slotsForMES = dbSlots
                    .filter((s: any) => s.slot_type === 'STORAGE')
                    .map((s: any) => ({
                        slot_id: s.id,
                        max_length: Number(s.width),
                        max_width: Number(s.height),
                        is_occupied: s.status !== 'AVAILABLE',
                        position: [Number(s.x), Number(s.y)],
                    }));
            } else {
                // Khi gọi lại (re-sync) sau khi slot đổi trạng thái
                const dbSlots = await this.warehouseSlotRepo.findByWarehouseId(warehouseId);
                slotsForMES = dbSlots
                    .filter((s: any) => s.slot_type === 'STORAGE')
                    .map((s: any) => ({
                        slot_id: s.id,
                        max_length: Number(s.width),
                        max_width: Number(s.height),
                        is_occupied: s.status !== 'AVAILABLE',
                        position: [Number(s.x), Number(s.y)],
                    }));
            }

            const cacheKey = `warehouse:${warehouseId}:slots`;
            await cacheManager.set(cacheKey, slotsForMES, 86400); // TTL 24h
            console.log(`📦 [Redis Sync] Đã đẩy ${slotsForMES.length} STORAGE slots lên Redis cho kho ${warehouseId}`);
        } catch (error: any) {
            console.error(`❌ [Redis Sync] Lỗi sync slots: ${error.message}`);
        }
    }
}
