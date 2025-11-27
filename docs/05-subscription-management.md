# Subscription Management with Stripe

## Overview

Stripe Billing integration for managing subscriptions, payments, and tier-based access control.

## Stripe Products & Prices Setup

### Creating Products

```bash
# Create products via Stripe CLI
stripe products create \
  --name="Starter" \
  --description="Daily pricing error notifications"

stripe prices create \
  --product=prod_XXXXX \
  --unit-amount=500 \
  --currency=usd \
  --recurring[interval]=month

# Repeat for Pro and Elite tiers
```

### Product Configuration

```typescript
export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    priceId: null,
    features: [
      'Weekly email digest',
      '5 deals per week',
      'Community forum access',
    ],
    limits: {
      dealsPerDay: 0,
      dealsPerWeek: 5,
      realtimeNotifications: false,
      apiAccess: false,
      webhooks: false,
    },
  },
  starter: {
    name: 'Starter',
    priceId: 'price_XXXXX',
    monthlyPrice: 5,
    features: [
      'Daily email notifications',
      'Unlimited deals (24hr delay)',
      'Basic filters',
      'Discord access',
    ],
    limits: {
      dealsPerDay: 999,
      realtimeNotifications: false,
      apiAccess: false,
      webhooks: false,
    },
  },
  pro: {
    name: 'Pro',
    priceId: 'price_YYYYY',
    monthlyPrice: 15,
    features: [
      'Real-time notifications',
      'All channels (Discord/Telegram/Email/SMS)',
      'Advanced filters',
      'Mobile app',
      'Historical data',
    ],
    limits: {
      dealsPerDay: 999,
      realtimeNotifications: true,
      apiAccess: false,
      webhooks: false,
    },
  },
  elite: {
    name: 'Elite',
    priceId: 'price_ZZZZZ',
    monthlyPrice: 50,
    features: [
      'Priority access',
      'API access (1000 req/day)',
      'Webhooks',
      'Location-based deals',
      'Reseller analytics',
    ],
    limits: {
      dealsPerDay: 999,
      realtimeNotifications: true,
      apiAccess: true,
      apiRequestsPerDay: 1000,
      webhooks: true,
    },
  },
};
```

## Implementation

### 1. Subscription Creation

```typescript
import Stripe from 'stripe';
import { db } from '../db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export class SubscriptionService {
  async createSubscription(
    userId: string,
    priceId: string
  ): Promise<{ clientSecret: string; subscriptionId: string }> {
    // Get or create Stripe customer
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    let customerId = user?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user!.email,
        metadata: {
          userId,
        },
      });
      
      customerId = customer.id;
      
      await db.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      clientSecret: paymentIntent.client_secret!,
      subscriptionId: subscription.id,
    };
  }

  async updateSubscription(
    userId: string,
    newPriceId: string
  ): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user?.subscription?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    const subscription = await stripe.subscriptions.retrieve(
      user.subscription.stripeSubscriptionId
    );

    // Update subscription item
    await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });
  }

  async cancelSubscription(
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
      await stripe.subscriptions.cancel(
        user.subscription.stripeSubscriptionId
      );
    } else {
      // Cancel at period end
      await stripe.subscriptions.update(
        user.subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );
    }

    await db.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: !immediately,
        status: immediately ? 'canceled' : 'active',
      },
    });
  }
}
```

### 2. Webhook Handler

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature']!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const customer = await stripe.customers.retrieve(customerId);
  const userId = (customer as Stripe.Customer).metadata.userId;

  await db.subscription.create({
    data: {
      userId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: subscription.items.data[0].price.id,
      tier: getTierFromPriceId(subscription.items.data[0].price.id),
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  await db.subscription.update({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    data: {
      status: subscription.status,
      stripePriceId: subscription.items.data[0].price.id,
      tier: getTierFromPriceId(subscription.items.data[0].price.id),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  await db.subscription.update({
    where: {
      stripeSubscriptionId: subscription.id,
    },
    data: {
      status: 'canceled',
    },
  });
}

function getTierFromPriceId(priceId: string): string {
  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (config.priceId === priceId) {
      return tier;
    }
  }
  return 'free';
}
```

### 3. Access Control Middleware

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { db } from '../db';

export function requireTier(
  minTier: 'free' | 'starter' | 'pro' | 'elite'
) {
  return async (
    req: NextApiRequest,
    res: NextApiResponse,
    next: () => void
  ) => {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true },
    });

    const userTier = user?.subscription?.tier || 'free';

    const tierLevels = {
      free: 0,
      starter: 1,
      pro: 2,
      elite: 3,
    };

    if (tierLevels[userTier] < tierLevels[minTier]) {
      return res.status(403).json({
        error: 'Insufficient subscription tier',
        requiredTier: minTier,
        currentTier: userTier,
      });
    }

    next();
  };
}

// Usage
export default requireTier('pro')(async (req, res) => {
  // This endpoint requires Pro tier or higher
  res.json({ data: 'Protected content' });
});
```

### 4. Usage Tracking

```typescript
export class UsageTracker {
  async trackAPIRequest(userId: string): Promise<boolean> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    const tier = user?.subscription?.tier || 'free';
    const limits = SUBSCRIPTION_TIERS[tier].limits;

    if (!limits.apiAccess) {
      return false;
    }

    const today = new Date().toISOString().split('T')[0];
    const key = `api:usage:${userId}:${today}`;

    const usage = await redis.incr(key);
    await redis.expire(key, 86400); // 24 hours

    if (usage > limits.apiRequestsPerDay) {
      return false;
    }

    return true;
  }

  async getUsageStats(userId: string): Promise<{
    apiRequests: number;
    apiLimit: number;
    dealsViewed: number;
  }> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    const tier = user?.subscription?.tier || 'free';
    const limits = SUBSCRIPTION_TIERS[tier].limits;

    const today = new Date().toISOString().split('T')[0];
    const apiKey = `api:usage:${userId}:${today}`;
    const dealsKey = `deals:viewed:${userId}:${today}`;

    const [apiRequests, dealsViewed] = await Promise.all([
      redis.get(apiKey).then(v => parseInt(v || '0')),
      redis.get(dealsKey).then(v => parseInt(v || '0')),
    ]);

    return {
      apiRequests,
      apiLimit: limits.apiRequestsPerDay || 0,
      dealsViewed,
    };
  }
}
```

## Billing Portal

```typescript
export class BillingPortalService {
  async createPortalSession(
    userId: string,
    returnUrl: string
  ): Promise<string> {
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  }
}
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { SubscriptionService } from './subscription-service';

describe('SubscriptionService', () => {
  const service = new SubscriptionService();

  it('creates subscription', async () => {
    const result = await service.createSubscription(
      'user-123',
      'price_test'
    );

    expect(result.clientSecret).toBeDefined();
    expect(result.subscriptionId).toBeDefined();
  });

  it('enforces tier limits', async () => {
    const hasAccess = await service.checkTierAccess(
      'user-123',
      'apiAccess'
    );

    expect(typeof hasAccess).toBe('boolean');
  });
});
```
