/**
 * Database Management Utilities
 * 
 * Provides helper functions for common database operations,
 * maintenance tasks, and query optimization.
 */

import { db } from './index';

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Execute a query with automatic retry on transient failures
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a retryable error
      const isRetryable = 
        lastError.message.includes('connection') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('deadlock');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}

/**
 * Execute a database transaction with automatic rollback on error
 * Uses Prisma 7's $transaction API
 */
export async function transaction<T>(
  operations: Parameters<typeof db.$transaction>[0]
): Promise<T> {
  return db.$transaction(operations) as Promise<T>;
}

/**
 * Paginate query results
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function getPaginationParams(params: PaginationParams) {
  const page = Math.max(1, params.page || 1);
  const maxSize = params.maxPageSize || 100;
  const pageSize = Math.min(Math.max(1, params.pageSize || 20), maxSize);
  const skip = (page - 1) * pageSize;

  return { page, pageSize, skip, take: pageSize };
}

// ============================================================================
// Audit Logging
// ============================================================================

export type AuditAction = 
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'glitch.detected'
  | 'glitch.validated'
  | 'notification.sent'
  | 'api.accessed';

export interface AuditLogParams {
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: (params.metadata || {}) as any,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    // Don't throw - audit log failures shouldn't break the main flow
    console.error('Failed to create audit log:', error);
  }
}

// ============================================================================
// Scheduled Jobs
// ============================================================================

export interface JobDefinition {
  name: string;
  jobType: string;
  schedule: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create or update a scheduled job
 */
export async function upsertScheduledJob(job: JobDefinition) {
  return db.scheduledJob.upsert({
    where: { name: job.name },
    create: {
      name: job.name,
      jobType: job.jobType,
      schedule: job.schedule,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: (job.metadata || {}) as any,
      enabled: true,
    },
    update: {
      schedule: job.schedule,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: (job.metadata || {}) as any,
    },
  });
}

/**
 * Get jobs that are due to run
 */
export async function getDueJobs() {
  return db.scheduledJob.findMany({
    where: {
      enabled: true,
      OR: [
        { nextRunAt: null },
        { nextRunAt: { lte: new Date() } },
      ],
    },
  });
}

/**
 * Record a job run
 */
export async function recordJobRun(
  jobId: string,
  status: 'success' | 'failed',
  result?: Record<string, unknown>,
  error?: string,
  duration?: number
) {
  const now = new Date();

  await db.$transaction([
    // Create job run record
    db.jobRun.create({
      data: {
        jobId,
        status,
        completedAt: now,
        duration,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: (result || {}) as any,
        error,
      },
    }),
    // Update job's last run info
    db.scheduledJob.update({
      where: { id: jobId },
      data: {
        lastRunAt: now,
        lastStatus: status,
        lastError: error,
      },
    }),
  ]);
}

// ============================================================================
// API Rate Limiting
// ============================================================================

/**
 * Check and increment API usage for rate limiting
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowMs: number = 60000 // 1 minute default
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  // Upsert usage record
  const usage = await db.apiUsage.upsert({
    where: {
      userId_endpoint_window: {
        userId,
        endpoint,
        window: windowStart,
      },
    },
    create: {
      userId,
      endpoint,
      window: windowStart,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });

  const remaining = Math.max(0, limit - usage.count);
  const allowed = usage.count <= limit;

  return { allowed, remaining, resetAt };
}

// ============================================================================
// Cleanup & Maintenance
// ============================================================================

/**
 * Clean up old price history records (keep last 30 days by default)
 */
export async function cleanupPriceHistory(daysToKeep: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await db.priceHistory.deleteMany({
    where: {
      scrapedAt: { lt: cutoffDate },
    },
  });

  return { deleted: result.count };
}

/**
 * Clean up old job runs (keep last 7 days by default)
 */
export async function cleanupJobRuns(daysToKeep: number = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await db.jobRun.deleteMany({
    where: {
      startedAt: { lt: cutoffDate },
    },
  });

  return { deleted: result.count };
}

/**
 * Clean up old audit logs (keep last 90 days by default)
 */
export async function cleanupAuditLogs(daysToKeep: number = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await db.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  return { deleted: result.count };
}

/**
 * Clean up expired API usage records
 */
export async function cleanupApiUsage(hoursToKeep: number = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursToKeep);

  const result = await db.apiUsage.deleteMany({
    where: {
      window: { lt: cutoffDate },
    },
  });

  return { deleted: result.count };
}

/**
 * Run all cleanup tasks
 */
export async function runAllCleanup() {
  const results = await Promise.all([
    cleanupPriceHistory(),
    cleanupJobRuns(),
    cleanupAuditLogs(),
    cleanupApiUsage(),
  ]);

  return {
    priceHistory: results[0],
    jobRuns: results[1],
    auditLogs: results[2],
    apiUsage: results[3],
  };
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
