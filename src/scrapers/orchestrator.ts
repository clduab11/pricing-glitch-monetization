
import { Queue, Worker } from 'bullmq';
import { PlaywrightWorker } from './playwright-worker.js';
import { ProxyManager } from './proxy-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { db } from '../db/index.js';
import { ScraperConfig } from './types.js';
import { ProductData } from '../types/index.js';

interface RequestJobData {
  retailer: string;
  category: string;
  url: string;
}

export class ScrapingOrchestrator {
  private queue: Queue;
  private proxyManager: ProxyManager;
  private rateLimiter: RateLimiter;
  private retailers: ScraperConfig[];

  constructor() {
    this.queue = new Queue('scraping-jobs', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
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
        const { retailer, category, url } = job.data as RequestJobData;
        
        try {
          const config = this.retailers.find(r => r.retailer === retailer);
          if (!config) {
            throw new Error(`Unknown retailer: ${retailer}`);
          }

          const worker = new PlaywrightWorker(
            {
              retailer: config.retailer,
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
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency,
      }
    );
  }

  private async scheduleJobs(): Promise<void> {
    // Clear existing repeatable jobs first if needed, or just add new ones
    // For simplicity, we just adding them.
    for (const retailer of this.retailers) {
      // In a real app, 'categories' would be iterated. 
      // Simplified here based on hardcoded configs below.
      // We assume the targetUrl IS the category url for now or we parse it.
      // Let's iterate a fictitious list of categories or just uses the targetUrl as one.
      
      const categories = ['electronics']; // Placeholder
      for (const category of categories) {
         // Construct URL based on retailer - simplified logic
         const url = retailer.targetUrl; // In reality, would append category path

        await this.queue.add(
          `scrape-${retailer.retailer}-${category}`,
          {
            retailer: retailer.retailer,
            category,
            url,
          },
          {
            repeat: {
              every: 15 * 60 * 1000, // 15 mins
            },
          }
        );
      }
    }
  }

  private async saveProducts(
    products: ProductData[],
    retailer: string,
    category: string
  ): Promise<void> {
    for (const product of products) {
      await db.product.upsert({
        where: {
          url: product.url,
        },
        create: {
          title: product.title,
          price: product.price,
          originalPrice: product.originalPrice,
          url: product.url,
          imageUrl: product.imageUrl,
          retailer,
          category,
          scrapedAt: new Date(product.scrapedAt),
        },
        update: {
          price: product.price,
          originalPrice: product.originalPrice,
          scrapedAt: new Date(product.scrapedAt),
        },
      });
    }
  }

  private loadRetailerConfigs(): ScraperConfig[] {
    return [
      {
        retailer: 'amazon',
        targetUrl: 'https://www.amazon.com/s?k=electronics',
        selectors: {
          container: '[data-component-type="s-search-result"]',
          title: 'h2 a span',
          price: '.a-price .a-offscreen',
          originalPrice: '.a-text-price .a-offscreen',
          link: 'h2 a',
          image: '.s-image',
        },
        rateLimit: 20, 
        antiBot: true,
      },
      // Add more retailers...
    ];
  }
}
