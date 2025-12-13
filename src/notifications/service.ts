import { db } from '../db/index.js';
import { ValidatedGlitch } from '../types/index.js';
// In a real implementation: import { Client } from 'discord.js';

export class NotificationService {
  async notify(glitch: ValidatedGlitch): Promise<void> { 
     // 1. Check user preferences (mocked)
     // 2. Send to Discord/Email/SMS

     const message = {
        title: `Price Glitch: ${glitch.profitMargin}% OFF`,
        body: `Found glitch for product ${glitch.productId}. Confidence: ${glitch.confidence}%`,
        link: `http://localhost:3000/product/${glitch.productId}`,
     };

     // Simulating sending
     console.log(`[Notification] Sending alert for ${glitch.id} via Discord`, message);

     await db.notification.create({
        data: {
          glitchId: glitch.id,
          channel: 'discord',
          message: JSON.stringify(message),
          status: 'sent',
          deliveredAt: new Date(),
        }
     });
  }
}
