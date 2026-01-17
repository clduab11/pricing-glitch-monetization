/**
 * Unified Scraping Service
 *
 * Multi-provider scraping abstraction layer supporting:
 * - Firecrawl (primary - structured extraction, anti-bot)
 * - Tavily (discovery - web search)
 * - Jina.ai Reader (fallback - markdown extraction)
 * - Perplexity (research - competitive intelligence)
 *
 * Provider selection strategy:
 * 1. Firecrawl for direct product URLs (best structured extraction)
 * 2. Tavily for discovering product pages via search
 * 3. Jina.ai as fallback when Firecrawl fails
 * 4. Perplexity for market research (not price scraping)
 */

import { Product, ScrapeResult } from '@/types';
import { isRecentlyProcessed, publishAnomaly } from '@/lib/clients/redis';
import { detectAnomaly } from '@/lib/analysis/detection';

// Provider configuration
const PROVIDERS = {
  firecrawl: {
    url: 'https://api.firecrawl.dev/v1',
    key: process.env.FIRECRAWL_API_KEY,
    costPer1k: 0.83, // $0.83 per 1K pages on Standard plan
  },
  tavily: {
    url: 'https://api.tavily.com',
    key: process.env.TAVILY_API_KEY,
    costPer1k: 8, // $8 per 1K credits (basic search)
  },
  jina: {
    url: 'https://r.jina.ai',
    key: process.env.JINA_API_KEY,
    costPer1k: 0, // Token-based, roughly free tier friendly
  },
  perplexity: {
    url: 'https://api.perplexity.ai',
    key: process.env.PERPLEXITY_API_KEY,
    costPer1k: 5, // $5 per 1K search requests
  },
} as const;

type Provider = keyof typeof PROVIDERS;

// Structured product schema for extraction
const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    product_name: { type: 'string' },
    current_price: { type: 'number' },
    original_price: { type: 'number' },
    currency: { type: 'string' },
    stock_status: { type: 'string' },
    image_url: { type: 'string' },
    category: { type: 'string' },
    retailer_sku: { type: 'string' },
  },
  required: ['product_name', 'current_price'],
};

interface ProviderResult {
  success: boolean;
  provider: Provider;
  data?: {
    product_name?: string;
    current_price?: number;
    original_price?: number;
    currency?: string;
    stock_status?: string;
    image_url?: string;
    category?: string;
    retailer_sku?: string;
    raw_content?: string;
  };
  error?: string;
  latencyMs?: number;
}

// ============================================================================
// Firecrawl Provider (Primary)
// ============================================================================

async function scrapeWithFirecrawl(url: string): Promise<ProviderResult> {
  const start = Date.now();
  const { key, url: apiUrl } = PROVIDERS.firecrawl;

  if (!key) {
    return { success: false, provider: 'firecrawl', error: 'Firecrawl API key not configured' };
  }

  try {
    const response = await fetch(`${apiUrl}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        url,
        formats: ['json'],
        waitFor: 2000,
        extract: { schema: PRODUCT_SCHEMA },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, provider: 'firecrawl', error: `API error: ${error}`, latencyMs: Date.now() - start };
    }

    const result = await response.json();
    const extraction = result.data?.llm_extraction;

    return {
      success: true,
      provider: 'firecrawl',
      data: {
        product_name: extraction?.product_name || result.data?.metadata?.title,
        current_price: extraction?.current_price,
        original_price: extraction?.original_price,
        stock_status: extraction?.stock_status,
        image_url: extraction?.image_url || result.data?.metadata?.ogImage,
        category: extraction?.category,
      },
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'firecrawl',
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - start,
    };
  }
}

// ============================================================================
// Tavily Provider (Discovery)
// ============================================================================

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function searchWithTavily(query: string, options?: {
  includeDomains?: string[];
  maxResults?: number;
}): Promise<{ success: boolean; results: TavilySearchResult[]; error?: string }> {
  const { key, url: apiUrl } = PROVIDERS.tavily;

  if (!key) {
    return { success: false, results: [], error: 'Tavily API key not configured' };
  }

  try {
    const response = await fetch(`${apiUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        include_domains: options?.includeDomains || [
          'amazon.com', 'walmart.com', 'target.com', 'bestbuy.com',
          'costco.com', 'homedepot.com', 'lowes.com', 'ebay.com',
        ],
        max_results: options?.maxResults || 10,
      }),
    });

    if (!response.ok) {
      return { success: false, results: [], error: `Tavily API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      results: data.results || [],
    };
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Jina.ai Provider (Fallback)
// ============================================================================

async function scrapeWithJina(url: string): Promise<ProviderResult> {
  const start = Date.now();
  const { key, url: readerUrl } = PROVIDERS.jina;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
      // Use JSON schema extraction with Jina
      headers['x-json-schema'] = JSON.stringify(PRODUCT_SCHEMA);
    }

    const response = await fetch(`${readerUrl}/${url}`, { headers });

    if (!response.ok) {
      return { success: false, provider: 'jina', error: `Jina API error: ${response.status}`, latencyMs: Date.now() - start };
    }

    const data = await response.json();

    // Jina returns structured data if schema was provided
    return {
      success: true,
      provider: 'jina',
      data: {
        product_name: data.title || data.product_name,
        current_price: data.current_price,
        original_price: data.original_price,
        stock_status: data.stock_status,
        raw_content: data.content,
      },
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'jina',
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - start,
    };
  }
}

// ============================================================================
// Perplexity Provider (Research)
// ============================================================================

export async function researchWithPerplexity(query: string): Promise<{
  success: boolean;
  answer?: string;
  sources?: Array<{ title: string; url: string }>;
  error?: string;
}> {
  const { key, url: apiUrl } = PROVIDERS.perplexity;

  if (!key) {
    return { success: false, error: 'Perplexity API key not configured' };
  }

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a pricing research assistant. Provide concise, factual answers about product pricing, market trends, and competitor analysis.',
          },
          { role: 'user', content: query },
        ],
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Perplexity API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      answer: data.choices?.[0]?.message?.content,
      sources: data.citations?.map((c: { title: string; url: string }) => ({ title: c.title, url: c.url })) || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Unified Scraping Pipeline
// ============================================================================

/**
 * Scrape a URL using the best available provider with automatic fallback
 * Priority: Firecrawl -> Jina -> Error
 */
export async function scrapeUrl(url: string): Promise<ProviderResult> {
  // Try Firecrawl first (best for structured extraction)
  const firecrawlResult = await scrapeWithFirecrawl(url);
  if (firecrawlResult.success && firecrawlResult.data?.current_price) {
    console.log(`[Scraper] Firecrawl success for ${url} in ${firecrawlResult.latencyMs}ms`);
    return firecrawlResult;
  }

  console.log(`[Scraper] Firecrawl failed for ${url}: ${firecrawlResult.error}, trying Jina...`);

  // Fallback to Jina
  const jinaResult = await scrapeWithJina(url);
  if (jinaResult.success && jinaResult.data?.current_price) {
    console.log(`[Scraper] Jina success for ${url} in ${jinaResult.latencyMs}ms`);
    return jinaResult;
  }

  // Both failed
  return {
    success: false,
    provider: 'firecrawl',
    error: `All providers failed. Firecrawl: ${firecrawlResult.error}, Jina: ${jinaResult.error}`,
  };
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
    if (hostname.includes('costco')) return 'costco';
    if (hostname.includes('homedepot')) return 'homedepot';
    if (hostname.includes('lowes')) return 'lowes';
    if (hostname.includes('ebay')) return 'ebay';
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Fetch historical prices for a product
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
 * Complete scrape and detect pipeline with multi-provider support
 */
export async function scrapeAndDetect(url: string): Promise<ScrapeResult> {
  // Check deduplication
  const isRecent = await isRecentlyProcessed(url);
  if (isRecent) {
    return { success: false, error: 'URL recently processed (deduplication)' };
  }

  // Scrape using unified provider
  const scrapeResult = await scrapeUrl(url);
  if (!scrapeResult.success || !scrapeResult.data?.current_price) {
    return { success: false, error: scrapeResult.error || 'Could not extract product price' };
  }

  const scrapedAt = new Date();
  const product: Product = {
    title: scrapeResult.data.product_name || 'Unknown Product',
    price: scrapeResult.data.current_price,
    originalPrice: scrapeResult.data.original_price,
    stockStatus: (scrapeResult.data.stock_status as Product['stockStatus']) || 'unknown',
    retailer: extractRetailerId(url),
    scrapedAt: scrapedAt.toISOString(),
    url,
    imageUrl: scrapeResult.data.image_url,
    category: scrapeResult.data.category,
  };

  // Persist product + price history
  try {
    const { db } = await import('@/db');

    const dbProduct = await db.product.upsert({
      where: { url },
      create: {
        title: product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        stockStatus: product.stockStatus ?? 'unknown',
        retailer: product.retailer,
        url,
        imageUrl: product.imageUrl,
        category: product.category,
        scrapedAt,
      },
      update: {
        title: product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        stockStatus: product.stockStatus ?? 'unknown',
        imageUrl: product.imageUrl,
        category: product.category,
        scrapedAt,
      },
    });

    product.id = dbProduct.id;

    await db.priceHistory.create({
      data: {
        productId: dbProduct.id,
        productUrl: url,
        price: dbProduct.price,
        scrapedAt,
      },
    });
  } catch (error) {
    console.error('Error persisting product/price history:', error);
  }

  // Get historical prices for Z-score calculation
  const historicalPrices = await getHistoricalPrices(url);

  // Run anomaly detection
  const detection = detectAnomaly(
    product.price,
    product.originalPrice || null,
    historicalPrices,
    {
      category: product.category,
      timestamp: scrapedAt,
    }
  );

  if (!detection.is_anomaly) {
    return { success: true, product };
  }

  if (!product.id) {
    return {
      success: true,
      product,
      error: 'Anomaly detected but could not be persisted (database not configured)',
    };
  }

  // Persist anomaly and publish to stream
  try {
    const { db } = await import('@/db');

    const dbAnomaly = await db.pricingAnomaly.create({
      data: {
        productId: product.id,
        anomalyType: detection.anomaly_type!,
        zScore: detection.z_score || null,
        discountPercentage: detection.discount_percentage || 0,
        initialConfidence: detection.confidence,
        status: 'pending',
        detectedAt: scrapedAt,
      },
    });

    const anomaly: import('@/types').PricingAnomaly = {
      id: dbAnomaly.id,
      productId: product.id!,
      product,
      anomalyType: dbAnomaly.anomalyType as import('@/types').PricingAnomaly['anomalyType'],
      zScore: dbAnomaly.zScore ? Number(dbAnomaly.zScore) : undefined,
      discountPercentage: Number(dbAnomaly.discountPercentage),
      initialConfidence: dbAnomaly.initialConfidence,
      detectedAt: dbAnomaly.detectedAt.toISOString(),
      status: dbAnomaly.status as import('@/types').PricingAnomaly['status'],
    };

    await publishAnomaly(dbAnomaly.id, anomaly as unknown as Record<string, unknown>);

    return { success: true, product, anomaly };
  } catch (error) {
    console.error('Error persisting/publishing anomaly:', error);
    return { success: true, product };
  }
}

// ============================================================================
// Provider Health Check
// ============================================================================

export async function checkProviderHealth(): Promise<Record<Provider, boolean>> {
  const health: Record<Provider, boolean> = {
    firecrawl: !!PROVIDERS.firecrawl.key,
    tavily: !!PROVIDERS.tavily.key,
    jina: true, // Jina works without key (rate limited)
    perplexity: !!PROVIDERS.perplexity.key,
  };

  return health;
}
