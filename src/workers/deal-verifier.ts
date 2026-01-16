import { Queue, Worker, Job } from 'bullmq';
import { db } from '../db/index';
// Helper to restart scraping for verification
// We will reuse the scraping queue for this to avoid logic duplication
// But we need a separate "verification" job type that reports back status

const QUEUE_NAME = 'deal-verifier';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const verifierQueue = new Queue(QUEUE_NAME, { connection });
const scraperQueue = new Queue('scraping-jobs', { connection });

interface VerifyJobData {
    glitchId: string;
    url: string;
    retailer: string;
}

const worker = new Worker(QUEUE_NAME, async (job: Job<VerifyJobData>) => {
    try {
        console.log(`[deal-verifier] Processing job ${job.id}: ${job.name}, glitchId: ${job.data.glitchId}`);

        if (job.name === 'check-expirations') {
            await scheduleActiveDeals();
        } else if (job.name === 'verify-glitch') {
            await verifyGlitch(job.data);
        }

        console.log(`[deal-verifier] Job ${job.id} completed successfully`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error(`[deal-verifier] Job ${job.id} failed:`, {
            error: errorMessage,
            stack: errorStack,
            jobName: job.name,
            jobData: job.data,
            attemptsMade: job.attemptsMade,
        });

        // Re-throw to mark job as failed and enable BullMQ retry mechanism
        throw error;
    }
}, { connection });

worker.on('failed', (job, err) => {
    console.error(`[deal-verifier] Job ${job?.id} failed with error: ${err.message}`);
});

worker.on('error', (err) => {
    console.error('[deal-verifier] Worker error:', err);
});

async function scheduleActiveDeals() {
    // Find active glitches older than 2 hours (give them time to live)
    const activeGlitches = await db.validatedGlitch.findMany({
        where: {
            status: 'active',
            validatedAt: {
                lt: new Date(Date.now() - 2 * 60 * 60 * 1000)
            }
        },
        include: { product: true }
    });

    console.log(`Found ${activeGlitches.length} active deals to verify.`);

    for (const glitch of activeGlitches) {
        await verifierQueue.add('verify-glitch', {
            glitchId: glitch.id,
            url: glitch.product.url,
            retailer: glitch.product.retailer
        });
    }
}

async function verifyGlitch(data: VerifyJobData) {
    // Idea: Trigger a special scrape job that we can listen to? 
    // Or just trigger a scrape and let the anomaly detector handle "resolution"?
    // A better approach for "verification" is to explicitly fetch the price NOW.
    // Re-using the scraping infrastructure might be complex if it's fire-and-forget.
    
    // For now, let's just trigger a re-scrape. 
    // If the price comes back "normal", the anomaly detector *should* eventually see it.
    // BUT, the anomaly detector looks for NEW anomalies. It doesn't close old ones.
    // So we need a mechanism to update the existing anomaly.
    
    // We will assume that we need to write a specific checking function here.
    // Since we don't want to duplicate scraping logic, we should probably extract the scraper's "fetch" logic.
    // However, given the architecture, let's keep it simple:
    // Mark the glitch as "verifying". Dispatch a high-priority scrape job. 
    // OR create a new utility `Scraper.fetchPrice(url)` which we can call here.
    
    // For this MVP, let's mark it as pending verification.
    console.log(`[Mock] Verifying ${data.url} - logic would re-scrape here.`);
    
    // TODO: Implement actual re-Scrape logic here or call a shared service.
    // For now, we will simulate 10% of deals expiring.
    /*
    if (Math.random() < 0.1) {
        await db.validatedGlitch.update({
            where: { id: data.glitchId },
            data: { status: 'expired' }
        });
        console.log(`Deal ${data.glitchId} marked as EXPIRED.`);
        
        // Trigger cleanup (Notification update)
        // await NotificationService.notifyExpiration(data.glitchId);
    }
    */
}

export async function setupVerifierCron() {
    await verifierQueue.add('check-expirations', {}, {
        repeat: {
            pattern: '0 */4 * * *' // Every 4 hours
        }
    });
    console.log("Verifier Cron scheduled.");
}

// Standalone execution
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    setupVerifierCron().then(() => console.log("Deal Verifier Worker Running"));
}
