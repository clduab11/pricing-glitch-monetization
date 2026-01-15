/**
 * beehiiv Newsletter Integration
 * 
 * Publishes daily glitch digest to beehiiv for ad-supported newsletter distribution.
 */

import { DigestGlitch } from '@/lib/analysis/ranking';

// beehiiv API configuration
const BEEHIIV_API_URL = 'https://api.beehiiv.com/v2';
const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;
const USE_BEEHIIV_DIGEST = process.env.USE_BEEHIIV_DIGEST === 'true';

/**
 * beehiiv post creation response
 */
interface BeehiivPostResponse {
  data: {
    id: string;
    title: string;
    subtitle: string | null;
    slug: string;
    status: string;
    publish_date: string | null;
    web_url: string;
  };
}

/**
 * Check if beehiiv integration is enabled and configured
 */
export function isBeehiivEnabled(): boolean {
  return USE_BEEHIIV_DIGEST && Boolean(BEEHIIV_API_KEY) && Boolean(BEEHIIV_PUBLICATION_ID);
}

/**
 * Format glitches as HTML content for beehiiv post
 */
function formatGlitchesAsContent(glitches: DigestGlitch[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  let content = `<p>🔥 <strong>${glitches.length} hot price glitches</strong> detected today (${date}). Act fast — these deals typically last 15-60 minutes!</p>\n\n`;

  glitches.forEach((glitch, index) => {
    const position = index + 1;
    const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '🔥';

    content += `<h3>${emoji} #${position}: ${glitch.title.substring(0, 80)}${glitch.title.length > 80 ? '...' : ''}</h3>\n`;
    content += `<p><strong>${glitch.retailer}</strong> • ${glitch.glitchType.replace('_', ' ')}</p>\n`;
    content += `<p>`;
    content += `<del>$${glitch.originalPrice.toFixed(2)}</del> → `;
    content += `<strong style="color: #dc2626; font-size: 1.2em;">$${glitch.glitchPrice.toFixed(2)}</strong> `;
    content += `<span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px;">${glitch.savingsPercent}% OFF</span>`;
    content += `</p>\n`;
    content += `<p><a href="${glitch.link}" target="_blank" rel="noopener">👉 View Deal</a></p>\n`;
    content += `<hr>\n\n`;
  });

  content += `<p><em>Prices may change at any time. Always verify before purchasing.</em></p>\n`;
  content += `<p>Want real-time alerts before deals go viral? <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pricehawk.io'}/pricing">Upgrade to Pricehawk Pro</a></p>`;

  return content;
}

/**
 * Publish daily digest to beehiiv
 * 
 * Creates a new post in the configured beehiiv publication.
 * The post is created as a draft by default for review before publishing.
 * 
 * @param glitches - Ranked glitches to include in the digest
 * @param publishImmediately - If true, publish immediately instead of as draft
 * @returns Post ID on success, null on failure
 */
export async function publishDigest(
  glitches: DigestGlitch[],
  publishImmediately: boolean = false
): Promise<string | null> {
  if (!isBeehiivEnabled()) {
    console.log('beehiiv integration not enabled or not configured');
    return null;
  }

  if (glitches.length === 0) {
    console.log('No glitches to publish to beehiiv');
    return null;
  }

  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const title = `🦅 Top ${glitches.length} Price Glitches Today (${date})`;
  const subtitle = `${glitches[0].savingsPercent}% off ${glitches[0].retailer} and ${glitches.length - 1} more deals`;
  const content = formatGlitchesAsContent(glitches);

  try {
    const response = await fetch(
      `${BEEHIIV_API_URL}/publications/${BEEHIIV_PUBLICATION_ID}/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          title,
          subtitle,
          content,
          status: publishImmediately ? 'published' : 'draft',
          content_tags: ['price-glitch', 'deals', 'daily-digest'],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('beehiiv API error:', response.status, errorText);
      return null;
    }

    const data: BeehiivPostResponse = await response.json();
    console.log(`beehiiv post created: ${data.data.id} (${data.data.status})`);
    return data.data.id;
  } catch (error) {
    console.error('Error publishing to beehiiv:', error);
    return null;
  }
}

/**
 * Get publication info from beehiiv (for validation)
 */
export async function getPublicationInfo(): Promise<{ id: string; name: string } | null> {
  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    return null;
  }

  try {
    const response = await fetch(
      `${BEEHIIV_API_URL}/publications/${BEEHIIV_PUBLICATION_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      id: data.data.id,
      name: data.data.name,
    };
  } catch {
    return null;
  }
}
