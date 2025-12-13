import { NotificationProvider, NotificationResult, ValidatedGlitch } from '@/types';

/**
 * Facebook Graph API Provider
 * Priority notification channel - publishes to Page Feed
 */
export class FacebookProvider implements NotificationProvider {
  private pageId: string;
  private accessToken: string;
  private baseUrl = 'https://graph.facebook.com/v18.0';

  constructor() {
    this.pageId = process.env.FACEBOOK_PAGE_ID || '';
    this.accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
  }

  async send(glitch: ValidatedGlitch): Promise<NotificationResult> {
    if (!this.pageId || !this.accessToken) {
      return {
        success: false,
        channel: 'facebook',
        error: 'Facebook credentials not configured',
        sentAt: new Date().toISOString(),
      };
    }

    try {
      const postId = glitch.product.imageUrl
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
        url: glitch.product.imageUrl,
        access_token: this.accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Facebook API error: ${error.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.post_id || data.id;
  }

  private formatMessage(glitch: ValidatedGlitch): string {
    const { product, profitMargin, confidence } = glitch;
    const savings = (product.originalPrice ?? 0) - product.price;

    return `🚨 PRICING ERROR ALERT! 🚨

${product.title}

💰 Was: $${(product.originalPrice ?? 0).toFixed(2)}
🎯 Now: $${product.price.toFixed(2)}
💵 You Save: $${savings.toFixed(2)} (${Math.round(profitMargin)}% OFF!)

⚡ Confidence: ${confidence}%
📦 Stock: ${product.stockStatus === 'in_stock' ? '✅ In Stock' : '⚠️ Limited'}

⏰ ACT FAST - Pricing errors can be corrected at any time!

👇 GRAB THE DEAL 👇
${product.url}

#PricingError #Deal #Glitch #${product.retailer.charAt(0).toUpperCase() + product.retailer.slice(1)}`;
  }
}
