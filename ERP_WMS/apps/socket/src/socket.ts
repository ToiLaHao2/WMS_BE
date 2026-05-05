import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { container } from '@core/container';
import * as jwt from 'jsonwebtoken';
import { securityConfig } from '@core/config';

const PORT = 3002;

console.log('\n--- 🔌 SOCKET SERVICE STARTING ---');

export function startSocketServer(adapter: ReturnType<typeof createAdapter> | null, httpServer?: any): void {
    const ioOptions = {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        ...(adapter ? { adapter } : {})
    };
    
    const io = httpServer ? new Server(httpServer, ioOptions) : new Server(PORT, ioOptions);

    // Authentication Middleware
    io.use((socket: Socket, next) => {
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
