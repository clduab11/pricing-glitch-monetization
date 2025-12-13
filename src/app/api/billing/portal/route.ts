import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createBillingPortalSession } from '@/lib/subscription';
import { db } from '@/db';

/**
 * POST /api/billing/portal
 * Create a Stripe Billing Portal session for managing subscriptions
 */
export async function POST(_req: NextRequest) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe first.' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await createBillingPortalSession(user.id, `${baseUrl}/dashboard`);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}
