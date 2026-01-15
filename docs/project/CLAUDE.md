# CLAUDE.md - priceslash Development Guide

> This document helps Claude Code (and human developers) understand and work with the priceslash codebase effectively.

## Project Overview

**priceslash** is an enterprise-grade pricing error detection and monetization platform. It monitors 100+ retailer websites for pricing anomalies, validates them using AI, and delivers real-time notifications to subscribers through multiple channels.

### Core Value Proposition

Discover pricing errors (decimal mistakes, database glitches, clearance issues) before they're widely known and deliver exclusive early access to paying subscribers.

### Business Model

- **Tiered subscriptions**: Free, Starter ($5/mo), Pro ($15/mo), Elite ($50/mo)
- **Affiliate revenue**: Commission from purchases via tracked links
- **API access**: Enterprise tier for high-volume automated access

---

## Quick Reference

### Essential Commands

```bash
# Development
npm run dev                    # Start Next.js dev server (port 3000)
npm run build                  # Production build
npm run lint                   # ESLint check
npm run start                  # Run production server

# Database
npm run prisma:generate        # Generate Prisma client
npx prisma migrate dev         # Run migrations (development)
npx prisma migrate deploy      # Run migrations (production)
npm run db:seed                # Seed scheduled jobs

# Workers (run in separate terminals)
npm run worker                 # Main scraping orchestrator
npm run worker:validate        # AI validation worker
npm run worker:notify          # Notification delivery worker

# Docker (full stack)
docker compose up --build      # Start all services
docker compose down            # Stop all services
docker compose logs -f app     # Tail app logs
```

### Key File Locations

| Purpose                | Path                                    |
| ---------------------- | --------------------------------------- |
| API routes             | `src/app/api/`                          |
| Database schema        | `prisma/schema.prisma`                  |
| Prisma client          | `src/db/index.ts`                       |
| Environment template   | `.env.example`                          |
| Type definitions       | `src/types/index.ts`                    |
| Notification providers | `src/lib/notifications/providers/`      |
| Scraping logic         | `src/scrapers/` and `src/lib/scraping/` |
| AI validation          | `src/lib/ai/validator.ts`               |
| Price analysis         | `src/lib/analysis/detection.ts`         |

---

## Architecture Overview

### System Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRICESLASH PLATFORM                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐
│  SCRAPING LAYER │   │ ANALYSIS LAYER  │   │    NOTIFICATION LAYER   │
│                 │   │                 │   │                         │
│ • Playwright    │──▶│ • Z-score       │──▶│ • Discord webhooks      │
│ • Firecrawl API │   │ • Decimal error │   │ • Twilio SMS            │
│ • Tavily API    │   │ • AI validation │   │ • Resend email          │
│ • Proxy rotation│   │   (OpenRouter)  │   │ • Facebook Graph API    │
└─────────────────┘   └─────────────────┘   └─────────────────────────┘
         │                    │                         │
         └────────────────────┼─────────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │     DATA PERSISTENCE LAYER     │
              │                                │
              │  PostgreSQL 15 (Prisma ORM)    │
              │  Redis 7 (Streams + Caching)   │
              └───────────────┬───────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
┌────────▼────────┐                     ┌──────────▼─────────┐
│   API LAYER     │                     │   BILLING LAYER    │
│   (Next.js)     │                     │   (Stripe)         │
│                 │                     │                    │
│ • REST API      │                     │ • Subscriptions    │
│ • Auth (Clerk)  │                     │ • Billing portal   │
│ • Webhooks      │                     │ • Usage tracking   │
└─────────────────┘                     └────────────────────┘
```

### Event-Driven Pipeline

The platform uses Redis Streams for asynchronous event processing:

```
1. Scraper → discovers potential anomaly
2. PricingAnomaly record created in PostgreSQL
3. Event published to `price:anomaly:detected` stream
4. Validator worker consumes event, calls AI validation
5. If valid: ValidatedGlitch record created
6. Event published to `price:anomaly:confirmed` stream
7. Notifier worker consumes event, delivers notifications
8. Notification records created with delivery status
```

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   │   ├── health/        # Health check
│   │   ├── detect/        # AI validation trigger
│   │   ├── scrape/        # Scraping trigger
│   │   ├── notify/        # Notification trigger
│   │   ├── checkout/      # Stripe checkout
│   │   ├── cron/          # Scheduled job runner
│   │   ├── billing/       # Billing portal
│   │   └── webhooks/      # Stripe webhooks
│   ├── dashboard/         # User dashboard (protected)
│   └── pricing/           # Public pricing page
├── lib/                   # Core business logic
│   ├── ai/               # AI validation (OpenRouter)
│   ├── analysis/         # Price anomaly detection
│   ├── clients/          # Redis client factory
│   ├── notifications/    # Multi-channel notifications
│   ├── scraping/         # Firecrawl & Tavily wrappers
│   ├── stripe.ts         # Stripe client
│   └── subscription.ts   # Tier access logic
├── db/                   # Database layer
│   └── index.ts          # Prisma client singleton
├── scrapers/             # BullMQ scraping workers
├── workers/              # Stream processing workers
└── types/                # Zod schemas & TypeScript types
```

---

## Technology Stack

### Core Technologies

| Category    | Technology                     | Version           |
| ----------- | ------------------------------ | ----------------- |
| Framework   | Next.js (App Router)           | 14                |
| Language    | TypeScript                     | 5.7 (strict mode) |
| Database    | PostgreSQL                     | 15                |
| ORM         | Prisma (with PrismaPg adapter) | 7                 |
| Cache/Queue | Redis                          | 7                 |
| Task Queue  | BullMQ                         | 5.0               |
| Auth        | Clerk                          | -                 |
| Payments    | Stripe                         | -                 |

### External Services

| Service    | Purpose                    | Env Key Prefix |
| ---------- | -------------------------- | -------------- |
| Clerk      | Authentication             | `CLERK_`       |
| Stripe     | Billing/subscriptions      | `STRIPE_`      |
| Firecrawl  | Web scraping API           | `FIRECRAWL_`   |
| Tavily     | Search/scraping API        | `TAVILY_`      |
| OpenRouter | AI inference (DeepSeek V3) | `OPENROUTER_`  |
| Discord    | Notifications              | `DISCORD_`     |
| Twilio     | SMS notifications          | `TWILIO_`      |
| Resend     | Email delivery             | `RESEND_`      |
| Facebook   | Page posts                 | `FACEBOOK_`    |
| Upstash    | Cloud Redis (optional)     | `UPSTASH_`     |

---

## Database Schema

### Core Models

**User & Subscriptions**

- `User`: Clerk-synced users with Stripe customer IDs
- `Subscription`: Tier tracking (free/starter/pro/elite)
- `UserPreference`: Notification channels, filters, webhooks

**Products & Pricing**

- `Product`: Scraped product data (price, URL, retailer, stock)
- `PriceHistory`: Historical pricing for Z-score calculations
- `PricingAnomaly`: Detected anomalies (pre-validation)
- `ValidatedGlitch`: Confirmed pricing errors (post-AI validation)

**Operations**

- `ScheduledJob`: Cron-like scheduled tasks
- `JobRun`: Job execution history
- `Notification`: Delivery records with status
- `AuditLog`: Action logging for compliance
- `ApiUsage`: Rate limiting by user/endpoint

### Key Database Commands

```bash
# View current schema
npx prisma studio                 # Opens Prisma Studio UI

# Create migration
npx prisma migrate dev --name description_of_change

# Reset database (DESTRUCTIVE)
npx prisma migrate reset

# Push schema changes without migration (dev only)
npx prisma db push
```

---

## Code Conventions

### Import Aliases

Always use the `@/` alias for imports from `src/`:

```typescript
// Good
import { db } from "@/db";
import { PricingAnomalySchema } from "@/types";

// Avoid
import { db } from "../../db";
```

### API Response Format

All API endpoints should return consistent response structures:

```typescript
// Success response
return NextResponse.json({
  success: true,
  data: result,
});

// Error response
return NextResponse.json(
  {
    success: false,
    error: "Description of what went wrong",
  },
  { status: 400 }
);
```

### Error Handling

Use try-catch with detailed logging:

```typescript
try {
  const result = await someOperation();
  return NextResponse.json({ success: true, data: result });
} catch (error) {
  console.error("[endpoint-name] Error:", error);
  return NextResponse.json(
    {
      success: false,
      error: "Operation failed",
    },
    { status: 500 }
  );
}
```

### Unused Variables

Prefix unused variables with `_` (ESLint convention):

```typescript
// Good
const [_unused, used] = someArray;
function handler(_req: Request) { ... }

// Bad - will trigger ESLint error
const [unused, used] = someArray;
```

### Zod Schema Naming

Use `Schema` suffix for Zod schemas:

```typescript
export const PricingAnomalySchema = z.object({ ... });
export const CreateUserSchema = z.object({ ... });
export type PricingAnomaly = z.infer<typeof PricingAnomalySchema>;
```

### Service Classes

Use class-based services for complex business logic:

```typescript
export class NotificationService {
  private providers: Map<string, NotificationProvider>;

  async send(notification: Notification): Promise<Result> { ... }
}
```

---

## Subscription Tiers

### Tier Hierarchy

```
free < starter < pro < elite
```

### Access Control

```typescript
import { hasAccess, SubscriptionTier } from "@/lib/subscription";

// Check if user can access a feature
if (hasAccess(userTier, SubscriptionTier.PRO)) {
  // User has pro tier or higher
}
```

### Tier Features

| Feature            | Free   | Starter       | Pro       | Elite        |
| ------------------ | ------ | ------------- | --------- | ------------ |
| Daily digest       | Weekly | Daily         | Real-time | Priority     |
| Notification delay | 24hr   | 24hr          | <5min     | Instant      |
| Channels           | Email  | Email+Discord | All       | All+Webhooks |
| API access         | -      | -             | -         | 1000 req/day |
| Historical data    | -      | -             | Yes       | Yes          |

---

## Worker System

### Worker Types

1. **Main Worker** (`npm run worker`)
   - Initializes ScrapingOrchestrator
   - Manages BullMQ job queue
   - Spawns Playwright scrapers

2. **Validator Worker** (`npm run worker:validate`)
   - Polls `price:anomaly:detected` Redis stream
   - Calls OpenRouter AI for validation
   - Writes confirmed glitches to database

3. **Notifier Worker** (`npm run worker:notify`)
   - Polls `price:anomaly:confirmed` Redis stream
   - Routes to appropriate notification providers
   - Implements 24-hour deduplication via Redis

### Starting Workers Locally

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: Scraping orchestrator
npm run worker

# Terminal 3: AI validation
npm run worker:validate

# Terminal 4: Notifications
npm run worker:notify
```

### Docker Compose Services

```bash
# Start all services
docker compose up --build

# Start specific service
docker compose up app worker validator notifier

# Scale workers
docker compose up --scale validator=3 --scale notifier=2
```

---

## Testing

### Current State

The project currently relies on:

- TypeScript strict mode for type safety
- Zod schemas for runtime validation
- ESLint for code quality

### Running Checks

```bash
# Lint check
npm run lint

# Type check (via build)
npm run build

# Manual API testing
curl http://localhost:3000/api/health
```

### Recommended Testing Setup (TODO)

For future implementation:

- Jest or Vitest for unit tests
- Supertest for API integration tests
- Playwright Test for E2E tests

---

## Environment Setup

### Required Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database (required)
DATABASE_URL="postgresql://user:pass@localhost:5432/priceslash"

# Authentication (required)
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."

# Payments (required for subscriptions)
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Scraping APIs (at least one required)
FIRECRAWL_API_KEY="fc-..."
TAVILY_API_KEY="tvly-..."

# AI Validation (required for anomaly validation)
OPENROUTER_API_KEY="sk-or-..."

# Redis (required for workers)
REDIS_URL="redis://localhost:6379"

# Notifications (configure as needed)
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
TWILIO_ACCOUNT_SID="AC..."
RESEND_API_KEY="re_..."
```

### Local Development with Docker

```bash
# Start PostgreSQL and Redis only
docker compose up postgres redis -d

# Then run Next.js locally
npm run dev
```

---

## Common Tasks

### Adding a New API Endpoint

1. Create route file: `src/app/api/[endpoint]/route.ts`
2. Implement handler with proper error handling
3. Add Zod schema for request validation
4. Update this documentation if needed

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  name: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = RequestSchema.parse(body);

    // Business logic here

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: error.errors,
        },
        { status: 400 }
      );
    }
    console.error("[example] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
```

### Adding a New Notification Provider

1. Create provider file: `src/lib/notifications/providers/[provider].ts`
2. Implement the notification interface
3. Register in `src/lib/notifications/manager.ts`
4. Add environment variables to `.env.example`

### Adding a New Database Model

1. Update `prisma/schema.prisma`
2. Generate migration: `npx prisma migrate dev --name add_model_name`
3. Generate client: `npm run prisma:generate`
4. Add TypeScript types to `src/types/index.ts`

### Adding a New Scraper Target

1. Add retailer config to `src/scrapers/types.ts`
2. Implement selectors/extraction logic
3. Add to orchestrator's retailer list
4. Test with rate limiting enabled

---

## Deployment

### Docker Production Build

```bash
# Build production images
docker compose -f docker-compose.yml build

# Deploy with env file
docker compose --env-file .env.production up -d
```

### Database Migrations in Production

```bash
# Run migrations
npx prisma migrate deploy

# Or via Docker
docker compose run --rm app npx prisma migrate deploy
```

### Health Checks

- **App health**: `GET /api/health`
- **Database**: Checked via Prisma connection
- **Redis**: Checked via ping command

---

## Troubleshooting

### Common Issues

**Prisma client not found**

```bash
npm run prisma:generate
```

**Database connection failed**

- Check `DATABASE_URL` format
- Ensure PostgreSQL is running
- Check network connectivity

**Redis connection failed**

- Check `REDIS_URL` format
- Ensure Redis is running
- For Upstash, check `UPSTASH_REDIS_REST_URL`

**Worker not processing events**

- Check Redis stream names match
- Verify stream consumer group exists
- Check for errors in worker logs

**Stripe webhook failures**

- Verify `STRIPE_WEBHOOK_SECRET` matches
- Check endpoint URL is publicly accessible
- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### Debugging

```bash
# View Docker logs
docker compose logs -f [service-name]

# Check Redis streams
redis-cli XINFO STREAM price:anomaly:detected

# Check BullMQ jobs
# Use BullMQ Dashboard or Bull Board
```

---

## Security Considerations

### Sensitive Data

- Never commit `.env` files
- Use secrets management in production
- Rotate API keys regularly
- Monitor for leaked credentials

### Rate Limiting

- API endpoints use `ApiUsage` table for tracking
- Scrapers have per-retailer rate limits
- Workers have configurable concurrency

### Authentication

- All dashboard routes protected by Clerk middleware
- Admin endpoints require `ADMIN_SECRET`
- Cron endpoints require `CRON_SECRET`
- Stripe webhooks verified via signature

---

## Performance Notes

### Database Optimization

- Use Prisma's `select` to fetch only needed fields
- Leverage composite indexes on `(retailer, category)` and `(status, detectedAt)`
- Connection pooling configured via PrismaPg adapter

### Caching Strategy

- Redis for frequently accessed data
- 24-hour TTL for deduplication keys
- Price history cached for Z-score calculations

### Worker Scaling

- Increase `SCRAPER_CONCURRENCY` for more parallel scraping
- Scale validator/notifier workers horizontally via Docker
- Adjust `STREAM_BATCH_SIZE` for throughput vs latency

---

## Documentation Links

- [Scraping Engine Architecture](docs/architecture/01-scraping-engine.md)
- [Price Analysis & ML Models](docs/architecture/02-analysis-engine.md)
- [Notification System Design](docs/architecture/03-notification-system.md)
- [API Layer Implementation](docs/architecture/04-api-layer.md)
- [Stripe Integration Guide](docs/architecture/05-subscription-management.md)
- [Frontend Architecture](docs/architecture/06-frontend-apps.md)
- [Admin Dashboard](docs/architecture/07-admin-dashboard.md)
- [Database Schema & Migrations](docs/architecture/08-database-schema.md)

---

## Contributing

1. Create a feature branch from `main`
2. Follow code conventions outlined above
3. Ensure `npm run lint` passes
4. Update documentation for significant changes
5. Submit PR with clear description

---

_Last updated: January 2026_
