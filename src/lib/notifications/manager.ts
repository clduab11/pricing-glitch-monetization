import { NotificationProvider, NotificationResult, ValidatedGlitch } from '@/types';
import { FacebookProvider } from './providers/facebook';
import { DiscordProvider } from './providers/discord';
import { SMSProvider } from './providers/sms';

type NotificationChannel = 'facebook' | 'discord' | 'sms';

/**
 * Notification Factory - Creates appropriate provider based on channel
 */
export class NotificationFactory {
  private static providers: Map<NotificationChannel, NotificationProvider> = new Map();

  static getProvider(channel: NotificationChannel): NotificationProvider {
    if (!this.providers.has(channel)) {
      this.providers.set(channel, this.createProvider(channel));
    }
    return this.providers.get(channel)!;
  }

  private static createProvider(channel: NotificationChannel): NotificationProvider {
    switch (channel) {
      case 'facebook':
        return new FacebookProvider();
      case 'discord':
        return new DiscordProvider();
      case 'sms':
        return new SMSProvider();
      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }
  }
}

/**
 * Notification Manager
 * Orchestrates notifications across all channels with priority handling
 */
export class NotificationManager {
  // Priority order: Facebook > Discord > SMS
  private readonly channelPriority: NotificationChannel[] = ['facebook', 'discord', 'sms'];
  private enabledChannels: Set<NotificationChannel>;

  constructor(channels?: NotificationChannel[]) {
    // Default to all channels, or use specified channels
    this.enabledChannels = new Set(channels || this.channelPriority);
  }

  /**
   * Send notification to all enabled channels
   * Returns results for each channel
   */
  async notifyAll(glitch: ValidatedGlitch): Promise<Map<NotificationChannel, NotificationResult>> {
    const results = new Map<NotificationChannel, NotificationResult>();

    // Send to channels in priority order
    for (const channel of this.channelPriority) {
      if (!this.enabledChannels.has(channel)) {
        continue;
      }

      const provider = NotificationFactory.getProvider(channel);
      const result = await provider.send(glitch);
      results.set(channel, result);

      // Save notification record
      await this.saveNotificationRecord(glitch, channel, result);
    }

    return results;
  }

  /**
   * Send notification to a specific channel
   */
  async notify(glitch: ValidatedGlitch, channel: NotificationChannel): Promise<NotificationResult> {
    if (!this.enabledChannels.has(channel)) {
      return {
        success: false,
        channel,
        error: `Channel ${channel} is not enabled`,
        sentAt: new Date().toISOString(),
      };
    }

    const provider = NotificationFactory.getProvider(channel);
    const result = await provider.send(glitch);

    // Save notification record
    await this.saveNotificationRecord(glitch, channel, result);

    return result;
  }

  /**
   * Send notification to priority channel only (Facebook)
   */
  async notifyPriority(glitch: ValidatedGlitch): Promise<NotificationResult> {
    return this.notify(glitch, 'facebook');
  }

  /**
   * Save notification record to database
   */
  private async saveNotificationRecord(
    glitch: ValidatedGlitch,
    channel: NotificationChannel,
    result: NotificationResult
  ): Promise<void> {
    const { db } = await import('@/db');

    try {
      await db.notification.create({
        data: {
          glitchId: glitch.id,
          channel,
          message: {
            title: `${Math.round(glitch.profitMargin)}% OFF! ${glitch.product.title}`,
            body: `Price dropped from $${(glitch.product.originalPrice ?? 0).toFixed(2)} to $${glitch.product.price.toFixed(2)}`,
            image_url: glitch.product.imageUrl,
            link: glitch.product.url,
            pricing: {
              current: glitch.product.price,
              original: glitch.product.originalPrice ?? 0,
              savings: (glitch.product.originalPrice ?? 0) - glitch.product.price,
              discount_percent: glitch.profitMargin,
            },
          },
          status: result.success ? 'sent' : 'failed',
          // createdAt is automatic
          deliveredAt: result.success && result.sentAt ? new Date(result.sentAt) : null,
        },
      });
    } catch (error) {
      console.error('Error saving notification record:', error);
    }
  }

  /**
   * Enable a notification channel
   */
  enableChannel(channel: NotificationChannel): void {
    this.enabledChannels.add(channel);
  }

  /**
   * Disable a notification channel
   */
  disableChannel(channel: NotificationChannel): void {
    this.enabledChannels.delete(channel);
  }

  /**
   * Get enabled channels
   */
  getEnabledChannels(): NotificationChannel[] {
    return Array.from(this.enabledChannels);
  }
}

// Export a default instance with all channels enabled
export const notificationManager = new NotificationManager();
