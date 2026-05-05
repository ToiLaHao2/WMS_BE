import { app } from './app';
import { appConfig } from '@core/config';

const PORT = appConfig.port;

// === START SERVER (STANDALONE) ===
app.listen(PORT, () => {
    console.log(`🚀 Gateway is running at: http://localhost:${PORT}`);
    console.log(`📖 Swagger UI   at: http://localhost:${PORT}/docs`);
});
