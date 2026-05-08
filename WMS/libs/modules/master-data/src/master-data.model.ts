// ============================================================
// Master Data — Interfaces & Enums
// Quản lý Warehouse, Warehouse Slot, Product
// ============================================================

// === ENUMS ===

export enum SlotType {
    STORAGE = 'STORAGE',
    AISLE = 'AISLE',
    BLOCKED = 'BLOCKED',
    PICKUP = 'PICKUP',
    DROPOFF = 'DROPOFF',
    CHARGING = 'CHARGING',
}

export enum SlotStatus {
    AVAILABLE = 'AVAILABLE',
    OCCUPIED = 'OCCUPIED',
    RESERVED = 'RESERVED',
    MAINTENANCE = 'MAINTENANCE',
}

export enum AGVStatus {
    IDLE = 'IDLE',
    MOVING = 'MOVING',
    CHARGING = 'CHARGING',
    ERROR = 'ERROR',
}

// === INTERFACES ===

export interface IWarehouse {
    id: string;
    code: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    layout_type: string;
    layout_data: number[][] | null;
    created_at: Date;
    updated_at: Date;
}

export interface IWarehouseSlot {
    id: string;
    warehouse_id: string;
    slot_code: string;
    x: number;
    y: number;
    width: number;
    height: number;
    slot_type: SlotType;
    occupied_percent: number;
    status: SlotStatus;
    metadata: any; // JSONB for path directions, etc.
    created_at: Date;
    updated_at: Date;
}

export interface IAGV {
    id: string;
    code: string;
    warehouse_id: string;
    model: string;
    max_weight: number;
    battery_capacity: number;
    status: AGVStatus;
    current_x: number | null;
    current_y: number | null;
    created_at: Date;
    updated_at: Date;
}

export interface IProduct {
    id: string;
    code: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    weight: number;
    created_at: Date;
    updated_at: Date;
}

// === DTOs (Data Transfer Objects — dùng để nhận request từ client) ===

export interface CreateWarehouseDTO {
    code: string;
    name: string;
    description?: string;
    width: number;
    height: number;
    layout_type: string;
    initial_agv_count?: number;
}

export interface UpdateWarehouseDTO {
    name?: string;
    description?: string;
    width?: number;
    height?: number;
    layout_type?: string;
}

export interface CreateWarehouseSlotDTO {
    warehouse_id: string;
    slot_code: string;
    x: number;
    y: number;
    width: number;
    height: number;
    slot_type: SlotType;
    metadata?: any;
}

export interface UpdateWarehouseSlotDTO {
    slot_type?: SlotType;
    occupied_percent?: number;
    status?: SlotStatus;
    metadata?: any;
}

export interface CreateProductDTO {
    code: string;
    name: string;
    description?: string;
    width: number;
    height: number;
    weight: number;
}

export interface UpdateProductDTO {
    name?: string;
    description?: string;
    width?: number;
    height?: number;
    weight?: number;
}

export interface CreateAGVDTO {
    code: string;
    warehouse_id: string;
    model: string;
    max_weight: number;
    battery_capacity: number;
}

export interface UpdateAGVDTO {
    model?: string;
    max_weight?: number;
    battery_capacity?: number;
    status?: AGVStatus;
    current_x?: number | null;
    current_y?: number | null;
}
