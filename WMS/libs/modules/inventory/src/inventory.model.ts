// ============================================================
// Inventory — Interfaces & DTOs
// ============================================================

export interface IInventory {
    id: string;
    warehouse_id: string;
    slot_id: string;
    product_id: string; // Trong DB là UUID, nhưng để linh hoạt tạm thời ta nhận string
    quantity: number;
    reserved_quantity: number;
    created_at: Date;
    updated_at: Date;
}

export interface InventoryStats {
    totalCapacity: number;
    usedCapacity: number;
}
