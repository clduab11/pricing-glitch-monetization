import { Queue, Worker, Job } from 'bullmq';
import { db } from '../db/index';
import { TwitterClient } from '../lib/notifications/twitter';
import { ChartGenerator } from '../lib/services/chart-generator';
import { AffiliateService } from '../lib/services/affiliate';
import { fileURLToPath } from 'url';

const twitter = new TwitterClient();
const QUEUE_NAME = 'social-poster';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const socialQueue = new Queue(QUEUE_NAME, { connection });

// Define job types
interface SocialPostJob {
    jobType: 'hourly-digest' | 'post-single';
    glitchId?: string;
}

const worker = new Worker(QUEUE_NAME, async (job: Job<SocialPostJob>) => {
    try {
        console.log(`[social-poster] Processing job ${job.id}: ${job.name}, jobType: ${job.data.jobType}`);

        if (job.name === 'hourly-digest' || job.data.jobType === 'hourly-digest') {
            await processHourlyDigest();
        } else if (job.name === 'post-single' && job.data.glitchId) {
            await processSingleGlitch(job.data.glitchId);
        }

        console.log(`[social-poster] Job ${job.id} completed successfully`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error(`[social-poster] Job ${job.id} failed:`, {
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
    console.error(`[social-poster] Job ${job?.id} failed with error: ${err.message}`);
});

worker.on('error', (err) => {
    console.error('[social-poster] Worker error:', err);
});

async function processHourlyDigest() {
    console.log("Running hourly social digest...");
    // 1. Find top unposted glitch from last 24h
    // Criteria: High confidence, High discount, Has Image
    const topGlitch = await db.validatedGlitch.findFirst({
        where: {
            isGlitch: true,
            confidence: { gt: 80 },
            socialPosts: { none: { platform: 'twitter' } }, // Not posted yet on Twitter
            product: {
                imageUrl: { not: null }
            }
        },
        orderBy: [
            { profitMargin: 'desc' },
            { validatedAt: 'desc' }
        ],
        include: {
            product: {
                include: {
                    priceHistory: true
                }
            }
        }
    });

    if (!topGlitch) {
        console.log("No eligible glitches found for hourly post.");
        return;
    }

    await processSingleGlitch(topGlitch.id);
}

async function processSingleGlitch(glitchId: string) {
    const glitch = await db.validatedGlitch.findUnique({
        where: { id: glitchId },
        include: {
            product: {
                include: {
                    priceHistory: true
                }
            }
        }
    });

    if (!glitch) return;

    console.log(`Posting glitch ${glitch.id} for ${glitch.product.title}`);

    // Generate Chart
    let mediaBuffer: Buffer | undefined;
    try {
        mediaBuffer = await ChartGenerator.generate({
            title: glitch.product.title.substring(0, 30) + '...', // Truncate title
            data: glitch.product.priceHistory,
            width: 1200,
            height: 675 // 16:9 for Twitter
        });
    } catch (e) {
        console.error("Failed to generate chart", e);
    }

    // Compose Text
    const price = Number(glitch.product.price);
    const original = glitch.product.originalPrice ? Number(glitch.product.originalPrice) : null;
    const discount = original ? Math.round(((original - price) / original) * 100) : 0;
    
    // Construct tweet
    const text = `🚨 PRICE GLITCH DETECTED! 🚨\n\n` +
                 `${glitch.product.title.substring(0, 80)}...\n\n` + 
                 `💰 NOW: $${price.toFixed(2)}\n` +
                 (original ? `❌ WAS: $${original.toFixed(2)} (-${discount}%)\n` : '') +
                 `\n📉 Probability: ${glitch.confidence}%\n` +
                 `🔗 ${AffiliateService.transformUrl(glitch.product.url, glitch.product.retailer)}\n\n` +
                 `#priceglitch #deal #${glitch.product.retailer}`;

    // Post to Twitter
    const tweetId = await twitter.postTweet({
        text,
        mediaBuffer
    });

    if (tweetId) {
        console.log(`Tweet posted: ${tweetId}`);
        // Record in DB
        await db.socialPost.create({
            data: {
                platform: 'twitter',
                postId: tweetId,
                content: text,
                glitchId: glitch.id,
                status: 'posted',
                mediaUrls: mediaBuffer ? ['local-generated-chart'] : []
            }
        });
    } else {
        console.error("Failed to post tweet");
    }
}

// Initialize Cron when run directly
async function setupCron() {
    // Add repeatable job every hour
    await socialQueue.add('hourly-digest', { jobType: 'hourly-digest' }, {
        repeat: {
            pattern: '0 * * * *' // Every hour
        }
    });
    console.log("Scheduled hourly social digest.");
}

// If running as a standalone worker process
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    setupCron().then(() => {
        console.log("Social Poster Worker started...");
    });
}
