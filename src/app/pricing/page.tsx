'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';

const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$5',
    period: '/mo',
    features: [
      'Daily Digest Email',
      '24hr Delay on Deals',
      'Web Dashboard Access',
      'Discord Community',
    ],
    color: 'bg-gray-800/50 border-gray-700',
    buttonStyle: 'bg-white/10 hover:bg-white/20 text-white',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$15',
    period: '/mo',
    features: [
      'Instant Real-time Alerts',
      'Discord + Telegram + SMS',
      'Advanced Filters',
      'Mobile App Access',
      'Historical Price Data',
    ],
    color: 'bg-gradient-to-b from-blue-900/50 to-blue-950/50 border-blue-500 ring-2 ring-blue-500/50',
    buttonStyle: 'bg-blue-600 hover:bg-blue-700 text-white',
    popular: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$50',
    period: '/mo',
    features: [
      'Priority Access (First!)',
      'API Access (1000 req/day)',
      'Custom Webhooks',
      'Location-based Deals',
      'Reseller Analytics',
      'Private Discord Channel',
    ],
    color: 'bg-gradient-to-b from-amber-900/30 to-gray-900/50 border-amber-500/50',
    buttonStyle: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white',
  },
];

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (tierId: string) => {
    if (!isSignedIn) {
      // Redirect to sign in with return URL
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent('/pricing')}`;
      return;
    }

    setLoading(tierId);
    setError(null);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="px-6 h-16 flex items-center justify-between border-b border-white/10">
        <Link href="/" className="font-bold text-xl">🔥 GlitchSniper</Link>
        <div className="flex gap-4">
          {isSignedIn ? (
            <Link href="/dashboard" className="px-4 py-2 bg-white text-black rounded-full font-medium hover:bg-gray-200">
              Dashboard
            </Link>
          ) : (
            <Link href="/sign-in" className="px-4 py-2 bg-white text-black rounded-full font-medium hover:bg-gray-200">
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Pricing Content */}
      <div className="p-6 md:p-24">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Choose Your Weapon
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Invest in the tools that pay for themselves in one deal. Cancel anytime.
          </p>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 p-4 bg-red-900/50 border border-red-500 rounded-xl text-center">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-3xl p-8 flex flex-col relative border ${tier.color} backdrop-blur-sm transition-transform hover:scale-[1.02]`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg shadow-blue-500/30">
                  Most Popular
                </div>
              )}

              <h3 className="text-xl font-bold text-gray-300 mb-2">{tier.name}</h3>
              
              <div className="text-5xl font-bold mb-6">
                {tier.price}
                <span className="text-lg text-gray-500 font-normal">{tier.period}</span>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-3 items-start">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(tier.id)}
                disabled={loading === tier.id}
                className={`w-full py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${tier.buttonStyle}`}
              >
                {loading === tier.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Subscribe Now'
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Money-back guarantee */}
        <div className="text-center mt-12 text-gray-500">
          <p>💰 7-day money-back guarantee • Cancel anytime • No hidden fees</p>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-24">
          <h2 className="text-2xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div className="p-6 bg-gray-900/50 rounded-xl border border-white/10">
              <h3 className="font-bold mb-2">How fast are the notifications?</h3>
              <p className="text-gray-400">
                Pro and Elite members receive alerts within seconds of detection. Starter members receive a daily digest.
              </p>
            </div>
            
            <div className="p-6 bg-gray-900/50 rounded-xl border border-white/10">
              <h3 className="font-bold mb-2">What retailers do you monitor?</h3>
              <p className="text-gray-400">
                We monitor 100+ retailers including Amazon, Walmart, Target, Best Buy, Costco, Home Depot, and many more.
              </p>
            </div>
            
            <div className="p-6 bg-gray-900/50 rounded-xl border border-white/10">
              <h3 className="font-bold mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-400">
                Yes! Cancel anytime from your dashboard. You&apos;ll keep access until your billing period ends.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/10 text-center text-gray-500">
        © {new Date().getFullYear()} GlitchSniper. All rights reserved.
      </footer>
    </div>
  );
}
