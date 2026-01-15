/**
 * Daily Digest Email Template
 * 
 * Generates inline HTML email for daily glitch digest.
 * Uses table-based layout for maximum email client compatibility.
 */

import { DigestGlitch } from '@/lib/analysis/ranking';

/**
 * Position indicator emoji based on ranking
 */
function getPositionEmoji(position: number): string {
  switch (position) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return `#${position}`;
  }
}

/**
 * Format price for display
 */
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Format relative time
 */
function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}

/**
 * Build HTML email content for daily digest
 * 
 * @param glitches - Ranked glitches to include in digest
 * @param recipientEmail - Recipient email for unsubscribe link
 * @returns HTML email content string
 */
export function buildDigestEmail(
  glitches: DigestGlitch[],
  recipientEmail?: string
): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const glitchRows = glitches.map((glitch, index) => {
    const position = index + 1;
    const positionDisplay = getPositionEmoji(position);
    
    return `
      <tr>
        <td style="padding: 20px; border-bottom: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="60" style="vertical-align: top; padding-right: 15px;">
                <div style="font-size: 28px; text-align: center; background: ${position <= 3 ? '#fef3c7' : '#f3f4f6'}; border-radius: 8px; padding: 10px;">
                  ${positionDisplay}
                </div>
              </td>
              <td style="vertical-align: top;">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #111827;">
                  ${escapeHtml(glitch.title.substring(0, 60))}${glitch.title.length > 60 ? '...' : ''}
                </h3>
                <p style="margin: 0 0 10px 0; font-size: 12px; color: #6b7280; text-transform: uppercase;">
                  ${escapeHtml(glitch.retailer)} • ${glitch.glitchType.replace('_', ' ')}
                </p>
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right: 20px;">
                      <span style="text-decoration: line-through; color: #9ca3af; font-size: 14px;">
                        ${formatPrice(glitch.originalPrice)}
                      </span>
                    </td>
                    <td style="padding-right: 20px;">
                      <span style="color: #dc2626; font-size: 20px; font-weight: bold;">
                        ${formatPrice(glitch.glitchPrice)}
                      </span>
                    </td>
                    <td>
                      <span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${glitch.savingsPercent}% OFF
                      </span>
                    </td>
                  </tr>
                </table>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                  Confidence: ${glitch.confidence}% • Detected ${formatTime(glitch.detectedAt)}
                </p>
              </td>
              <td width="100" style="vertical-align: middle; text-align: center;">
                <a href="${escapeHtml(glitch.link)}" 
                   style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                  VIEW
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Glitch Digest - ${date}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 30px; background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); border-radius: 12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 28px; color: white;">🦅 Pricehawk</h1>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Daily Price Glitch Digest</p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.8);">${date}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding: 25px 30px; background: #f0f9ff; border-bottom: 1px solid #e0f2fe;">
              <p style="margin: 0; font-size: 16px; color: #0369a1;">
                🔥 <strong>${glitches.length} Hot Glitches</strong> detected in the last 24 hours
              </p>
            </td>
          </tr>

          <!-- Glitch List -->
          ${glitchRows}

          <!-- CTA -->
          <tr>
            <td style="padding: 30px; text-align: center; background: #f9fafb;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pricehawk.io'}/dashboard" 
                 style="display: inline-block; background: #111827; color: white; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                View All Glitches
              </a>
              <p style="margin: 20px 0 0 0; font-size: 12px; color: #6b7280;">
                Want real-time alerts? <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pricehawk.io'}/pricing" style="color: #2563eb;">Upgrade your plan</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background: #f3f4f6; border-radius: 0 0 12px 12px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 12px; color: #6b7280;">
                      © ${new Date().getFullYear()} Pricehawk by Parallax Analytics
                    </p>
                  </td>
                  <td align="right">
                    ${recipientEmail ? `
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://pricehawk.io'}/dashboard/preferences?unsubscribe=digest&email=${encodeURIComponent(recipientEmail)}" 
                       style="font-size: 12px; color: #6b7280;">
                      Unsubscribe from digest
                    </a>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Legal -->
        <p style="margin: 20px 0 0 0; font-size: 11px; color: #9ca3af; text-align: center; max-width: 500px;">
          Prices may change at any time. Pricehawk is an informational service and makes no guarantees about order fulfillment. 
          Always verify prices before purchasing.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Build plain text version of digest for email fallback
 */
export function buildDigestText(glitches: DigestGlitch[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let text = `PRICEHAWK DAILY DIGEST - ${date}\n`;
  text += `${'='.repeat(50)}\n\n`;
  text += `🔥 ${glitches.length} Hot Glitches detected in the last 24 hours\n\n`;

  glitches.forEach((glitch, index) => {
    const position = index + 1;
    text += `#${position}: ${glitch.title.substring(0, 50)}${glitch.title.length > 50 ? '...' : ''}\n`;
    text += `    ${glitch.retailer} • ${glitch.glitchType}\n`;
    text += `    Was: ${formatPrice(glitch.originalPrice)} → Now: ${formatPrice(glitch.glitchPrice)} (${glitch.savingsPercent}% off)\n`;
    text += `    Link: ${glitch.link}\n\n`;
  });

  text += `${'='.repeat(50)}\n`;
  text += `View all glitches: ${process.env.NEXT_PUBLIC_APP_URL || 'https://pricehawk.io'}/dashboard\n`;

  return text;
}
