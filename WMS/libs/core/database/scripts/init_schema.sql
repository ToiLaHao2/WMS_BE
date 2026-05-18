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
