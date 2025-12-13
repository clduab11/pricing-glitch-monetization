import Stripe from 'stripe';
import { stripe } from './stripe';
import { db } from '@/db';

// ============================================================================
// Subscription Tier Configuration
// ============================================================================

export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    priceId: null,
    monthlyPrice: 0,
    features: ['Weekly email digest', '5 deals per week', 'Community access'],
    limits: {
      dealsPerWeek: 5,
      realtimeNotifications: false,
      apiAccess: false,
      notificationDelay: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  },
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_PRICE_STARTER || null,
    monthlyPrice: 5,
    features: ['Daily notifications', 'Unlimited deals (24hr delay)', 'Discord access'],
    limits: {
      dealsPerWeek: 999,
      realtimeNotifications: false,
      apiAccess: false,
      notificationDelay: 24 * 60 * 60 * 1000, // 24 hours
    },
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRICE_PRO || null,
    monthlyPrice: 15,
    features: ['Real-time alerts', 'All channels', 'Advanced filters', 'Mobile app'],
    limits: {
      dealsPerWeek: 999,
      realtimeNotifications: true,
      apiAccess: false,
      notificationDelay: 0, // Instant
    },
  },
  elite: {
    name: 'Elite',
    priceId: process.env.STRIPE_PRICE_ELITE || null,
    monthlyPrice: 50,
    features: ['Priority access', 'API (1000 req/day)', 'Webhooks', 'Reseller tools'],
    limits: {
      dealsPerWeek: 999,
      realtimeNotifications: true,
      apiAccess: true,
      apiRequestsPerDay: 1000,
      notificationDelay: 0,
    },
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

// ============================================================================
// Helper Functions
// ============================================================================

export function getTierFromPriceId(priceId: string): SubscriptionTier {
  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (config.priceId === priceId) {
      return tier as SubscriptionTier;
    }
  }
  return 'free';
}

export function getTierLevel(tier: SubscriptionTier): number {
  const levels: Record<SubscriptionTier, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    elite: 3,
  };
  return levels[tier];
}

export function hasAccess(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return getTierLevel(userTier) >= getTierLevel(requiredTier);
}

// ============================================================================
// Stripe Operations
// ============================================================================

export async function createCheckoutSession(
  userId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
    },
  };

  // Use existing customer if available
  if (user.stripeCustomerId) {
    sessionParams.customer = user.stripeCustomerId;
  } else {
    sessionParams.customer_email = user.email;
  }

  return stripe.checkout.sessions.create(sessionParams);
}

export async function createBillingPortalSession(
  userId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.stripeCustomerId) {
    throw new Error('No billing account found');
  }

  return stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });
}

export async function cancelSubscription(
  userId: string,
  immediately = false
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  if (!user?.subscription?.stripeSubscriptionId) {
    throw new Error('No active subscription found');
  }

  if (immediately) {
    await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
  } else {
    await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }
}

export async function getUserSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  if (!user?.subscription || user.subscription.status !== 'active') {
    return 'free';
  }

  return (user.subscription.tier as SubscriptionTier) || 'free';
}
