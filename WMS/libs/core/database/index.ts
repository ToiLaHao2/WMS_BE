export type { IDatabaseAdapter } from './src/adapters/base.adapter';

// Firebase (kept for reference, currently inactive in DI)
export { firebaseAdapter } from './src/adapters/firebase.adapter';
export { BaseFirebaseRepository } from './src/repositories/base-firebase.repository';

// PostgreSQL (active)
export { postgresAdapter } from './src/adapters/postgres.adapter';
export { BasePostgresRepository } from './src/repositories/base-postgres.repository';

// Transaction Manager (Unit of Work pattern)
export { transactionManager } from './src/transaction-manager';

// MongoDB (for Logs, Notifications, Analytics)
export { mongoAdapter } from './src/adapters/mongo.adapter';
export type { MongoConfig } from './src/adapters/mongo.adapter';
