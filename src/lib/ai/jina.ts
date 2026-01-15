/**
 * Jina.ai Reranker Integration
 * 
 * Used as an optional enrichment layer to rerank validated glitches
 * based on virality potential and expected honor probability.
 */

import { ValidatedGlitch } from '@/types';

// Jina API configuration
const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank';
const JINA_API_KEY = process.env.JINA_API_KEY;
const USE_JINA_RERANK = process.env.USE_JINA_RERANK === 'true';

/**
 * Response from Jina Reranker API
 */
interface JinaRerankResponse {
  model: string;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
  };
  results: Array<{
    index: number;
    document: {
      text: string;
    };
    relevance_score: number;
  }>;
}

/**
 * Scored glitch result from Jina reranking
 */
export interface JinaScoredGlitch {
  glitchId: string;
  jinaScore: number;
  rankedAt: Date;
}

/**
 * Check if Jina reranking is enabled and configured
 */
export function isJinaEnabled(): boolean {
  return USE_JINA_RERANK && Boolean(JINA_API_KEY);
}

/**
 * Rerank documents using Jina Reranker API
 * 
 * @param query - The query to rank documents against
 * @param documents - Array of documents to rerank
 * @param topN - Number of top results to return (default: all)
 * @returns Reranked results with relevance scores, or null on error
 */
export async function rerank(
  query: string,
  documents: string[],
  topN?: number
): Promise<JinaRerankResponse['results'] | null> {
  if (!JINA_API_KEY) {
    console.warn('Jina API key not configured');
    return null;
  }

  try {
    const response = await fetch(JINA_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JINA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'jina-reranker-v2-base-multilingual',
        query,
        documents,
        top_n: topN ?? documents.length,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jina Reranker API error:', response.status, errorText);
      return null;
    }

    const data: JinaRerankResponse = await response.json();
    return data.results;
  } catch (error) {
    console.error('Error calling Jina Reranker:', error);
    return null;
  }
}

/**
 * Format a validated glitch as a document for Jina reranking
 */
function formatGlitchAsDocument(glitch: ValidatedGlitch): string {
  const product = glitch.product;
  const savings = product.originalPrice 
    ? ((product.originalPrice - product.price) / product.originalPrice * 100).toFixed(0)
    : glitch.profitMargin.toFixed(0);

  return `
Product: ${product.title}
Retailer: ${product.retailer}
Category: ${product.category || 'Unknown'}
Original Price: $${(product.originalPrice || 0).toFixed(2)}
Current Price: $${product.price.toFixed(2)}
Savings: ${savings}%
Glitch Type: ${glitch.glitchType}
Confidence: ${glitch.confidence}%
Profit Margin: ${glitch.profitMargin.toFixed(0)}%
Detection Reasoning: ${glitch.reasoning}
`.trim();
}

/**
 * Score validated glitches using Jina Reranker
 * 
 * Reranks glitches based on their potential for:
 * - High virality (social sharing potential)
 * - High honor probability (retailer likely to fulfill)
 * 
 * @param glitches - Array of validated glitches to score
 * @returns Array of scored glitches with Jina relevance scores
 */
export async function scoreGlitches(
  glitches: ValidatedGlitch[]
): Promise<JinaScoredGlitch[]> {
  if (!isJinaEnabled() || glitches.length === 0) {
    return [];
  }

  // Query optimized for identifying high-value, likely-to-be-honored glitches
  const query = `
    High-value price glitch with strong viral potential and high probability of being honored.
    Look for: major retailer, significant discount (>70%), electronics or popular brands,
    clear pricing error pattern (decimal error, database mistake), reputable merchant,
    time-sensitive deal that creates urgency, widespread appeal across demographics.
  `.trim();

  const documents = glitches.map(formatGlitchAsDocument);
  const rankedAt = new Date();

  const results = await rerank(query, documents);

  if (!results) {
    return [];
  }

  // Map results back to glitch IDs with scores
  return results.map((result) => ({
    glitchId: glitches[result.index].id,
    jinaScore: result.relevance_score,
    rankedAt,
  }));
}

/**
 * Score a single glitch using Jina Reranker
 * 
 * @param glitch - Validated glitch to score
 * @returns Jina score (0-1) or null on error
 */
export async function scoreGlitch(
  glitch: ValidatedGlitch
): Promise<number | null> {
  const scores = await scoreGlitches([glitch]);
  return scores.length > 0 ? scores[0].jinaScore : null;
}
