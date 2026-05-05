/**
 * IEventBus — Interface chuẩn cho mọi EventBus implementation.
 * Dùng TypeScript interface thay vì abstract class để nhẹ nhàng hơn.
 */
export interface IEventBus {
    publish(eventName: string, payload: unknown): void;
    subscribe(eventName: string, handler: (payload: unknown) => void): void;
    unsubscribe(eventName: string, handler: (payload: unknown) => void): void;
}
