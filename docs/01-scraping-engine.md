# Web Scraping Engine

## Overview

The web scraping engine is the foundation of the pricehawk platform. It continuously monitors 100+ retailer websites to discover pricing errors before they become widely known.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│              Scraping Orchestrator                      │
│  (Manages scraping jobs, scheduling, monitoring)        │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴──────────┬────────────────┐
        ▼                      ▼                ▼
┌───────────────┐    ┌──────────────┐   ┌──────────────┐
│  Playwright   │    │  Puppeteer   │   │    Scrapy    │
│  Workers      │    │  Workers     │   │   Workers    │
│               │    │              │   │              │
│ • JavaScript  │    │ • Dynamic    │   │ • Static     │
│   rendering   │    │   content    │   │   pages      │
│ • Anti-bot    │    │ • Heavy JS   │   │ • Fast       │
│   evasion     │    │   sites      │   │ • Efficient  │
└───────────────┘    └──────────────┘   └──────────────┘
        │                      │                │
        └──────────────┬───────┴────────────────┘
                       ▼
              ┌─────────────────┐
              │  Proxy Pool     │
              │  Manager        │
              │                 │
              │ • Rotation      │
              │ • Health check  │
              │ • Geographic    │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Raw Data       │
              │  Storage        │
              │  (S3/Postgres)  │
              └─────────────────┘
```

## Implementation

### 1. Scraping Workers (Playwright)

**File**: `src/scrapers/playwright-worker.ts`

```typescript
import { chromium, Browser, Page } from 'playwright';
import { ProxyManager } from './proxy-manager';
import { RateLimiter } from './rate-limiter';
import { ProductData, ScrapingJob } from './types';

interface ScraperConfig {
  retailer: string;
  targetUrl: string;
  selectors: Record<string, string>;
  antiBot: boolean;
  rateLimit: number; // requests per minute
}

export class PlaywrightWorker {
  private browser: Browser | null = null;
  private proxyManager: ProxyManager;
  private rateLimiter: RateLimiter;

  constructor(
    private config: ScraperConfig,
    proxyManager: ProxyManager,
    rateLimiter: RateLimiter
  ) {
    this.proxyManager = proxyManager;
    this.rateLimiter = rateLimiter;
  }

  async initialize(): Promise<void> {
    const proxy = await this.proxyManager.getProxy();
    
    this.browser = await chromium.launch({
      headless: true,
      proxy: {
        server: proxy.url,
        username: proxy.username,
        password: proxy.password,
      },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });
  }

  async scrapeProducts(job: ScrapingJob): Promise<ProductData[]> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    // Rate limiting
    await this.rateLimiter.waitForSlot(this.config.retailer);

    const page = await this.browser.newPage({
      userAgent: this.getRandomUserAgent(),
    });

    // Anti-detection measures
    if (this.config.antiBot) {
      await this.setupAntiDetection(page);
    }

    try {
      // Navigate with retry logic
      await this.navigateWithRetry(page, job.url);

      // Extract product data
      const products = await this.extractProductData(page);

      return products;
    } finally {
      await page.close();
    }
  }

  private async setupAntiDetection(page: Page): Promise<void> {
    // Override navigator.webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Randomize viewport
    await page.setViewportSize({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100),
    });

    // Add realistic mouse movements
    await page.mouse.move(
      Math.random() * 100,
      Math.random() * 100
    );
  }

  private async navigateWithRetry(
    page: Page,
    url: string,
    maxRetries = 3
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        return;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => 
          setTimeout(resolve, 2000 * (i + 1))
        );
      }
    }
  }

  private async extractProductData(
    page: Page
  ): Promise<ProductData[]> {
    const { selectors } = this.config;

    return await page.evaluate((sel) => {
      const products: ProductData[] = [];
      const items = document.querySelectorAll(sel.container);

      items.forEach((item) => {
        try {
          const title = item.querySelector(sel.title)?.textContent?.trim();
          const priceText = item.querySelector(sel.price)?.textContent;
          const originalPriceText = item.querySelector(sel.originalPrice)?.textContent;
          const link = item.querySelector<HTMLAnchorElement>(sel.link)?.href;
          const image = item.querySelector<HTMLImageElement>(sel.image)?.src;

          if (title && priceText && link) {
            products.push({
              title,
              price: parseFloat(priceText.replace(/[^0-9.]/g, '')),
              originalPrice: originalPriceText 
                ? parseFloat(originalPriceText.replace(/[^0-9.]/g, ''))
                : undefined,
              url: link,
              imageUrl: image,
              scrapedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('Error parsing product:', error);
        }
      });

      return products;
    }, selectors);
  }

  private getRandomUserAgent(): string {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
```

### 2. Proxy Manager

**File**: `src/scrapers/proxy-manager.ts`

```typescript
import axios from 'axios';
import { createClient } from 'redis';

interface Proxy {
  id: string;
  url: string;
  username?: string;
  password?: string;
  country?: string;
  isHealthy: boolean;
  lastUsed: Date;
  failureCount: number;
}

export class ProxyManager {
  private redisClient: ReturnType<typeof createClient>;
  private proxyProvider: string;

  constructor(proxyProvider = 'brightdata') {
    this.proxyProvider = proxyProvider;
    this.redisClient = createClient({
      url: process.env.REDIS_URL,
    });
  }

  async initialize(): Promise<void> {
    await this.redisClient.connect();
    await this.loadProxies();
  }

  private async loadProxies(): Promise<void> {
    // Load proxies from provider API or config
    const proxies = await this.fetchProxiesFromProvider();
    
    for (const proxy of proxies) {
      await this.redisClient.hSet(
        `proxy:${proxy.id}`,
        {
          url: proxy.url,
          username: proxy.username || '',
          password: proxy.password || '',
          country: proxy.country || 'US',
          isHealthy: 'true',
          lastUsed: new Date().toISOString(),
          failureCount: '0',
        }
      );
    }
  }

  async getProxy(country?: string): Promise<Proxy> {
    // Get least recently used healthy proxy
    const keys = await this.redisClient.keys('proxy:*');
    const healthyProxies: Proxy[] = [];

    for (const key of keys) {
      const data = await this.redisClient.hGetAll(key);
      if (data.isHealthy === 'true' && 
          (!country || data.country === country)) {
        healthyProxies.push({
          id: key.replace('proxy:', ''),
          url: data.url,
          username: data.username,
          password: data.password,
          country: data.country,
          isHealthy: data.isHealthy === 'true',
          lastUsed: new Date(data.lastUsed),
          failureCount: parseInt(data.failureCount || '0'),
        });
      }
    }

    if (healthyProxies.length === 0) {
      throw new Error('No healthy proxies available');
    }

    // Sort by least recently used
    healthyProxies.sort((a, b) => 
      a.lastUsed.getTime() - b.lastUsed.getTime()
    );

    const selectedProxy = healthyProxies[0];

    // Update last used
    await this.redisClient.hSet(
      `proxy:${selectedProxy.id}`,
      'lastUsed',
      new Date().toISOString()
    );

    return selectedProxy;
  }

  async reportFailure(proxyId: string): Promise<void> {
    const key = `proxy:${proxyId}`;
    const failureCount = await this.redisClient.hGet(key, 'failureCount');
    const newCount = parseInt(failureCount || '0') + 1;

    await this.redisClient.hSet(key, 'failureCount', newCount.toString());

    // Mark unhealthy if too many failures
    if (newCount >= 5) {
      await this.redisClient.hSet(key, 'isHealthy', 'false');
      console.warn(`Proxy ${proxyId} marked unhealthy after ${newCount} failures`);
    }
  }

  async healthCheck(): Promise<void> {
    const keys = await this.redisClient.keys('proxy:*');

    for (const key of keys) {
      const data = await this.redisClient.hGetAll(key);
      const proxy = {
        url: data.url,
        username: data.username,
        password: data.password,
      };

      try {
        // Test proxy with simple HTTP request
        const response = await axios.get('https://httpbin.org/ip', {
          proxy: {
            protocol: 'http',
            host: new URL(proxy.url).hostname,
            port: parseInt(new URL(proxy.url).port),
            auth: proxy.username ? {
              username: proxy.username,
              password: proxy.password,
            } : undefined,
          },
          timeout: 10000,
        });

        if (response.status === 200) {
          // Reset failure count and mark healthy
          await this.redisClient.hSet(key, {
            isHealthy: 'true',
            failureCount: '0',
          });
        }
      } catch (error) {
        await this.reportFailure(key.replace('proxy:', ''));
      }
    }
  }

  private async fetchProxiesFromProvider(): Promise<Proxy[]> {
    // Implementation depends on proxy provider
    // Example: Bright Data, Smartproxy, Oxylabs
    if (this.proxyProvider === 'brightdata') {
      return this.fetchBrightDataProxies();
    }
    return [];
  }

  private async fetchBrightDataProxies(): Promise<Proxy[]> {
    // Bright Data uses zone credentials
    const zones = [
      {
        id: 'zone1',
        country: 'US',
        port: '22225',
      },
      {
        id: 'zone2',
        country: 'GB',
        port: '22225',
      },
    ];

    return zones.map((zone) => ({
      id: zone.id,
      url: `http://brd.superproxy.io:${zone.port}`,
      username: process.env.BRIGHTDATA_USERNAME!,
      password: process.env.BRIGHTDATA_PASSWORD!,
      country: zone.country,
      isHealthy: true,
      lastUsed: new Date(),
      failureCount: 0,
    }));
  }
}
```

### 3. Rate Limiter

**File**: `src/scrapers/rate-limiter.ts`

```typescript
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
        const oldestTimestamp = parseInt(oldest[0]);
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

    // Add current request
    await this.redisClient.zAdd(key, {
      score: now,
      value: now.toString(),
    });

    // Set expiry
    await this.redisClient.expire(key, 60);
  }
}
```

### 4. Scraping Orchestrator

**File**: `src/scrapers/orchestrator.ts`

```typescript
import { Queue, Worker } from 'bullmq';
import { PlaywrightWorker } from './playwright-worker';
import { ProxyManager } from './proxy-manager';
import { RateLimiter } from './rate-limiter';
import { db } from '../db';

interface RetailerConfig {
  name: string;
  baseUrl: string;
  categories: string[];
  scrapeInterval: number; // minutes
  selectors: Record<string, string>;
  rateLimit: number;
}

export class ScrapingOrchestrator {
  private queue: Queue;
  private proxyManager: ProxyManager;
  private rateLimiter: RateLimiter;
  private retailers: RetailerConfig[];

  constructor() {
    this.queue = new Queue('scraping-jobs', {
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    this.proxyManager = new ProxyManager();
    this.rateLimiter = new RateLimiter();
    this.retailers = this.loadRetailerConfigs();
  }

  async initialize(): Promise<void> {
    await this.proxyManager.initialize();
    await this.rateLimiter.initialize();
    await this.setupWorkers();
    await this.scheduleJobs();
  }

  private async setupWorkers(): Promise<void> {
    const concurrency = parseInt(process.env.SCRAPER_CONCURRENCY || '5');

    new Worker(
      'scraping-jobs',
      async (job) => {
        const { retailer, category, url } = job.data;
        
        try {
          const config = this.retailers.find(r => r.name === retailer);
          if (!config) {
            throw new Error(`Unknown retailer: ${retailer}`);
          }

          const worker = new PlaywrightWorker(
            {
              retailer: config.name,
              targetUrl: url,
              selectors: config.selectors,
              antiBot: true,
              rateLimit: config.rateLimit,
            },
            this.proxyManager,
            this.rateLimiter
          );

          await worker.initialize();
          const products = await worker.scrapeProducts({
            id: job.id!,
            url,
            retailer,
            category,
          });
          await worker.cleanup();

          // Save to database
          await this.saveProducts(products, retailer, category);

          return { success: true, productCount: products.length };
        } catch (error) {
          console.error(`Scraping job failed:`, error);
          throw error;
        }
      },
      {
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency,
      }
    );
  }

  private async scheduleJobs(): Promise<void> {
    for (const retailer of this.retailers) {
      for (const category of retailer.categories) {
        const url = `${retailer.baseUrl}${category}`;
        
        // Add repeatable job
        await this.queue.add(
          `scrape-${retailer.name}-${category}`,
          {
            retailer: retailer.name,
            category,
            url,
          },
          {
            repeat: {
              every: retailer.scrapeInterval * 60 * 1000,
            },
          }
        );
      }
    }
  }

  private async saveProducts(
    products: any[],
    retailer: string,
    category: string
  ): Promise<void> {
    for (const product of products) {
      await db.product.upsert({
        where: {
          url: product.url,
        },
        create: {
          ...product,
          retailer,
          category,
        },
        update: {
          price: product.price,
          originalPrice: product.originalPrice,
          scrapedAt: product.scrapedAt,
        },
      });
    }
  }

  private loadRetailerConfigs(): RetailerConfig[] {
    return [
      {
        name: 'amazon',
        baseUrl: 'https://www.amazon.com',
        categories: [
          '/s?k=electronics',
          '/s?k=home+kitchen',
          '/s?k=clothing',
        ],
        scrapeInterval: 15, // 15 minutes
        selectors: {
          container: '[data-component-type="s-search-result"]',
          title: 'h2 a span',
          price: '.a-price .a-offscreen',
          originalPrice: '.a-text-price .a-offscreen',
          link: 'h2 a',
          image: '.s-image',
        },
        rateLimit: 20, // requests per minute
      },
      {
        name: 'walmart',
        baseUrl: 'https://www.walmart.com',
        categories: [
          '/browse/electronics/0/0/?facet=price:$0+-+$25',
        ],
        scrapeInterval: 20,
        selectors: {
          container: '[data-item-id]',
          title: '[data-automation-id="product-title"]',
          price: '[data-automation-id="product-price"] .w_iUH7',
          link: 'a[link-identifier="productTitle"]',
          image: 'img[data-testid="productTileImage"]',
        },
        rateLimit: 15,
      },
      // Add more retailers...
    ];
  }
}
```

## Deployment

### Docker Configuration

**File**: `docker-compose.scraper.yml`

```yaml
version: '3.8'

services:
  scraper-orchestrator:
    build:
      context: .
      dockerfile: Dockerfile.scraper
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - DATABASE_URL=${DATABASE_URL}
      - BRIGHTDATA_USERNAME=${BRIGHTDATA_USERNAME}
      - BRIGHTDATA_PASSWORD=${BRIGHTDATA_PASSWORD}
      - SCRAPER_CONCURRENCY=10
    depends_on:
      - redis
    restart: unless-stopped

  scraper-worker:
    build:
      context: .
      dockerfile: Dockerfile.scraper
    command: npm run worker
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - DATABASE_URL=${DATABASE_URL}
      - SCRAPER_CONCURRENCY=5
    depends_on:
      - redis
    deploy:
      replicas: 3
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

## Performance Optimization

### Best Practices

1. **Proxy Rotation**: Use different proxies for each retailer
2. **Rate Limiting**: Respect robots.txt and implement conservative limits
3. **Caching**: Cache product data for 5-10 minutes to reduce load
4. **Scheduling**: Distribute scraping jobs across time to avoid spikes
5. **Monitoring**: Track success rates, response times, and error patterns

### Scaling Strategies

- **Horizontal Scaling**: Add more worker containers
- **Geographic Distribution**: Use proxies from different regions
- **Load Balancing**: Distribute jobs based on worker availability
- **Queue Optimization**: Prioritize high-value retailers

## Monitoring

```typescript
// Track metrics
import { Counter, Histogram } from 'prom-client';

const scrapingJobsTotal = new Counter({
  name: 'scraping_jobs_total',
  help: 'Total number of scraping jobs',
  labelNames: ['retailer', 'status'],
});

const scrapingDuration = new Histogram({
  name: 'scraping_duration_seconds',
  help: 'Scraping job duration',
  labelNames: ['retailer'],
});

// Usage
scrapingJobsTotal.inc({ retailer: 'amazon', status: 'success' });
scrapingDuration.observe({ retailer: 'amazon' }, 45.2);
```

## Legal Compliance

- ✅ Respect robots.txt
- ✅ Implement rate limiting (max 20 req/min per retailer)
- ✅ Use proper User-Agent headers
- ✅ Don't bypass authentication
- ✅ Only scrape public data
- ✅ Store data responsibly
