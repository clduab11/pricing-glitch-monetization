
import { db } from '@/db';
import { currentUser } from '@clerk/nextjs/server'; // Correct import for Next.js App Router
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/');

  // Fetch latest glitches
  const glitches = await db.validatedGlitch.findMany({
    include: { product: true },
    orderBy: { validatedAt: 'desc' },
    take: 50
  });

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between">
         <div className="font-bold">GlitchSniper Dashboard</div>
         <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.emailAddresses[0].emailAddress}</span>
            {/* UserButton would go here */}
         </div>
      </header>

      {/* Content */}
      <div className="p-6">
         <h2 className="text-2xl font-bold mb-6">Live Glitch Feed</h2>
         
         <div className="grid gap-4">
            {glitches.length === 0 ? (
                <div className="text-gray-500 text-center py-12">No active glitches found. The scanners are running...</div>
            ) : (
                glitches.map(glitch => (
                    <div key={glitch.id} className="bg-gray-900 border border-white/10 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {glitch.product.imageUrl && (
                                <img src={glitch.product.imageUrl} alt="" className="w-12 h-12 object-cover rounded bg-white" />
                            )}
                            <div>
                                <div className="font-bold">{glitch.product.title}</div>
                                <div className="text-xs text-gray-400 uppercase">{glitch.product.retailer} • {glitch.glitchType}</div>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-green-400 font-bold text-xl">${Number(glitch.product.price).toFixed(2)}</div>
                             {glitch.product.originalPrice && (
                               <div className="text-gray-600 line-through text-sm">${Number(glitch.product.originalPrice).toFixed(2)}</div>
                             )}
                        </div>
                        <div className="px-4">
                            <a href={glitch.product.url} target="_blank" className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold hover:bg-blue-700">
                                BUY NOW
                            </a>
                        </div>
                    </div>
                ))
            )}
         </div>
      </div>
    </div>
  )
}
