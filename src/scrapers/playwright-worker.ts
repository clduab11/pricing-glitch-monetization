
import { chromium, Browser, Page } from 'playwright';
import { ProxyManager } from './proxy-manager';
import { RateLimiter } from './rate-limiter';
import { ProductData, ScrapingJob, ScraperConfig } from './types';

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
    // Note: getProxy() throws if no proxy found, which might block initialization.
    // In production, we might want to handle this gracefully or retry?
    // For now, we assume proxies exist or we fail fast.
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
    await this.rateLimiter.waitForSlot(this.config.retailer, this.config.rateLimit);

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

    return await page.evaluate((sel: Record<string, string>) => {
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
