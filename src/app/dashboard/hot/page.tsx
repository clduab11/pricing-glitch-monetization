export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getUserSubscriptionTier, SUBSCRIPTION_TIERS, SubscriptionTier } from '@/lib/subscription';
import { getGlitchesForTier } from '@/lib/analysis/ranking';

/**
 * Get tier-based result limits
 */
function getTierLimit(tier: SubscriptionTier): number {
  switch (tier) {
    case 'free': return 5;
    case 'starter': return 20;
    case 'pro': return 50;
    case 'elite': return 50;
    default: return 5;
  }
}

export default async function HotGlitchesPage() {
  const user = await currentUser();
  if (!user) redirect('/');

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) redirect('/');

  // Ensure user exists in database
  const dbUser = await db.user.upsert({
    where: { clerkId: user.id },
    create: { clerkId: user.id, email },
    update: { email },
  });

  const tier = await getUserSubscriptionTier(dbUser.id);
  const tierConfig = SUBSCRIPTION_TIERS[tier];
  const limit = getTierLimit(tier);

  // Fetch ranked glitches based on tier
  const glitches = await getGlitchesForTier(tier, limit);

  // Calculate tier delay for display
  const delayHours = Math.round(tierConfig.limits.notificationDelay / (60 * 60 * 1000));

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="font-bold hover:text-gray-300">
            ← Dashboard
          </Link>
          <span className="text-gray-600">|</span>
          <span className="font-bold text-orange-500">🔥 Hot Glitches</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{email}</span>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6">
        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🔥 Today&apos;s Hottest Glitches</h1>
          <p className="text-gray-400">
            Top price glitches ranked by savings potential, AI confidence, and virality score.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="px-3 py-1 bg-gray-800 rounded-full">
              Plan: <span className="font-medium text-white">{tierConfig.name}</span>
            </span>
            {delayHours > 0 && (
              <span className="px-3 py-1 bg-yellow-900/50 text-yellow-400 rounded-full">
                {delayHours}h delay on deals
              </span>
            )}
            {delayHours === 0 && (
              <span className="px-3 py-1 bg-green-900/50 text-green-400 rounded-full">
                ⚡ Real-time access
              </span>
            )}
          </div>
        </div>

        {/* Glitch List */}
        <div className="space-y-4">
          {glitches.length === 0 ? (
            <div className="text-center py-16 bg-gray-900 rounded-xl border border-white/10">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-bold mb-2">No Hot Glitches Right Now</h2>
              <p className="text-gray-400 mb-6">
                Our scanners are continuously monitoring 100+ retailers.
                <br />Check back soon for new deals!
              </p>
              <Link
                href="/dashboard"
                className="inline-block px-6 py-3 bg-blue-600 rounded-lg font-medium hover:bg-blue-700"
              >
                Back to Dashboard
              </Link>
            </div>
          ) : (
            glitches.map((glitch, index) => (
              <div
                key={glitch.id}
                className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors"
              >
                <div className="flex items-stretch">
                  {/* Rank Badge */}
                  <div className={`w-16 flex items-center justify-center text-2xl font-bold ${
                    index === 0 ? 'bg-yellow-600' :
                    index === 1 ? 'bg-gray-400' :
                    index === 2 ? 'bg-orange-700' :
                    'bg-gray-800'
                  }`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start gap-4">
                      {/* Product Image */}
                      {glitch.imageUrl && (
                        <div className="flex-shrink-0">
                          <Image
                            src={glitch.imageUrl}
                            alt=""
                            width={80}
                            height={80}
                            className="w-20 h-20 object-cover rounded-lg bg-white"
                          />
                        </div>
                      )}

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg mb-1 truncate" title={glitch.title}>
                          {glitch.title}
                        </h3>
                        <p className="text-sm text-gray-400 uppercase mb-2">
                          {glitch.retailer} • {glitch.glitchType.replace('_', ' ')}
                        </p>

                        {/* Price Row */}
                        <div className="flex items-center gap-4 mb-2">
                          <span className="text-gray-500 line-through">
                            ${glitch.originalPrice.toFixed(2)}
                          </span>
                          <span className="text-green-400 font-bold text-2xl">
                            ${glitch.glitchPrice.toFixed(2)}
                          </span>
                          <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded text-sm font-bold">
                            {glitch.savingsPercent}% OFF
                          </span>
                        </div>

                        {/* Meta Row */}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Confidence: {glitch.confidence}%</span>
                          {glitch.jinaScore && (
                            <span>Virality: {(glitch.jinaScore * 100).toFixed(0)}%</span>
                          )}
                          <span>
                            Detected: {formatTimeAgo(glitch.detectedAt)}
                          </span>
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="flex-shrink-0 flex items-center">
                        <a
                          href={glitch.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-6 py-3 bg-blue-600 rounded-lg font-bold hover:bg-blue-700 transition-colors"
                        >
                          BUY NOW
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upgrade CTA for limited tiers */}
        {tier !== 'elite' && glitches.length > 0 && (
          <div className="mt-8 p-6 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl border border-blue-500/30">
            <h3 className="font-bold text-lg mb-2">
              {tier === 'free' 
                ? 'Want more deals and faster access?' 
                : 'Get instant access to all deals'}
            </h3>
            <p className="text-gray-400 mb-4">
              {tier === 'free'
                ? `Free users see ${limit} deals with a ${delayHours}h delay. Upgrade to see more!`
                : tier === 'starter'
                  ? 'Pro members get real-time alerts before deals go viral.'
                  : 'Elite members get priority access and API access.'}
            </p>
            <Link
              href="/pricing"
              className="inline-block px-6 py-3 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-colors"
            >
              Upgrade Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format time as relative time ago
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}
