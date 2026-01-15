import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { 
  getDueJobs, 
  recordJobRun, 
  runAllCleanup,
  checkDatabaseHealth 
} from '@/db/utils';
import { getTopGlitches, DigestGlitch } from '@/lib/analysis/ranking';
import { buildDigestEmail, buildDigestText } from '@/lib/notifications/templates/digest';
import { isBeehiivEnabled, publishDigest } from '@/lib/notifications/providers/beehiiv';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

// Secret key to protect cron endpoints (set in environment)
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron
 * Execute scheduled jobs - call this from external cron service
 * (e.g., Vercel Cron, Railway Cron, GitHub Actions, cron-job.org)
 * 
 * Headers required:
 * - Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    jobs: [],
  };

  try {
    // Get jobs that are due
    const dueJobs = await getDueJobs();
    
    for (const job of dueJobs) {
      const jobResult: Record<string, unknown> = {
        id: job.id,
        name: job.name,
        type: job.jobType,
      };

      const startTime = Date.now();

      try {
        // Execute job based on type
        let result: Record<string, unknown> = {};

        switch (job.jobType) {
          case 'cleanup':
            result = await runAllCleanup();
            break;

          case 'digest':
            result = await sendDailyDigest();
            break;

          case 'scrape':
            result = await triggerScrapeJobs(job.metadata as Record<string, unknown>);
            break;

          case 'health_check':
            result = await checkDatabaseHealth();
            break;

          default:
            result = { skipped: true, reason: `Unknown job type: ${job.jobType}` };
        }

        const duration = Date.now() - startTime;
        await recordJobRun(job.id, 'success', result, undefined, duration);

        jobResult.status = 'success';
        jobResult.duration = duration;
        jobResult.result = result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await recordJobRun(job.id, 'failed', undefined, errorMessage, duration);

        jobResult.status = 'failed';
        jobResult.duration = duration;
        jobResult.error = errorMessage;
      }

      (results.jobs as unknown[]).push(jobResult);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Cron execution error:', error);
    return NextResponse.json(
      { error: 'Cron execution failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron
 * Get status of scheduled jobs
 */
export async function GET(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jobs = await db.scheduledJob.findMany({
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      jobs: jobs.map((job: { id: string; name: string; jobType: string; schedule: string; enabled: boolean; lastRunAt: Date | null; lastStatus: string | null; nextRunAt: Date | null; runs: Array<{ id: string; status: string; startedAt: Date; duration: number | null }> }) => ({
        id: job.id,
        name: job.name,
        type: job.jobType,
        schedule: job.schedule,
        enabled: job.enabled,
        lastRunAt: job.lastRunAt,
        lastStatus: job.lastStatus,
        nextRunAt: job.nextRunAt,
        recentRuns: job.runs.map((run: { id: string; status: string; startedAt: Date; duration: number | null }) => ({
          id: run.id,
          status: run.status,
          startedAt: run.startedAt,
          duration: run.duration,
        })),
      })),
    });
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Job Implementations
// ============================================================================

async function sendDailyDigest(): Promise<Record<string, unknown>> {
  const stats = {
    glitchesFound: 0,
    eligibleUsers: 0,
    emailsSent: 0,
    emailsFailed: 0,
    beehiivPostId: null as string | null,
    errors: [] as string[],
  };

  try {
    // Get top glitches from the last 24 hours
    const glitches = await getTopGlitches(15);
    stats.glitchesFound = glitches.length;

    if (glitches.length === 0) {
      return { ...stats, message: 'No glitches found in the last 24 hours' };
    }

    // Get eligible users for daily digest
    const users = await db.user.findMany({
      where: {
        subscription: {
          tier: { in: ['starter', 'pro', 'elite'] },
          status: 'active',
        },
        preferences: {
          enableEmail: true,
          enableDailyDigest: true,
        },
      },
      include: {
        preferences: true,
      },
    });
    stats.eligibleUsers = users.length;

    // Initialize Resend client
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.EMAIL_FROM || 'alerts@pricehawk.io';

    // Send personalized digests to each user
    for (const user of users) {
      try {
        // Filter glitches based on user preferences
        const userGlitches = filterGlitchesForUser(glitches, user.preferences);
        
        if (userGlitches.length === 0) {
          continue;
        }

        const html = buildDigestEmail(userGlitches, user.email);
        const text = buildDigestText(userGlitches);

        const result = await resend.emails.send({
          from: fromEmail,
          to: user.email,
          subject: `🦅 Daily Digest: ${userGlitches.length} Hot Glitches Today`,
          html,
          text,
        });

        if (result.error) {
          stats.emailsFailed++;
          stats.errors.push(`${user.email}: ${result.error.message}`);
        } else {
          stats.emailsSent++;
          
          // Update last digest sent timestamp
          if (user.preferences) {
            await db.userPreference.update({
              where: { id: user.preferences.id },
              data: { lastDigestSentAt: new Date() },
            });
          }
        }
      } catch (error) {
        stats.emailsFailed++;
        stats.errors.push(`${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Publish to beehiiv if enabled
    if (isBeehiivEnabled()) {
      try {
        const postId = await publishDigest(glitches);
        stats.beehiivPostId = postId;
      } catch (error) {
        stats.errors.push(`beehiiv: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return stats;
  } catch (error) {
    stats.errors.push(`Fatal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return stats;
  }
}

/**
 * Filter glitches based on user preferences
 */
function filterGlitchesForUser(
  glitches: DigestGlitch[],
  preferences: {
    categories?: string[];
    retailers?: string[];
    minProfitMargin?: number | { toNumber: () => number };
    minPrice?: number | { toNumber: () => number };
    maxPrice?: number | { toNumber: () => number };
  } | null
): DigestGlitch[] {
  if (!preferences) return glitches;

  return glitches.filter(glitch => {
    // Category filter
    if (preferences.categories && preferences.categories.length > 0) {
      // Skip if no category match (would need product category data)
    }

    // Retailer filter
    if (preferences.retailers && preferences.retailers.length > 0) {
      if (!preferences.retailers.includes(glitch.retailer.toLowerCase())) {
        return false;
      }
    }

    // Profit margin filter
    const minMargin = preferences.minProfitMargin
      ? typeof preferences.minProfitMargin === 'number'
        ? preferences.minProfitMargin
        : preferences.minProfitMargin.toNumber()
      : 0;
    if (glitch.savingsPercent < minMargin) {
      return false;
    }

    // Price range filter
    const minPrice = preferences.minPrice
      ? typeof preferences.minPrice === 'number'
        ? preferences.minPrice
        : preferences.minPrice.toNumber()
      : 0;
    const maxPrice = preferences.maxPrice
      ? typeof preferences.maxPrice === 'number'
        ? preferences.maxPrice
        : preferences.maxPrice.toNumber()
      : 10000;
    if (glitch.glitchPrice < minPrice || glitch.glitchPrice > maxPrice) {
      return false;
    }

    return true;
  });
}

async function triggerScrapeJobs(
  metadata?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // This would trigger scraping jobs via BullMQ
  // For now, just return acknowledgment
  return {
    triggered: true,
    metadata,
  };
}
