// ============================================================
// Outbound — Interfaces & Enums
// Quản lý các lệnh xuất hàng
// ============================================================

export enum OutboundOrderStatus {
    PENDING = 'PENDING',       // Vừa tạo, chưa xử lý
    VALIDATED = 'VALIDATED',   // Đã tìm thấy hàng trong kho và giữ số lượng thành công
    PROCESSING = 'PROCESSING', // AGV đang đi lấy hàng
    COMPLETED = 'COMPLETED',   // Đã xuất kho thành công
    FAILED = 'FAILED',         // Lỗi (vd: không đủ hàng tồn kho)
}

// === INTERFACES ===

export interface IOutboundOrder {
    id: string;
    warehouse_id: string;
    code: string;
    status: OutboundOrderStatus;
    created_at: Date;
    updated_at: Date;
}

export interface IOutboundOrderItem {
    id: string;
    outbound_order_id: string;
    product_id: string;
    picked_slot_id: string | null;
    quantity: number;
    created_at: Date;
    updated_at: Date;
}

// === DTOs (Data Transfer Objects — dùng để nhận request từ client) ===

export interface OutboundOrderItemDTO {
    product_id: string;
    quantity: number;
}

export interface CreateOutboundOrderDTO {
    warehouse_id: string;
    code: string;
    items: OutboundOrderItemDTO[];
}
