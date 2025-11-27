# Facebook Delivery Specification

## Overview

This document specifies the Facebook Graph API integration for publishing pricing error alerts to a managed Facebook Page. Facebook is the **priority notification channel** for the Pricing Error Alert Service.

## Mechanism

**Type:** Server-to-Server API calls
**API:** Facebook Graph API v18.0
**Authentication:** Page Access Token (long-lived)

## Prerequisites

### 1. Facebook App Setup

1. Create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
2. Add the "Pages" product to your app
3. Configure OAuth redirect URIs
4. Request the following permissions:
   - `pages_manage_posts` - Publish posts to Pages
   - `pages_read_engagement` - Read post engagement metrics
   - `pages_messaging` (optional) - For Messenger integration

### 2. Page Access Token

Generate a long-lived Page Access Token:

```bash
# 1. Get User Access Token (short-lived) from Graph Explorer
# 2. Exchange for long-lived token
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_LIVED_TOKEN}"

# 3. Get Page Access Token
curl -X GET "https://graph.facebook.com/v18.0/me/accounts?access_token={LONG_LIVED_USER_TOKEN}"
```

### 3. Required Environment Variables

```env
FACEBOOK_PAGE_ID=your_page_id
FACEBOOK_PAGE_ACCESS_TOKEN=your_long_lived_page_access_token
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

## Integration Flow

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  glitch_       │────▶│  Facebook      │────▶│  Facebook      │
│  confirmed     │     │  Provider      │     │  Graph API     │
│  event         │     │                │     │                │
└────────────────┘     └────────────────┘     └────────────────┘
                              │
                              ▼
                       ┌────────────────┐
                       │  Page Feed     │
                       │  Post Created  │
                       └────────────────┘
```

## API Implementation

### Post to Page Feed

**Endpoint:** `POST /{page-id}/feed`

```typescript
interface FacebookPostPayload {
  /** Post message with product details */
  message: string;
  
  /** Product/affiliate link */
  link: string;
  
  /** Whether this is published immediately */
  published?: boolean;
  
  /** Scheduled publish time (Unix timestamp) */
  scheduled_publish_time?: number;
}

async function postToPageFeed(glitch: ValidatedGlitch): Promise<string> {
  const message = formatGlitchMessage(glitch);
  
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/feed`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        link: glitch.product.url,
        access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      }),
    }
  );
  
  const data = await response.json();
  return data.id; // Returns post ID
}
```

### Post with Photo

**Endpoint:** `POST /{page-id}/photos`

For richer posts with product images:

```typescript
async function postWithPhoto(glitch: ValidatedGlitch): Promise<string> {
  const message = formatGlitchMessage(glitch);
  
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${process.env.FACEBOOK_PAGE_ID}/photos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        url: glitch.product.image_url,
        access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      }),
    }
  );
  
  const data = await response.json();
  return data.post_id;
}
```

## Message Formatting

### Standard Format

```typescript
function formatGlitchMessage(glitch: ValidatedGlitch): string {
  const { product, validation, profit_margin } = glitch;
  const originalPrice = product.original_price ?? 0;
  const savings = originalPrice - product.current_price;
  
  // Build price comparison section
  const priceSection = originalPrice > 0
    ? `💰 Was: $${originalPrice.toFixed(2)}
🎯 Now: $${product.current_price.toFixed(2)}
💵 You Save: $${savings.toFixed(2)} (${Math.round(profit_margin)}% OFF!)`
    : `🎯 Price: $${product.current_price.toFixed(2)}
📉 Discount: ${Math.round(profit_margin)}% OFF!`;
  
  return `🚨 PRICING ERROR ALERT! 🚨

${product.product_name}

${priceSection}

⚡ Confidence: ${validation.confidence}%
📦 Stock: ${product.stock_status === 'in_stock' ? '✅ In Stock' : '⚠️ Limited'}

⏰ ACT FAST - Pricing errors can be corrected at any time!

👇 GRAB THE DEAL 👇
${product.url}

#PricingError #Deal #Glitch #${product.retailer_id.charAt(0).toUpperCase() + product.retailer_id.slice(1)}`;
}
```

### Compact Format (for high frequency)

```typescript
function formatCompactMessage(glitch: ValidatedGlitch): string {
  const { product, profit_margin } = glitch;
  const originalPrice = product.original_price ?? 0;
  
  const priceText = originalPrice > 0
    ? `$${product.current_price.toFixed(2)} (was $${originalPrice.toFixed(2)})`
    : `$${product.current_price.toFixed(2)}`;
  
  return `🔥 ${Math.round(profit_margin)}% OFF - ${product.product_name}
${priceText}
👉 ${product.url}`;
}
```

## FacebookProvider Implementation

```typescript
// lib/notifications/providers/facebook.ts

import { NotificationProvider, NotificationResult } from '../types';
import { ValidatedGlitch } from '@/types';

export class FacebookProvider implements NotificationProvider {
  private pageId: string;
  private accessToken: string;
  private baseUrl = 'https://graph.facebook.com/v18.0';

  constructor() {
    this.pageId = process.env.FACEBOOK_PAGE_ID!;
    this.accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
    
    if (!this.pageId || !this.accessToken) {
      throw new Error('Facebook credentials not configured');
    }
  }

  async send(glitch: ValidatedGlitch): Promise<NotificationResult> {
    try {
      const postId = glitch.product.image_url
        ? await this.postWithPhoto(glitch)
        : await this.postToFeed(glitch);

      return {
        success: true,
        channel: 'facebook',
        messageId: postId,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        channel: 'facebook',
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date().toISOString(),
      };
    }
  }

  private async postToFeed(glitch: ValidatedGlitch): Promise<string> {
    const message = this.formatMessage(glitch);
    
    const response = await fetch(`${this.baseUrl}/${this.pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        link: glitch.product.url,
        access_token: this.accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Facebook API error: ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.id;
  }

  private async postWithPhoto(glitch: ValidatedGlitch): Promise<string> {
    const message = this.formatMessage(glitch);
    
    const response = await fetch(`${this.baseUrl}/${this.pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        url: glitch.product.image_url,
        access_token: this.accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Facebook API error: ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.post_id;
  }

  private formatMessage(glitch: ValidatedGlitch): string {
    const { product, validation, profit_margin } = glitch;
    const savings = (product.original_price ?? 0) - product.current_price;
    
    return `🚨 PRICING ERROR ALERT! 🚨

${product.product_name}

💰 Was: $${(product.original_price ?? 0).toFixed(2)}
🎯 Now: $${product.current_price.toFixed(2)}
💵 You Save: $${savings.toFixed(2)} (${Math.round(profit_margin)}% OFF!)

⚡ Confidence: ${validation.confidence}%

⏰ ACT FAST - Pricing errors can be corrected at any time!

👇 GRAB THE DEAL 👇`;
  }
}
```

## Rate Limits

Facebook Graph API has the following rate limits:

| Limit Type | Threshold |
|------------|-----------|
| App-level | 200 calls/user/hour |
| Page-level | 4800 calls/day |
| Post creation | ~25 posts/day (soft limit) |

### Best Practices

1. **Batch similar glitches** - Combine multiple glitches from same retailer
2. **Implement backoff** - Exponential backoff on 429 errors
3. **Queue management** - Use Redis queue to respect rate limits
4. **Time distribution** - Spread posts throughout the day

## Error Handling

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| 190 | Invalid access token | Refresh token |
| 200 | Permission denied | Check app permissions |
| 341 | Rate limit reached | Implement backoff |
| 506 | Duplicate post | Skip/modify message |

### Retry Strategy

```typescript
async function postWithRetry(
  glitch: ValidatedGlitch,
  maxRetries = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await postToPageFeed(glitch);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Messenger Integration (Optional)

For direct messaging to subscribers:

**Endpoint:** `POST /me/messages`

```typescript
async function sendMessengerNotification(
  recipientId: string,
  glitch: ValidatedGlitch
): Promise<void> {
  await fetch('https://graph.facebook.com/v18.0/me/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [{
              title: `${Math.round(glitch.profit_margin)}% OFF!`,
              subtitle: glitch.product.product_name,
              image_url: glitch.product.image_url,
              default_action: {
                type: 'web_url',
                url: glitch.product.url,
              },
              buttons: [{
                type: 'web_url',
                url: glitch.product.url,
                title: 'View Deal',
              }],
            }],
          },
        },
      },
      access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    }),
  });
}
```

## Testing

### Test with Graph API Explorer

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app and get a Page Access Token
3. Test posting: `POST /{page-id}/feed?message=Test&access_token={token}`

### Test Endpoint

```bash
curl -X POST "https://graph.facebook.com/v18.0/{PAGE_ID}/feed" \
  -d "message=🧪 Test pricing alert post" \
  -d "access_token={PAGE_ACCESS_TOKEN}"
```

## Security Considerations

1. **Never expose tokens** in client-side code
2. **Use environment variables** for all credentials
3. **Implement token refresh** before expiration
4. **Log API calls** for audit purposes
5. **Rate limit internally** to prevent API abuse
