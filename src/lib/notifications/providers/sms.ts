import { NotificationProvider, NotificationResult, ValidatedGlitch } from '@/types';

/**
 * SMS Provider using Twilio
 * Sends SMS notifications to subscribers
 */
export class SMSProvider implements NotificationProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;
  private toNumbers: string[];

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    // Comma-separated list of phone numbers to notify
    this.toNumbers = (process.env.SMS_NOTIFY_NUMBERS || '').split(',').filter(Boolean);
  }

  async send(glitch: ValidatedGlitch): Promise<NotificationResult> {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      return {
        success: false,
        channel: 'sms',
        error: 'Twilio credentials not configured',
        sentAt: new Date().toISOString(),
      };
    }

    if (this.toNumbers.length === 0) {
      return {
        success: false,
        channel: 'sms',
        error: 'No SMS recipients configured',
        sentAt: new Date().toISOString(),
      };
    }

    try {
      const message = this.formatMessage(glitch);
      const results = await Promise.allSettled(
        this.toNumbers.map(number => this.sendSMS(number.trim(), message))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;

      if (successful === 0) {
        throw new Error('All SMS sends failed');
      }

      return {
        success: true,
        channel: 'sms',
        messageId: `${successful}/${this.toNumbers.length} sent`,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        channel: 'sms',
        error: error instanceof Error ? error.message : 'Unknown error',
        sentAt: new Date().toISOString(),
      };
    }
  }

  private async sendSMS(toNumber: string, message: string): Promise<string> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
      },
      body: new URLSearchParams({
        To: toNumber,
        From: this.fromNumber,
        Body: message,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twilio error: ${error.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.sid;
  }

  private formatMessage(glitch: ValidatedGlitch): string {
    const { product, profitMargin } = glitch;
    
    // SMS has 160 char limit, keep it concise
    return `🚨 ${Math.round(profitMargin)}% OFF!
${product.title.substring(0, 50)}
Was: $${(product.originalPrice ?? 0).toFixed(2)}
Now: $${product.price.toFixed(2)}
${product.url.substring(0, 50)}`;
  }
}
