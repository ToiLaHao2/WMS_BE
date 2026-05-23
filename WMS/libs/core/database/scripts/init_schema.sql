-- ====================================================================
-- WMSS: Warehouse Management System Simulation
-- Database Initialization Script (PostgreSQL)
-- ====================================================================

-- Kích hoạt extension hỗ trợ sinh UUID tự động
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 1. MASTER DATA TABLES
-- ====================================================================

CREATE TABLE IF NOT EXISTS "warehouse" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) UNIQUE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "width" FLOAT NOT NULL,
    "height" FLOAT NOT NULL,
    "layout_type" VARCHAR(50) NOT NULL,
    "layout_data" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "warehouse_slot" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL REFERENCES "warehouse"("id") ON DELETE CASCADE,
    "slot_code" VARCHAR(50) NOT NULL,
    "x" FLOAT NOT NULL,
    "y" FLOAT NOT NULL,
    "width" FLOAT NOT NULL,
    "height" FLOAT NOT NULL,
    "slot_type" VARCHAR(20) NOT NULL, -- STORAGE, AISLE, BLOCKED, etc.
    "occupied_percent" FLOAT DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, RESERVED
    "metadata" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("warehouse_id", "slot_code")
);

CREATE TABLE IF NOT EXISTS "agv" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) UNIQUE NOT NULL,
    "warehouse_id" UUID NOT NULL REFERENCES "warehouse"("id") ON DELETE CASCADE,
    "model" VARCHAR(100),
    "max_weight" FLOAT,
    "battery_capacity" FLOAT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'IDLE',
    "current_x" FLOAT,
    "current_y" FLOAT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "product" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) UNIQUE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "width" FLOAT NOT NULL,
    "height" FLOAT NOT NULL,
    "weight" FLOAT NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 2. INVENTORY (TỒN KHO)
-- ====================================================================

CREATE TABLE IF NOT EXISTS "inventory" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL REFERENCES "warehouse"("id"),
    "slot_id" UUID NOT NULL REFERENCES "warehouse_slot"("id"),
    "product_id" UUID NOT NULL REFERENCES "product"("id"),
    "quantity" INT NOT NULL DEFAULT 0,
    "reserved_quantity" INT NOT NULL DEFAULT 0, -- Số lượng đang được lên kế hoạch xuất nhưng chưa đi
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("warehouse_id", "slot_id", "product_id")
);

-- ====================================================================
-- 3. INBOUND ORDERS (NHẬP HÀNG)
-- ====================================================================

CREATE TABLE IF NOT EXISTS "inbound_order" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL REFERENCES "warehouse"("id"),
    "code" VARCHAR(50) UNIQUE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "inbound_order_item" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "inbound_order_id" UUID NOT NULL REFERENCES "inbound_order"("id") ON DELETE CASCADE,
    "product_id" UUID NOT NULL REFERENCES "product"("id"),
    "assigned_slot_id" UUID REFERENCES "warehouse_slot"("id"),
    "quantity" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 4. OUTBOUND ORDERS (XUẤT HÀNG)
-- ====================================================================

CREATE TABLE IF NOT EXISTS "outbound_order" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL REFERENCES "warehouse"("id"),
    "code" VARCHAR(50) UNIQUE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "outbound_order_item" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "outbound_order_id" UUID NOT NULL REFERENCES "outbound_order"("id") ON DELETE CASCADE,
    "product_id" UUID NOT NULL REFERENCES "product"("id"),
    "picked_slot_id" UUID REFERENCES "warehouse_slot"("id"),
    "quantity" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- 5. SEED DATA (DỮ LIỆU MẪU)
-- ====================================================================

INSERT INTO "product" ("id", "code", "name", "description", "width", "height", "weight") VALUES
('11111111-1111-1111-1111-111111111111', 'PRD-IPHONE15', 'iPhone 15 Pro Max', 'Apple Smartphone 256GB', 0.2, 0.1, 0.5),
('22222222-2222-2222-2222-222222222222', 'PRD-MACBOOK', 'MacBook Pro M3', 'Apple Laptop 14-inch', 0.4, 0.3, 1.5),
('33333333-3333-3333-3333-333333333333', 'PRD-AIRPODS', 'AirPods Pro 2', 'Wireless Earbuds', 0.1, 0.1, 0.2),
('44444444-4444-4444-4444-444444444444', 'PRD-IPAD', 'iPad Air 5', 'Apple Tablet 64GB', 0.3, 0.2, 0.8),
('55555555-5555-5555-5555-555555555555', 'PRD-WATCH', 'Apple Watch Series 9', 'Smartwatch 45mm', 0.1, 0.1, 0.3)
ON CONFLICT ("code") DO NOTHING;
