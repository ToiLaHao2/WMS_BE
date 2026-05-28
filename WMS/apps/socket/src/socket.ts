import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { container } from '@core/container';
import * as jwt from 'jsonwebtoken';
import { securityConfig } from '@core/config';
import { Kafka } from 'kafkajs';

const PORT = 3001;

console.log('\n--- 🔌 SOCKET SERVICE STARTING ---');

export function startSocketServer(adapter: ReturnType<typeof createAdapter> | null, httpServer?: any): void {
    const ioOptions = {
        cors: {
            origin: [
                'http://localhost:5173',        // Frontend Vite dev
                'https://wmss.hao-dev.cloud',   // Frontend production 
            ],
            methods: ['GET', 'POST'],
            credentials: true,
        },
        ...(adapter ? { adapter } : {})
    };

    let io: Server;
    if (httpServer) {
        io = new Server(httpServer, ioOptions);
    } else {
        const http = require('http');
        const customServer = http.createServer();
        io = new Server(customServer, ioOptions);
        customServer.listen(PORT, '0.0.0.0');
    }

    // Authentication Middleware
    io.use((socket: Socket, next) => {
        // Bỏ qua auth trong môi trường Development (simulation chưa có login flow)
        if (process.env.NODE_ENV === 'development') {
            (socket as any).userId = 'dev-simulator';
            (socket as any).userRole = 'admin';
            return next();
        }

        const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.replace('Bearer ', '');

        if (!token) {
            console.log(`🔌 [Auth Failed] Missing token for socket: ${socket.id}`);
            return next(new Error('Authentication Error: Token missing'));
        }

        try {
            const decoded = jwt.verify(token, securityConfig.jwtSecret) as { userId: string, role: string };
            // Lấy ID thật sự của người dùng gán vào socket
            (socket as any).userId = decoded.userId;
            (socket as any).userRole = decoded.role;
            next();
        } catch (error) {
            console.log(`🔌 [Auth Error] Invalid token for socket: ${socket.id}`);
            return next(new Error('Authentication Error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = (socket as any).userId;
        console.log(`⚡ Client connected: ${socket.id} (User: ${userId})`);

        // Gán User vào 1 Room riêng biệt mang tên id của họ để Emitter bắn trúng
        const userRoom = `user_${userId}`;
        socket.join(userRoom);
        console.log(`📍 Socket ${socket.id} joined room: ${userRoom}`);

        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id} (User: ${userId})`);
        });
    });

    // --- KAFKA CONSUMER SETUP ---
    const kafka = new Kafka({
        clientId: 'wmss-socket-consumer',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
    });

    const consumer = kafka.consumer({ groupId: 'agv-telemetry-group' });

    async function startKafkaConsumer() {
        let connected = false;
        while (!connected) {
            try {
                await consumer.connect();
                await consumer.subscribe({ topic: 'agv-telemetry', fromBeginning: false });
                console.log('✅ [Kafka] Consumer connected & listening to agv-telemetry');
                connected = true;

                await consumer.run({
                    eachMessage: async ({ topic, partition, message }) => {
                        if (message.value) {
                            try {
                                const data = JSON.parse(message.value.toString());
                                // Broadcast tọa độ xe tới tất cả client Frontend
                                io.emit('agv_moved', data);
                            } catch (err) {
                                console.error('Lỗi parse Kafka message:', err);
                            }
                        }
                    },
                });
            } catch (error) {
                console.error('❌ [Kafka] Consumer error:', (error as Error).message);
                console.log('🔄 [Kafka] Retrying in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    // Chạy ngầm Kafka Consumer
    startKafkaConsumer();

    const mode = adapter ? 'Redis adapter' : 'in-memory (single-node)';
    if (httpServer) {
        console.log(`🚀 Socket Server attached to existing HTTP server — ${mode}`);
    } else {
        console.log(`🚀 Socket Server running on port ${PORT} — ${mode}`);
    }
    console.log(`ℹ️  Listening for events via Emit Redis channel...`);
}

export async function bootstrapSocket(httpServer?: any) {
    const cache = container.resolve('cache');
    const baseConnection = cache.getRedisClient();

    if (!baseConnection) {
        startSocketServer(null, httpServer);
    } else {
        // Socket.io Redis adapter needs dedicated connections for pub and sub
        const pubClient = baseConnection.duplicate();
        const subClient = baseConnection.duplicate();

        try {
            await Promise.all([pubClient.connect(), subClient.connect()]);
            console.log('✅ [Socket] Redis adapter connected.');
            startSocketServer(createAdapter(pubClient, subClient), httpServer);
        } catch (err: any) {
            console.warn('⚠️  [Socket] Starting without Redis adapter (single-node mode). Error:', err.message);
            startSocketServer(null, httpServer);
        }
    }
}

// Standalone initialization
if (!process.env.COMBO_MODE) {
    bootstrapSocket().catch(err => console.error(err));
}
