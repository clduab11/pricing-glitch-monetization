/**
 * Glitch Ranking Logic
 * 
 * Implements ranking algorithms for validated glitches used in:
 * - Daily digest generation
 * - Hot glitches page display
 * - Notification prioritization
 */

import { db } from '@/db';

/**
 * Typed digest glitch payload for display/email
 */
export interface DigestGlitch {
  id: string;
  title: string;
  retailer: string;
  originalPrice: number;
  glitchPrice: number;
  savingsPercent: number;
  link: string;
  imageUrl?: string;
  confidence: number;
  jinaScore?: number;
  rank: number;
  detectedAt: Date;
  glitchType: string;
}

/**
 * Calculate a unified ranking score for a validated glitch
 * 
 * Scoring factors:
 * - profitMargin (60% weight): Higher discount = higher rank
 * - confidence (30% weight): Higher AI confidence = higher rank
 * - jinaScore (10% weight as bonus): Jina relevance boost
 * 
 * @param glitch - Database glitch record with optional Jina score
 * @returns Numeric ranking score (higher = better)
 */
export function calculateGlitchRank(glitch: {
  profitMargin: number | { toNumber: () => number };
  confidence: number;
  jinaScore?: number | { toNumber: () => number } | null;
}): number {
  const profitMargin = typeof glitch.profitMargin === 'number' 
    ? glitch.profitMargin 
    : glitch.profitMargin.toNumber();
  
  const jinaScore = glitch.jinaScore == null 
    ? 0 
    : typeof glitch.jinaScore === 'number' 
      ? glitch.jinaScore 
      : glitch.jinaScore.toNumber();

  // Base score from profit margin and confidence
  const baseScore = profitMargin * 0.6 + glitch.confidence * 0.3;
  
  // Jina bonus (max 10 points for perfect score)
  const jinaBonus = jinaScore * 10;
  
  return baseScore + jinaBonus;
}

/**
 * Fetch top glitches from the database, sorted by ranking score
 * 
 * @param limit - Maximum number of glitches to return
 * @param since - Only include glitches validated after this date
 * @returns Array of DigestGlitch objects sorted by rank
 */
export async function getTopGlitches(
  limit: number = 20,
  since?: Date
): Promise<DigestGlitch[]> {
  const cutoff = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  const glitches = await db.validatedGlitch.findMany({
    where: {
      isGlitch: true,
      validatedAt: { gte: cutoff },
    },
    include: { product: true },
    orderBy: [
      { profitMargin: 'desc' },
      { confidence: 'desc' },
    ],
    take: limit * 2, // Fetch extra for re-ranking
  });

  // Calculate ranks and sort
  const rankedGlitches = glitches.map(glitch => {
    const rank = calculateGlitchRank({
      profitMargin: glitch.profitMargin,
      confidence: glitch.confidence,
      jinaScore: glitch.jinaScore,
    });

    const originalPrice = glitch.product.originalPrice 
      ? Number(glitch.product.originalPrice) 
      : Number(glitch.product.price) * 2;
    const glitchPrice = Number(glitch.product.price);
    const savingsPercent = Math.round(
      ((originalPrice - glitchPrice) / originalPrice) * 100
    );

    return {
      id: glitch.id,
      title: glitch.product.title,
      retailer: glitch.product.retailer,
      originalPrice,
      glitchPrice,
      savingsPercent,
      link: glitch.product.url,
      imageUrl: glitch.product.imageUrl ?? undefined,
      confidence: glitch.confidence,
      jinaScore: glitch.jinaScore ? Number(glitch.jinaScore) : undefined,
      rank,
      detectedAt: glitch.validatedAt,
      glitchType: glitch.glitchType,
    };
  });

  // Sort by calculated rank and limit
  return rankedGlitches
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}

/**
 * Get glitches for a specific tier with appropriate delay
 * 
 * @param tier - User subscription tier
 * @param limit - Maximum number of glitches to return
 * @returns Array of DigestGlitch objects filtered by tier access
 */
export async function getGlitchesForTier(
  tier: 'free' | 'starter' | 'pro' | 'elite',
  limit: number = 20
): Promise<DigestGlitch[]> {
  // Tier-based delays
  const delayMs: Record<typeof tier, number> = {
    free: 72 * 60 * 60 * 1000,    // 72 hours
    starter: 24 * 60 * 60 * 1000, // 24 hours  
    pro: 0,                        // Real-time
    elite: 0,                      // Real-time
  };

  const since = new Date(Date.now() - Math.max(delayMs[tier], 24 * 60 * 60 * 1000));
  const cutoff = new Date(Date.now() - delayMs[tier]);

  const glitches = await db.validatedGlitch.findMany({
    where: {
      isGlitch: true,
      validatedAt: {
        gte: since,
        lte: cutoff,
      },
    },
    include: { product: true },
    orderBy: [
      { profitMargin: 'desc' },
      { confidence: 'desc' },
    ],
    take: limit * 2,
  });

  // Calculate ranks and sort
  const rankedGlitches = glitches.map(glitch => {
    const rank = calculateGlitchRank({
      profitMargin: glitch.profitMargin,
      confidence: glitch.confidence,
      jinaScore: glitch.jinaScore,
    });

    const originalPrice = glitch.product.originalPrice 
      ? Number(glitch.product.originalPrice) 
      : Number(glitch.product.price) * 2;
    const glitchPrice = Number(glitch.product.price);
    const savingsPercent = Math.round(
      ((originalPrice - glitchPrice) / originalPrice) * 100
    );

    return {
      id: glitch.id,
      title: glitch.product.title,
      retailer: glitch.product.retailer,
      originalPrice,
      glitchPrice,
      savingsPercent,
      link: glitch.product.url,
      imageUrl: glitch.product.imageUrl ?? undefined,
      confidence: glitch.confidence,
      jinaScore: glitch.jinaScore ? Number(glitch.jinaScore) : undefined,
      rank,
      detectedAt: glitch.validatedAt,
      glitchType: glitch.glitchType,
    };
  });

  return rankedGlitches
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}
