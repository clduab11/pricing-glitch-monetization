/**
 * Prisma 7 Client Configuration
 * 
 * Uses the adapter pattern required by Prisma 7.
 * Connection is established via @prisma/adapter-pg.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Database connection string
const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://postgres:postgres@localhost:5432/pricing_glitch';

// Connection pool configuration
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Prisma PostgreSQL adapter
const adapter = new PrismaPg(pool);

// Global type for development singleton
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Create Prisma client with adapter
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });
}

/**
 * Get Prisma client singleton
 * Uses global singleton in development to prevent hot reload issues
 */
function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return createPrismaClient();
  }

  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }

  return global.prisma;
}

// Export singleton client
export const db = getPrismaClient();

// Export pool for direct access if needed
export { pool };

// Re-export types
export type { PrismaClient };
