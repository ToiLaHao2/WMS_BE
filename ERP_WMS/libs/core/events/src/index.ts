import { Emitter } from '@socket.io/redis-emitter';
import { cacheManager } from '@core/cache';

export interface IEventPublisher {
    /** 
     * Gửi event Real-time qua user room dựa trên userId
     */
    emitToUser(userId: string, event: string, data: any): void;
    
    /**
     * Gửi event Broadcast cho tất cả user
     */
    broadcast(event: string, data: any): void;
}

export class SocketIoRedisPublisher implements IEventPublisher {
    private emitter: Emitter | null = null;

    constructor({ cache }: { cache: typeof cacheManager }) {
        const pubClient = cache.getRedisClient();
        if (pubClient) {
            this.emitter = new Emitter(pubClient);
            console.log('✅ [EventPublisher] Socket.io Redis Emitter initialized');
        } else {
            console.warn('⚠️  [EventPublisher] Redis connection missing, emitter will be ignored');
        }
    }

    emitToUser(userId: string, event: string, data: any): void {
        if (!this.emitter) return;
        this.emitter.to(`user_${userId}`).emit(event, data);
    }

    broadcast(event: string, data: any): void {
        if (!this.emitter) return;
        this.emitter.emit(event, data);
    }
}
