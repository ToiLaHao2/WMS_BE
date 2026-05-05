/**
 * IDatabaseAdapter — Interface chuẩn cho mọi Database Adapter.
 * Thay thế abstract class bằng TS interface.
 */
export interface IDatabaseAdapter {
    connect(): unknown;
    getDB(): unknown;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
