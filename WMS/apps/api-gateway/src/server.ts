import { app } from './app';
import { appConfig } from '@core/config';

import { startWmsGrpcServer } from './grpc-server';

const PORT = appConfig.port;

// === START SERVER (STANDALONE) ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Gateway is running at: http://localhost:${PORT}`);
    console.log(`📖 Swagger UI   at: http://localhost:${PORT}/docs`);
    
    // Khởi động gRPC Server cho WMS
    startWmsGrpcServer(50053);
});
