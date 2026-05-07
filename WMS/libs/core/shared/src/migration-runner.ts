import { Pool } from 'pg';

// ============================================================
// WMS Simulation — Database Migrations
// Thứ tự tuần tự tránh FK violation:
//   1. warehouse        — bảng gốc, không FK nào
//   2. warehouse_slot   — FK → warehouse
//   3. product          — bảng gốc, không FK nào
//   4. inventory_item   — FK → product, warehouse, warehouse_slot
//   5. import_order     — FK → warehouse
//   6. import_order_item — FK → import_order, product
//   7. export_order     — FK → warehouse
//   8. export_order_item — FK → export_order, inventory_item
//   9. system_event     — bảng log, không FK nào
// ============================================================

const WAREHOUSE_MIGRATION = `
CREATE TABLE IF NOT EXISTS "warehouse" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    width INTEGER NOT NULL DEFAULT 10,
    height INTEGER NOT NULL DEFAULT 10,
    layout_type VARCHAR(50) NOT NULL DEFAULT 'GRID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const WAREHOUSE_SLOT_MIGRATION = `
CREATE TABLE IF NOT EXISTS "warehouse_slot" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES "warehouse"(id) ON DELETE CASCADE,
    slot_code VARCHAR(50) NOT NULL,
    x INTEGER NOT NULL DEFAULT 0,
    y INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 1,
    height INTEGER NOT NULL DEFAULT 1,
    slot_type VARCHAR(20) NOT NULL DEFAULT 'STORAGE',
    occupied_percent INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, slot_code)
);
`;

const PRODUCT_MIGRATION = `
CREATE TABLE IF NOT EXISTS "product" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    width NUMERIC(10,2) NOT NULL DEFAULT 0,
    height NUMERIC(10,2) NOT NULL DEFAULT 0,
    weight NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const INVENTORY_ITEM_MIGRATION = `
CREATE TABLE IF NOT EXISTS "inventory_item" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    product_id UUID NOT NULL REFERENCES "product"(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES "warehouse"(id) ON DELETE RESTRICT,
    warehouse_slot_id UUID REFERENCES "warehouse_slot"(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const IMPORT_ORDER_MIGRATION = `
CREATE TABLE IF NOT EXISTS "import_order" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES "warehouse"(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const IMPORT_ORDER_ITEM_MIGRATION = `
CREATE TABLE IF NOT EXISTS "import_order_item" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_order_id UUID NOT NULL REFERENCES "import_order"(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES "product"(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const EXPORT_ORDER_MIGRATION = `
CREATE TABLE IF NOT EXISTS "export_order" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES "warehouse"(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const EXPORT_ORDER_ITEM_MIGRATION = `
CREATE TABLE IF NOT EXISTS "export_order_item" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_order_id UUID NOT NULL REFERENCES "export_order"(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES "inventory_item"(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const SYSTEM_EVENT_MIGRATION = `
CREATE TABLE IF NOT EXISTS "system_event" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_event_type ON "system_event"(event_type);
CREATE INDEX IF NOT EXISTS idx_system_event_created ON "system_event"(created_at DESC);
`;

/**
 * Ordered Migration Steps — WMS Simulation
 */
const MIGRATION_STEPS: Array<{ name: string; sql: string }> = [
    { name: 'warehouse',          sql: WAREHOUSE_MIGRATION },
    { name: 'warehouse_slot',     sql: WAREHOUSE_SLOT_MIGRATION },
    { name: 'product',            sql: PRODUCT_MIGRATION },
    { name: 'inventory_item',     sql: INVENTORY_ITEM_MIGRATION },
    { name: 'import_order',       sql: IMPORT_ORDER_MIGRATION },
    { name: 'import_order_item',  sql: IMPORT_ORDER_ITEM_MIGRATION },
    { name: 'export_order',       sql: EXPORT_ORDER_MIGRATION },
    { name: 'export_order_item',  sql: EXPORT_ORDER_ITEM_MIGRATION },
    { name: 'system_event',       sql: SYSTEM_EVENT_MIGRATION },
];

/**
 * runMigrations — Chạy tất cả bảng theo thứ tự tuần tự (sequential await).
 * Đảm bảo FK constraint không bao giờ bị vi phạm.
 *
 * Gọi 1 lần duy nhất từ `combo.ts` / `server.ts` trước khi server nhận request.
 */
export async function runMigrations(pool: Pool): Promise<void> {
    console.log('\n🗄️  [Migration] Starting sequential database migrations...');
    console.log('─'.repeat(55));

    for (const step of MIGRATION_STEPS) {
        try {
            await pool.query(step.sql);
            console.log(`  ✅ [${step.name.padEnd(20)}] Tables ready.`);
        } catch (err) {
            const error = err as Error;
            // Lỗi ở bảng gốc (warehouse, product) thì throw để dừng server
            if (step.name === 'warehouse' || step.name === 'product') {
                console.error(`  ❌ [${step.name}] CRITICAL migration failed: ${error.message}`);
                throw new Error(`Critical migration failed at step [${step.name}]: ${error.message}`);
            }
            // Lỗi ở bảng phụ: log cảnh báo và tiếp tục để server vẫn khởi động
            console.warn(`  ⚠️  [${step.name.padEnd(20)}] Non-critical migration warning: ${error.message}`);
        }
    }

    console.log('─'.repeat(55));
    console.log('✅ [Migration] All migrations completed successfully.\n');
}
