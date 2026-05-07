/**
 * IEventBroker — Interface trừu tượng cho hệ thống Message Queue.
 *
 * Giai đoạn 1: Dùng ConsoleEventBroker (chỉ console.log, không cần Kafka).
 * Giai đoạn 2: Thay bằng KafkaEventBroker (kết nối Kafka thật) mà KHÔNG cần sửa code Service.
 *
 * Cách dùng trong Service (thông qua Awilix DI):
 * ```
 * constructor(private readonly eventBroker: IEventBroker) {}
 *
 * async completeInbound() {
 *     await this.eventBroker.publish('warehouse.item.stored', { itemId: '123', slotCode: 'A1' });
 * }
 * ```
 */
export interface IEventBroker {
    /**
     * Gửi một message tới một topic cụ thể.
     * @param topic - Tên topic (VD: 'warehouse.item.stored', 'agv.task.created')
     * @param payload - Dữ liệu gửi kèm (sẽ được JSON.stringify)
     */
    publish(topic: string, payload: Record<string, unknown>): Promise<void>;

    /**
     * Đăng ký lắng nghe một topic.
     * @param topic - Tên topic cần lắng nghe
     * @param handler - Hàm callback xử lý khi có message đến
     */
    subscribe(topic: string, handler: (payload: Record<string, unknown>) => Promise<void>): Promise<void>;

    /**
     * Ngắt kết nối với Message Broker (nếu có).
     */
    disconnect(): Promise<void>;
}

/**
 * ConsoleEventBroker — Implementation "giả" (Dummy) cho giai đoạn phát triển.
 * Tất cả message chỉ được in ra console thay vì gửi tới Kafka.
 * Khi sẵn sàng tích hợp Kafka, chỉ cần viết KafkaEventBroker implements IEventBroker
 * và đổi đăng ký trong Awilix Container.
 */
export class ConsoleEventBroker implements IEventBroker {
    async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
        console.log(`📤 [EventBroker] → Topic: "${topic}"`, JSON.stringify(payload, null, 2));
    }

    async subscribe(topic: string, handler: (payload: Record<string, unknown>) => Promise<void>): Promise<void> {
        console.log(`👂 [EventBroker] Subscribed to topic: "${topic}" (Console mode — no real broker)`);
    }

    async disconnect(): Promise<void> {
        console.log('🔌 [EventBroker] Disconnected (Console mode)');
    }
}
