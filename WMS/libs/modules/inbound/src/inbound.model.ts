// ============================================================
// Inbound — Interfaces & Enums
// Quản lý các lệnh nhập hàng
// ============================================================

export enum InboundOrderStatus {
    PENDING = 'PENDING',       // Vừa tạo, chưa xử lý
    ALLOCATED = 'ALLOCATED',   // Đã cấp phát slot thành công
    PROCESSING = 'PROCESSING', // AGV đang đi cất hàng
    COMPLETED = 'COMPLETED',   // Đã cất xong
    FAILED = 'FAILED',         // Lỗi (vd: không còn slot)
}

// === INTERFACES ===

export interface IInboundOrder {
    id: string;
    warehouse_id: string;
    code: string;
    status: InboundOrderStatus;
    created_at: Date;
    updated_at: Date;
}

export interface IInboundOrderItem {
    id: string;
    inbound_order_id: string;
    product_id: string;
    assigned_slot_id: string | null;
    quantity: number;
    created_at: Date;
    updated_at: Date;
}

// === DTOs (Data Transfer Objects — dùng để nhận request từ client) ===

export interface InboundOrderItemDTO {
    product_id: string;
    quantity: number;
}

export interface CreateInboundOrderDTO {
    warehouse_id: string;
    code: string;
    items: InboundOrderItemDTO[];
}
