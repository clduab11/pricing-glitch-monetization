import { Product, DetectResult, ScrapeResult } from '@/types';
import { isRecentlyProcessed, publishAnomaly } from '@/lib/clients/redis';

// Firecrawl API configuration
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

interface FirecrawlScrapeOptions {
  url: string;
  formats?: ('markdown' | 'html' | 'json')[];
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  extract?: {
    schema: Record<string, unknown>;
  };
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: {
      title?: string;
      description?: string;
      ogImage?: string;
      [key: string]: unknown;
    };
    llm_extraction?: {
      product_name?: string;
      current_price?: number;
      original_price?: number;
      stock_status?: string;
      image_url?: string;
      category?: string;
    };
  };
  error?: string;
}

/**
 * Scrape a URL using Firecrawl API with stealth mode
 */
export async function scrapeUrl(options: FirecrawlScrapeOptions): Promise<FirecrawlResponse> {
  if (!FIRECRAWL_API_KEY) {
    console.warn('Firecrawl API key not configured');
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const requestBody: Record<string, unknown> = {
      url: options.url,
      formats: options.formats || ['markdown'],
      includeTags: options.includeTags,
      excludeTags: options.excludeTags,
      waitFor: options.waitFor || 2000,
      // Stealth mode options
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    // Add extract schema for structured data extraction
    if (options.extract) {
      requestBody.extract = options.extract;
    }

    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Firecrawl API error: ${error}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown scraping error',
    };
  }
}

/**
 * Extract retailer ID from URL
 */
export function extractRetailerId(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('amazon')) return 'amazon';
    if (hostname.includes('walmart')) return 'walmart';
    if (hostname.includes('target')) return 'target';
    if (hostname.includes('bestbuy')) return 'bestbuy';
    if (hostname.includes('ebay')) return 'ebay';
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Calculate Z-score for anomaly detection
 * Z-score = (current_price - mean) / standard_deviation
 */
export function calculateZScore(currentPrice: number, historicalPrices: number[]): number {
  if (historicalPrices.length < 2) return 0;

  const mean = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
  const squaredDiffs = historicalPrices.map(price => Math.pow(price - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / historicalPrices.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  
  // Negative Z-score means price is below average (what we want for glitches)
  return (mean - currentPrice) / stdDev;
}

/**
 * Detect pricing anomalies using Z-score and percentage drop
 * Triggers: Price Drop > 50% OR Z-score > 3
 */
export function detectAnomaly(
  currentPrice: number,
  originalPrice: number | null,
  historicalPrices: number[] = []
): DetectResult {
  // Calculate discount percentage if original price available
  let discountPercentage = 0;
  if (originalPrice && originalPrice > 0) {
    discountPercentage = ((originalPrice - currentPrice) / originalPrice) * 100;
  }

  // Calculate Z-score from historical data
  const zScore = calculateZScore(currentPrice, historicalPrices);

  // Anomaly detection logic
  const isPercentageDrop = discountPercentage > 50;
  const isZScoreAnomaly = zScore > 3;
  const isDecimalError = originalPrice !== null && (currentPrice / originalPrice < 0.01);

  const isAnomaly = isPercentageDrop || isZScoreAnomaly || isDecimalError;

  // Determine anomaly type
  let anomalyType: DetectResult['anomaly_type'];
  if (isDecimalError) {
    anomalyType = 'decimal_error';
  } else if (isZScoreAnomaly) {
    anomalyType = 'z_score';
  } else if (isPercentageDrop) {
    anomalyType = 'percentage_drop';
  }

  // Calculate confidence based on signals
  let confidence = 0;
  if (isDecimalError) confidence = 95;
  else if (isZScoreAnomaly && isPercentageDrop) confidence = 90;
  else if (isZScoreAnomaly) confidence = 70 + Math.min(zScore * 5, 20);
  else if (isPercentageDrop) confidence = 50 + Math.min(discountPercentage / 2, 30);

  return {
    is_anomaly: isAnomaly,
    anomaly_type: anomalyType,
    z_score: zScore,
    discount_percentage: discountPercentage,
    confidence: Math.min(confidence, 100),
  };
}

/**
 * Fetch historical prices for a product from Prisma
 */
export async function getHistoricalPrices(productUrl: string, days = 30): Promise<number[]> {
  const { db } = await import('@/db');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    const history = await db.priceHistory.findMany({
      where: {
        productUrl,
        scrapedAt: { gte: cutoffDate },
      },
      select: { price: true },
      orderBy: { scrapedAt: 'desc' },
    });

    return history.map(row => Number(row.price));
  } catch (error) {
    console.error('Error fetching historical prices:', error);
    return [];
  }
}

/**
 * Complete scrape and detect pipeline
 */
export async function scrapeAndDetect(url: string): Promise<ScrapeResult> {
  // Check deduplication
  const isRecent = await isRecentlyProcessed(url);
  if (isRecent) {
    return { success: false, error: 'URL recently processed (deduplication)' };
  }

  // Scrape the URL with JSON format and extract schema for structured data
  const scrapeResult = await scrapeUrl({ 
    url, 
    formats: ['json'],
    extract: {
      schema: {
        type: 'object',
        properties: {
          product_name: { type: 'string' },
          current_price: { type: 'number' },
          original_price: { type: 'number' },
          stock_status: { type: 'string' },
          image_url: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['product_name', 'current_price'],
      },
    },
  });
  if (!scrapeResult.success || !scrapeResult.data) {
    return { success: false, error: scrapeResult.error || 'Scraping failed' };
  }

  // Extract product data (simplified - in production, use LLM extraction)
  const extraction = scrapeResult.data.llm_extraction;
  if (!extraction?.current_price) {
    return { success: false, error: 'Could not extract product price' };
  }

  const productId = `prod_${crypto.randomUUID()}`;
  const product: Product = {
    id: productId,
    title: extraction.product_name || scrapeResult.data.metadata?.title || 'Unknown Product',
    price: extraction.current_price,
    originalPrice: extraction.original_price || undefined,
    stockStatus: (extraction.stock_status as Product['stockStatus']) || 'unknown',
    retailer: extractRetailerId(url),
    scrapedAt: new Date().toISOString(),
    url,
    imageUrl: extraction.image_url || scrapeResult.data.metadata?.ogImage,
    category: extraction.category,
  };

  // Get historical prices for Z-score calculation
  const historicalPrices = await getHistoricalPrices(url);

  // Run anomaly detection
  const detection = detectAnomaly(
    product.price,
    product.originalPrice || null,
    historicalPrices
  );

  if (!detection.is_anomaly) {
    return { success: true, product };
  }

  // Create anomaly record
  const anomalyId = `anomaly_${crypto.randomUUID()}`;
  const anomaly = {
    id: anomalyId,
    product_id: product.id,
    product,
    anomaly_type: detection.anomaly_type!,
    z_score: detection.z_score,
    discount_percentage: detection.discount_percentage || 0,
    initial_confidence: detection.confidence,
    detected_at: new Date().toISOString(),
    status: 'pending' as const,
  };

  // Publish to Redis stream for further processing
  await publishAnomaly(anomalyId, anomaly);

  return { success: true, product, anomaly };
}
