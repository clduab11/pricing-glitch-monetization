# Notification System

## Overview

Multi-channel notification delivery system supporting Discord, Telegram, Email, SMS, and Webhooks with tier-based routing and rate limiting.

## Architecture

```
                     ┌───────────────────────┐
                     │ Notification Queue   │
                     │ (BullMQ/Redis)       │
                     └──────────┬────────────┘
                                │
                                ▼
                     ┌───────────────────────┐
                     │ Notification Router  │
                     │ (Tier-based routing) │
                     └──────────┬────────────┘
                                │
           ┌────────────┼────────────┐
           │                │              │
           ▼                ▼              ▼
  ┌────────────┐   ┌───────────┐  ┌────────────┐
  │ Discord     │   │ Telegram   │  │ Email/SMS   │
  │ Bot         │   │ Bot        │  │ Service     │
  └────────────┘   └───────────┘  └────────────┘
```

## Implementation

### 1. Notification Router

```typescript
import { Queue, Worker } from 'bullmq';
import { db } from '../db';

interface NotificationJob {
  dealId: string;
  productData: {
    title: string;
    price: number;
    originalPrice: number;
    url: string;
    imageUrl?: string;
    retailer: string;
    confidence: number;
    profitMargin: number;
  };
  tier: 'free' | 'starter' | 'pro' | 'elite';
}

export class NotificationRouter {
  private queue: Queue<NotificationJob>;

  constructor() {
    this.queue = new Queue('notifications', {
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    this.setupWorkers();
  }

  async notifySubscribers(deal: PricingError): Promise<void> {
    // Get all active subscribers
    const subscribers = await db.subscription.findMany({
      where: {
        status: 'active',
      },
      include: {
        user: {
          include: {
            preferences: true,
          },
        },
      },
    });

    // Filter based on user preferences
    const filtered = subscribers.filter(sub => 
      this.matchesPreferences(deal, sub.user.preferences)
    );

    // Route to appropriate channels based on tier
    for (const sub of filtered) {
      await this.queue.add(
        'notify-user',
        {
          dealId: deal.id,
          productData: {
            title: deal.product.title,
            price: deal.product.price,
            originalPrice: deal.product.originalPrice!,
            url: deal.product.url,
            imageUrl: deal.product.imageUrl,
            retailer: deal.product.retailer,
            confidence: deal.confidence,
            profitMargin: deal.profitMargin,
          },
          tier: sub.tier,
        },
        {
          priority: this.getPriority(sub.tier),
          delay: this.getDelay(sub.tier),
        }
      );
    }
  }

  private matchesPreferences(
    deal: PricingError,
    preferences: UserPreferences
  ): boolean {
    // Category filter
    if (
      preferences.categories.length > 0 &&
      !preferences.categories.includes(deal.product.category)
    ) {
      return false;
    }

    // Retailer filter
    if (
      preferences.retailers.length > 0 &&
      !preferences.retailers.includes(deal.product.retailer)
    ) {
      return false;
    }

    // Minimum profit margin
    if (deal.profitMargin < preferences.minProfitMargin) {
      return false;
    }

    // Price range
    if (
      deal.product.price < preferences.minPrice ||
      deal.product.price > preferences.maxPrice
    ) {
      return false;
    }

    return true;
  }

  private getPriority(tier: string): number {
    const priorities = {
      elite: 1,
      pro: 2,
      starter: 3,
      free: 4,
    };
    return priorities[tier] || 10;
  }

  private getDelay(tier: string): number {
    // Elite: instant, Pro: <5min, Starter: 24hr, Free: weekly
    const delays = {
      elite: 0,
      pro: 0,
      starter: 24 * 60 * 60 * 1000, // 24 hours
      free: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    return delays[tier] || 0;
  }

  private setupWorkers(): void {
    new Worker<NotificationJob>(
      'notifications',
      async (job) => {
        const { dealId, productData, tier } = job.data;

        // Get user's notification preferences
        const user = await this.getUserBySubscriptionTier(tier);
        
        // Send to all enabled channels
        await Promise.allSettled([
          user.preferences.enableDiscord && 
            this.sendDiscordNotification(user, productData),
          user.preferences.enableTelegram && 
            this.sendTelegramNotification(user, productData),
          user.preferences.enableEmail && 
            this.sendEmailNotification(user, productData),
          user.preferences.enableSMS && 
            this.sendSMSNotification(user, productData),
          user.preferences.webhookUrl && 
            this.sendWebhook(user, productData),
        ]);
      },
      {
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency: 10,
      }
    );
  }
}
```

### 2. Discord Bot

```typescript
import { Client, EmbedBuilder, TextChannel } from 'discord.js';

export class DiscordNotifier {
  private client: Client;
  private channelId: string;

  constructor() {
    this.client = new Client({
      intents: ['Guilds', 'GuildMessages'],
    });
    this.channelId = process.env.DISCORD_CHANNEL_ID!;
  }

  async initialize(): Promise<void> {
    await this.client.login(process.env.DISCORD_BOT_TOKEN);
  }

  async sendDealNotification(
    deal: ProductData,
    userMention?: string
  ): Promise<void> {
    const channel = await this.client.channels.fetch(
      this.channelId
    ) as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle(`🚨 ${deal.title}`)
      .setDescription(
        `**${Math.round(deal.profitMargin)}% OFF** - Confidence: ${deal.confidence}%`
      )
      .addFields(
        {
          name: 'Original Price',
          value: `$${deal.originalPrice.toFixed(2)}`,
          inline: true,
        },
        {
          name: 'Current Price',
          value: `$${deal.price.toFixed(2)}`,
          inline: true,
        },
        {
          name: 'Savings',
          value: `$${(deal.originalPrice - deal.price).toFixed(2)}`,
          inline: true,
        },
        {
          name: 'Retailer',
          value: deal.retailer.toUpperCase(),
          inline: true,
        }
      )
      .setURL(deal.url)
      .setColor(this.getColorByDiscount(deal.profitMargin))
      .setTimestamp()
      .setFooter({ text: 'Act fast - prices may change!' });

    if (deal.imageUrl) {
      embed.setThumbnail(deal.imageUrl);
    }

    const content = userMention ? `${userMention}` : undefined;

    await channel.send({
      content,
      embeds: [embed],
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 5, // Link
              label: 'View Deal',
              url: deal.url,
            },
          ],
        },
      ],
    });
  }

  private getColorByDiscount(profitMargin: number): number {
    if (profitMargin >= 70) return 0xff0000; // Red - Hot deal
    if (profitMargin >= 50) return 0xff6600; // Orange - Great deal
    if (profitMargin >= 30) return 0xffaa00; // Yellow - Good deal
    return 0x00ff00; // Green - Decent deal
  }
}
```

### 3. Telegram Bot

```typescript
import TelegramBot from 'node-telegram-bot-api';

export class TelegramNotifier {
  private bot: TelegramBot;

  constructor() {
    this.bot = new TelegramBot(
      process.env.TELEGRAM_BOT_TOKEN!,
      { polling: true }
    );

    this.setupCommands();
  }

  private setupCommands(): void {
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(
        chatId,
        'Welcome to pricehawk Alerts! Use /preferences to configure your alerts.'
      );
    });

    this.bot.onText(/\/preferences/, async (msg) => {
      const chatId = msg.chat.id;
      // Show inline keyboard with preferences
      await this.showPreferences(chatId);
    });
  }

  async sendDealNotification(
    chatId: number,
    deal: ProductData
  ): Promise<void> {
    const message = this.formatDealMessage(deal);

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🛒 View Deal',
            url: deal.url,
          },
        ],
        [
          {
            text: '❤️ Save',
            callback_data: `save_${deal.id}`,
          },
          {
            text: '🚫 Not Interested',
            callback_data: `skip_${deal.id}`,
          },
        ],
      ],
    };

    if (deal.imageUrl) {
      await this.bot.sendPhoto(chatId, deal.imageUrl, {
        caption: message,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } else {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    }
  }

  private formatDealMessage(deal: ProductData): string {
    return `
🚨 *${deal.title}*

💰 Original: ~$${deal.originalPrice.toFixed(2)}~
🎯 Current: *$${deal.price.toFixed(2)}*
📊 Discount: *${Math.round(deal.profitMargin)}% OFF*
🏪 Retailer: ${deal.retailer.toUpperCase()}
✅ Confidence: ${deal.confidence}%

⏰ Act fast - limited time!
    `.trim();
  }

  private async showPreferences(chatId: number): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📱 Electronics', callback_data: 'cat_electronics' },
          { text: '🏠 Home', callback_data: 'cat_home' },
        ],
        [
          { text: '👗 Clothing', callback_data: 'cat_clothing' },
          { text: '🎮 Gaming', callback_data: 'cat_gaming' },
        ],
        [
          { text: '⚙️ Set Min Discount', callback_data: 'set_min_discount' },
        ],
      ],
    };

    await this.bot.sendMessage(
      chatId,
      'Configure your alert preferences:',
      { reply_markup: keyboard }
    );
  }
}
```

### 4. Email Service

```typescript
import { Resend } from 'resend';
import { renderToString } from 'react-dom/server';
import { DealEmailTemplate } from './email-templates/DealEmail';

export class EmailNotifier {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendDealNotification(
    email: string,
    deals: ProductData[]
  ): Promise<void> {
    const html = renderToString(
      <DealEmailTemplate deals={deals} />
    );

    await this.resend.emails.send({
      from: 'pricehawk Alerts <alerts@yourdomain.com>',
      to: email,
      subject: `🚨 ${deals.length} New Pricing Error${deals.length > 1 ? 's' : ''} Found!`,
      html,
    });
  }

  async sendWeeklyDigest(
    email: string,
    deals: ProductData[]
  ): Promise<void> {
    const html = renderToString(
      <WeeklyDigestTemplate deals={deals} />
    );

    await this.resend.emails.send({
      from: 'pricehawk Weekly <weekly@yourdomain.com>',
      to: email,
      subject: 'Your Weekly pricehawk Digest',
      html,
    });
  }
}
```

### 5. SMS Service

```typescript
import twilio from 'twilio';

export class SMSNotifier {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER!;
  }

  async sendDealNotification(
    phoneNumber: string,
    deal: ProductData
  ): Promise<void> {
    const message = `🚨 ${Math.round(deal.profitMargin)}% OFF!
${deal.title}
Was: $${deal.originalPrice.toFixed(2)}
Now: $${deal.price.toFixed(2)}
${this.shortenUrl(deal.url)}`;

    await this.client.messages.create({
      body: message,
      from: this.fromNumber,
      to: phoneNumber,
    });
  }

  private shortenUrl(url: string): string {
    // Use URL shortener service (bit.ly, TinyURL, etc.)
    return url.substring(0, 50) + '...';
  }
}
```

### 6. Webhook System

```typescript
import axios from 'axios';

export class WebhookNotifier {
  async sendWebhook(
    webhookUrl: string,
    deal: ProductData,
    retries = 3
  ): Promise<void> {
    const payload = {
      event: 'pricing_error.detected',
      timestamp: new Date().toISOString(),
      data: {
        deal_id: deal.id,
        product: {
          title: deal.title,
          url: deal.url,
          image_url: deal.imageUrl,
          retailer: deal.retailer,
        },
        pricing: {
          current_price: deal.price,
          original_price: deal.originalPrice,
          discount_percent: deal.profitMargin,
          savings: deal.originalPrice - deal.price,
        },
        metadata: {
          confidence: deal.confidence,
          detected_at: new Date().toISOString(),
        },
      },
    };

    const signature = this.generateSignature(payload);

    for (let i = 0; i < retries; i++) {
      try {
        await axios.post(webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          timeout: 10000,
        });
        return;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, i))
        );
      }
    }
  }

  private generateSignature(payload: any): string {
    const crypto = require('crypto');
    const secret = process.env.WEBHOOK_SECRET!;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }
}
```

## Rate Limiting

```typescript
export class NotificationRateLimiter {
  private redisClient: ReturnType<typeof createClient>;

  async checkRateLimit(
    userId: string,
    channel: 'email' | 'sms' | 'discord' | 'telegram'
  ): Promise<boolean> {
    const limits = {
      email: { count: 20, window: 3600 }, // 20 per hour
      sms: { count: 5, window: 3600 }, // 5 per hour
      discord: { count: 50, window: 60 }, // 50 per minute
      telegram: { count: 50, window: 60 },
    };

    const limit = limits[channel];
    const key = `ratelimit:notification:${userId}:${channel}`;
    const now = Date.now();
    const windowStart = now - limit.window * 1000;

    await this.redisClient.zRemRangeByScore(key, 0, windowStart);
    const count = await this.redisClient.zCard(key);

    if (count >= limit.count) {
      return false;
    }

    await this.redisClient.zAdd(key, {
      score: now,
      value: now.toString(),
    });

    await this.redisClient.expire(key, limit.window);

    return true;
  }
}
```

## Testing

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { DiscordNotifier } from './discord-notifier';

describe('DiscordNotifier', () => {
  let notifier: DiscordNotifier;

  beforeAll(async () => {
    notifier = new DiscordNotifier();
    await notifier.initialize();
  });

  it('sends deal notification', async () => {
    const deal = {
      id: 'test-deal',
      title: 'Test Product',
      price: 10,
      originalPrice: 100,
      url: 'https://example.com',
      retailer: 'amazon',
      confidence: 95,
      profitMargin: 90,
    };

    await expect(
      notifier.sendDealNotification(deal)
    ).resolves.not.toThrow();
  });
});
```
