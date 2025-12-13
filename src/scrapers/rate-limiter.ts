
import { createClient } from 'redis';

export class RateLimiter {
  private redisClient: ReturnType<typeof createClient>;

  constructor() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL,
    });
  }

  async initialize(): Promise<void> {
    await this.redisClient.connect();
  }

  async waitForSlot(
    retailer: string,
    requestsPerMinute = 10
  ): Promise<void> {
    const key = `ratelimit:${retailer}`;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Remove old entries
    await this.redisClient.zRemRangeByScore(
      key,
      0,
      windowStart
    );

    // Count requests in current window
    const count = await this.redisClient.zCard(key);

    if (count >= requestsPerMinute) {
      // Calculate wait time
      const oldest = await this.redisClient.zRange(key, 0, 0);
      if (oldest.length > 0) {
        // zRange returns array of strings (members)
        // We stored the timestamp as the score AND the value (as string)
        // But zRange by default returns members.
        // If we want scores we need WITHSCORES but the node-redis API separates it.
        // Actually, let's assume valid members are timestamps.
        const oldestTimestamp = parseInt(oldest[0]);
        if (!isNaN(oldestTimestamp)) {
            const waitTime = oldestTimestamp + 60000 - now;
            
            if (waitTime > 0) {
              console.log(
                `Rate limit reached for ${retailer}, waiting ${waitTime}ms`
              );
              await new Promise(resolve => 
                setTimeout(resolve, waitTime)
              );
            }
        }
      }
    }

    // Add current request
    // Score is required, value is required.
    // We use now as both.
    await this.redisClient.zAdd(key, {
      score: now,
      value: now.toString(),
    });

    // Set expiry
    await this.redisClient.expire(key, 60);
  }
}
