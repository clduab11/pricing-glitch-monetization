import { Product } from '@/types';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

interface TavilySearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
  query: string;
  responseTime: number;
}

/**
 * Search for pricing information using Tavily
 * Excellent for discovering deals and cross-referencing prices
 */
export async function searchPricing(options: TavilySearchOptions): Promise<TavilyResponse | null> {
  if (!TAVILY_API_KEY) {
    console.warn('Tavily API key not configured');
    return null;
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: options.query,
        search_depth: options.searchDepth || 'advanced',
        max_results: options.maxResults || 10,
        include_domains: options.includeDomains || [
          'amazon.com', 'walmart.com', 'target.com',
          'bestbuy.com', 'costco.com', 'homedepot.com',
          'lowes.com', 'newegg.com', 'bhphotovideo.com'
        ],
        exclude_domains: options.excludeDomains,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      console.error('Tavily API error:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Tavily search error:', error);
    return null;
  }
}

/**
 * Search for pricing errors across retailers
 */
export async function searchForPricingErrors(
  productName: string,
  _expectedPrice?: number
): Promise<TavilyResult[]> {
  const result = await searchPricing({
    query: `"${productName}" price deal discount sale`,
    searchDepth: 'advanced',
    maxResults: 20,
  });

  if (!result) return [];

  // Filter results that might indicate pricing anomalies
  return result.results.filter(r => {
    const content = r.content.toLowerCase();
    return (
      content.includes('$') ||
      content.includes('off') ||
      content.includes('deal') ||
      content.includes('sale') ||
      content.includes('clearance')
    );
  });
}

/**
 * Cross-reference a product price across multiple retailers
 */
export async function crossReferencePrices(product: Product): Promise<{
  lowestPrice: number | null;
  prices: Array<{ retailer: string; price: number; url: string }>;
}> {
  const result = await searchPricing({
    query: `"${product.title}" buy price`,
    searchDepth: 'advanced',
    maxResults: 15,
  });

  if (!result) return { lowestPrice: null, prices: [] };

  const prices: Array<{ retailer: string; price: number; url: string }> = [];

  // Extract prices from search results using regex
  const priceRegex = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;

  for (const r of result.results) {
    const matches = r.content.match(priceRegex);
    if (matches && matches.length > 0) {
      const priceStr = matches[0].replace(/[$,]/g, '');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        try {
          prices.push({
            retailer: new URL(r.url).hostname.replace('www.', ''),
            price,
            url: r.url,
          });
        } catch {
          // Invalid URL, skip
        }
      }
    }
  }

  const lowestPrice = prices.length > 0
    ? Math.min(...prices.map(p => p.price))
    : null;

  return { lowestPrice, prices };
}

/**
 * Search for recent pricing glitches/errors being discussed
 */
export async function searchRecentGlitches(): Promise<TavilyResult[]> {
  const result = await searchPricing({
    query: 'pricing error glitch deal Amazon Walmart Target today',
    searchDepth: 'advanced',
    maxResults: 20,
    includeDomains: [
      'reddit.com', 'slickdeals.net', 'dealnews.com',
      'bensbargains.com', 'hip2save.com'
    ],
  });

  return result?.results || [];
}

export type { TavilyResult, TavilyResponse, TavilySearchOptions };
