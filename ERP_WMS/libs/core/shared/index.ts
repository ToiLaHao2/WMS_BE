// === Contracts / Interfaces ===
export type { IEventBus } from './src/base-event-bus';
export type { IAppModule } from './src/app-module';

// === Implementations ===
export { eventBus } from './src/in-memory-event-bus';
export { loadModules } from './src/module-loader';

// === Infrastructure Utilities ===
export { runMigrations } from './src/migration-runner';
export { setupGracefulShutdown } from './src/graceful-shutdown';

// === Middlewares ===
export { validateRequest } from './src/middlewares/validate-request';
export { requireAuth, requireRole } from './src/middlewares/auth-guard';
