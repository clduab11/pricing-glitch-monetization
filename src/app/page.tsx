
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      {/* Navbar */}
      <header className="px-6 h-16 flex items-center justify-between border-b border-white/10">
        <div className="font-bold text-xl">🦅 pricehawk</div>
        <div className="flex gap-4">
          <Link href="/pricing" className="px-4 py-2 hover:text-gray-300">Pricing</Link>
          <Link href="/dashboard" className="px-4 py-2 bg-white text-black rounded-full font-medium hover:bg-gray-200">
            Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="py-24 px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter bg-gradient-to-br from-white to-gray-500 bg-clip-text text-transparent mb-6">
            Find Pricing Errors <br/> Before They&apos;re Fixed
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Our automated engine monitors 100+ retailers 24/7 to catch decimal errors, coupon stacks, and clearance glitches instantly.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/pricing" className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-full font-bold text-lg transition-all">
              Start Slashing
            </Link>
          </div>
        </section>

        {/* Live Ticker (Simulated) */}
        <section className="py-12 border-y border-white/10 bg-white/5 overflow-hidden">
           <div className="px-6 max-w-6xl mx-auto">
             <div className="flex gap-8 animate-scroll">
               <GlitchCard title="Sony TV" price="$19.99" original="$1999.00" retailer="Amazon" />
               <GlitchCard title="MacBook Pro" price="$50.00" original="$2400.00" retailer="Walmart" />
               <GlitchCard title="Rolex Watch" price="$150.00" original="$15000.00" retailer="Target" />
               <GlitchCard title="Dyson Vacuum" price="$9.99" original="$499.99" retailer="BestBuy" />
             </div>
           </div>
        </section>

        {/* Features */}
        <section className="py-24 px-6 max-w-6xl mx-auto grid md:grid-cols-3 gap-12">
           <FeatureCard title="Instant Alerts" description="Get notified via Discord/SMS within seconds of a price drop." />
           <FeatureCard title="99% Saved" description="We specialize in deep discounts (90%+) caused by technical errors." />
           <FeatureCard title="Reseller Ready" description="Tools to buy in bulk and resell for massive profit." />
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/10 text-center text-gray-500">
        © 2024 pricehawk. All rights reserved.
      </footer>
    </div>
  );
}

interface GlitchCardProps {
  title: string;
  price: string;
  original: string;
  retailer: string;
}

function GlitchCard({ title, price, original, retailer }: GlitchCardProps) {
  return (
    <div className="flex-shrink-0 w-64 p-4 rounded-xl bg-gray-900 border border-white/10">
       <div className="text-xs text-gray-400 uppercase mb-1">{retailer}</div>
       <div className="font-bold text-lg mb-2">{title}</div>
       <div className="flex items-baseline gap-2">
         <span className="text-green-400 font-bold text-xl">{price}</span>
         <span className="text-gray-600 line-through text-sm">{original}</span>
       </div>
    </div>
  )
}

interface FeatureCardProps {
  title: string;
  description: string;
}

function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-400 font-bold">✓</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  )
}
