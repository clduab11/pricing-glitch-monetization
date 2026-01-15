# Pricehawk Session Handover

## 📋 Project Context

**Pricehawk** is a SaaS platform for monitoring price glitches and alerting users via multiple channels. We have just completed the **Social Media Expansion** phase.

## ✅ Completed in Last Session

1.  **Chart Generator**: `src/lib/services/chart-generator.ts` (using `sharp`) creates price history charts.
2.  **Twitter/X**: `src/workers/social-poster.ts` posts top deals with charts to Twitter using OAuth2.
3.  **Telegram**: `src/workers/telegram-bot.ts` runs a bot for commands (`/deals`) and alerts.
4.  **Beehiiv**: `src/workers/newsletter-digest.ts` compiles daily deal digests.
5.  **WhatsApp**: `src/lib/services/whatsapp-scheduler.ts` manages rate-limited alerts.
6.  **Infrastructure**: Updated `schema.prisma` (SocialPost, NewsletterIssue) and `package.json` (telegraf, sharp, twitter-api-v2).

## 🛠️ Current State

- **Build Status**: Passing (`npm run build` succeeds).
- **Database**: Migrations applied (`add_social_and_newsletter`).
- **Environment**: `.env.example` updated with new required keys.

## 🎯 Next Objectives (Gemini 3 Pro)

The immediate focus should be **Content Quality**, **Affiliate Logic**, and **Deployment Verification**.

### Priority Tasks

1.  **Affiliate Link Tracking**:
    - Implement the logic to wrap product URLs with affiliate tags (Amazon, BestBuy, etc.) in `src/lib/services/affiliate.ts`.
    - Ensure `social-poster.ts` and `telegram-bot.ts` use these wrapped links.

2.  **Deal Expiration**:
    - Implement a mechanism to detect when a deal is dead (price returned to normal or OOS) and update the DB/delete social posts if necessary.

3.  **End-to-End Testing**:
    - Run the system with **REAL** API keys (User must provide them in `.env.local`).
    - Verify that the `social-poster` actually posts to a test Twitter account.
    - Verify that the Telegram bot responds to commands.

4.  **Deployment Prep**:
    - Create a `Dockerfile` or `process.yml` (for PM2) to run the multiple worker processes (`worker.ts`, `telegram-bot.ts`, `social-poster.ts`) efficiently in production.

## 📝 Prompt for Next Session

Copy the following into your next chat:

> **Role**: You are a Senior DevOps & Full Stack Engineer working on Pricehawk.
>
> **Context**: We have just finished implementing the Social Media implementation (Twitter, Telegram, WhatsApp, Beehiiv) and the Chart Generation service. The code builds and migrations are applied.
>
> **Goal**: Focus on **Monetization & Reliability**.
>
> 1. **Affiliate Integration**: Create a service to inject affiliate tags into outgoing URLs (Amazon, Target, BestBuy).
> 2. **Deal Lifecycle**: Implement logic to expire deals and update their status in the DB/cleanup social posts.
> 3. **Production Readiness**: Create a robust startup script or Docker Compose setup that runs all the new workers (`social-poster`, `telegram-bot`, `newsletter-digest`) alongside the main app.
>
> Please review `LAUNCH_CHECKLIST.md` for the "Content Quality" section and begin.
