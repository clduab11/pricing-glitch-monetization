# Technical Plan: Production Readiness

# Technical Plan: Production Readiness

This document defines the technical architecture and implementation approach for PriceHawk's production launch on Google Cloud Platform.

---

## Architectural Approach

### 1. Deployment Architecture (Hybrid GCP Strategy)

**Decision: Hybrid Cloud Run + Compute Engine**

The system will use a cost-optimized hybrid approach:
- **Cloud Run** for the Next.js application (serverless, auto-scaling, pay-per-use)
- **Compute Engine VM** for worker processes (cost-effective for always-on workloads)
- **Supabase** for PostgreSQL database (generous free tier, external to GCP)
- **Upstash Redis** for queues and streams (serverless, pay-per-request)

**Rationale:**
- Cloud Run is ideal for the web app: handles traffic spikes, zero cost when idle, automatic HTTPS
- Compute Engine VM is cheaper for 24/7 workers than Cloud Run always-on instances (~$15/mo vs ~$50/mo)
- Supabase free tier provides 500MB database, automatic backups, and can scale later
- Upstash free tier covers small launch needs, pay-per-request scales naturally

**Trade-offs:**
- ✅ **Pro**: Lowest cost for small launch ($15-30/mo total infrastructure)
- ✅ **Pro**: Simple deployment (Cloud Run auto-deploys, VM runs docker-compose)
- ✅ **Pro**: Can scale each component independently
- ⚠️ **Con**: VM requires manual management (updates, monitoring)
- ⚠️ **Con**: External services (Supabase, Upstash) add network latency vs GCP-native

**Constraints:**
- Must fit within limited budget (~$50/mo infrastructure)
- Solo operator cannot manage complex Kubernetes
- Must support 10-50 users initially with clear scaling path

```mermaid
graph TD
    Users[Users] --> CloudRun[Cloud Run: Next.js App]
    CloudRun --> Supabase[(Supabase PostgreSQL)]
    CloudRun --> Upstash[(Upstash Redis)]
    
    GCE[Compute Engine VM] --> Workers[Docker Compose: Workers]
    Workers --> Scraper[Scraper Worker]
    Workers --> Validator[Validator Worker]
    Workers --> Notifier[Notifier Worker]
    
    Scraper --> Upstash
    Validator --> Upstash
    Notifier --> Upstash
    
    Scraper --> Supabase
    Validator --> Supabase
    Notifier --> Supabase
    
    Prometheus[Prometheus on VM] --> GrafanaCloud[Grafana Cloud]
    CloudRun -.metrics.-> Prometheus
    Workers -.metrics.-> Prometheus
    
    Prometheus --> Email[Email Alerts]
```

### 2. AI Validation Architecture

**Decision: Switch to Google Gemini with DeepSeek Fallback**

Replace OpenRouter/DeepSeek with Google AI Studio's Gemini models as primary, keeping DeepSeek as fallback.

**Rationale:**
- Leverage existing Google AI Studio Ultra membership (cost savings)
- Gemini 2.0 Flash is faster and cheaper than DeepSeek for similar quality
- Gemini Pro available for complex cases requiring deeper reasoning
- Keep DeepSeek fallback for redundancy if Gemini has issues

**Implementation:**
- Primary: Gemini 2.0 Flash via Google AI Studio API
- Fallback: DeepSeek via OpenRouter (existing code)
- Fallback trigger: Gemini API errors, rate limits, or timeouts

**Trade-offs:**
- ✅ **Pro**: Cost savings from included AI Studio quota
- ✅ **Pro**: Faster response times (Gemini Flash optimized for speed)
- ✅ **Pro**: Better integration with GCP ecosystem
- ⚠️ **Con**: Requires code changes to validation logic
- ⚠️ **Con**: Dependency on Google AI Studio availability

### 3. Monitoring & Observability Architecture

**Decision: Grafana Cloud + Self-Hosted Prometheus + Pushgateway + GCP Cloud Logging**

Hybrid monitoring approach balancing cost and capability:
- **Prometheus** (self-hosted on Compute Engine VM) for metrics collection
- **Prometheus Pushgateway** (on VM) for receiving metrics from Cloud Run app
- **Grafana Cloud** (free tier) for visualization and dashboards
- **GCP Cloud Logging** for structured application logs
- **Prometheus Alertmanager** for email alerts via SendGrid/Resend
- **Grafana Cloud health monitoring** for Prometheus availability

**Rationale:**
- Grafana Cloud free tier: 10K metrics, 50GB logs, 14-day retention (sufficient for small launch)
- Self-hosted Prometheus on existing VM: no additional cost
- Pushgateway solves Cloud Run metrics collection (serverless instances push instead of being scraped)
- GCP Cloud Logging: integrated, searchable, pay-per-use
- Email alerts: reliable, solo operator checks email regularly
- Grafana Cloud monitors Prometheus health (alerts if data stops flowing)

**Metrics to Track:**
- Scraping: success rate, duration, products scraped, errors by retailer
- Detection: anomalies detected, validation rate, false positive rate
- Notifications: delivery rate by channel, latency by tier, failures
- System: API response times, database query performance, worker queue depth
- Business: active subscriptions, deals detected per hour, user engagement

**Alert Thresholds:**
- Critical: Error rate > 5%, health check failures, worker crashes, database connection failures
- Warning: Scraping success < 80%, notification delivery < 90%, queue backlog > 100 jobs

**Trade-offs:**
- ✅ **Pro**: Free tier covers small launch needs
- ✅ **Pro**: Professional dashboards without self-hosting Grafana
- ✅ **Pro**: Email alerts are reliable and actionable
- ✅ **Pro**: Grafana Cloud monitors Prometheus (solves "who watches the watchers")
- ✅ **Pro**: Pushgateway enables metrics from serverless Cloud Run
- ⚠️ **Con**: Multiple systems to configure (Prometheus, Pushgateway, Grafana, Alertmanager)
- ⚠️ **Con**: Push model requires app to actively send metrics (vs passive scraping)

### 4. Scraping Improvements (Balanced Approach)

**Decision: Incremental improvements across all four areas**

Given 2-3 week timeline and balanced priority, address each area moderately:

**A. Accuracy Improvements (30% effort)**
- Add fallback selectors for each retailer (primary + 2 fallbacks)
- Implement data validation before saving (price > 0, title not empty, valid URL)
- Add retry logic for failed extractions with different strategies
- Log extraction failures with page snapshots for debugging

**B. Anti-Bot Resilience (30% effort)**
- Implement exponential backoff for rate-limited requests
- Add user-agent rotation (pool of 10+ realistic user agents)
- Introduce random delays between requests (2-5 seconds)
- Implement circuit breaker pattern for blocked retailers (pause for 15 minutes)
- Add request header randomization (Accept-Language, Accept-Encoding)

**C. Performance Optimization (20% effort)**
- Enable parallel scraping (5 concurrent jobs instead of sequential)
- Implement product URL deduplication (skip recently scraped products)
- Add caching for static retailer metadata (selectors, rate limits)
- Optimize database queries (batch inserts, connection pooling)

**D. Coverage Expansion (20% effort)**
- Add 3 new high-value retailers (Walmart, Target, Best Buy already configured)
- Suggested additions: Home Depot, Lowe's, Newegg (electronics/home improvement focus)
- Use Jina strategy for new retailers (faster to configure than Playwright)

**Rationale:**
- Balanced approach ensures no single area is neglected
- Accuracy and anti-bot are highest priority (60% combined) for reliability
- Performance and coverage are important but can be iterated post-launch
- All improvements are incremental, not architectural rewrites

**Trade-offs:**
- ✅ **Pro**: Addresses all pain points from Epic Brief
- ✅ **Pro**: Achievable in 2-3 week timeline
- ✅ **Pro**: Each improvement is independently valuable
- ⚠️ **Con**: No single area gets deep optimization
- ⚠️ **Con**: May need post-launch iteration for specific issues

### 5. Error Handling & Resilience

**Decision: Comprehensive retry and circuit breaker patterns**

Implement production-grade error handling across all external dependencies:

**Retry Strategy:**
- **Scraping**: 3 retries with exponential backoff (1s, 2s, 4s)
- **AI Validation**: 2 retries with 5s delay, then fallback to rule-based
- **Notifications**: 3 retries with exponential backoff, then DLQ
- **Database**: 2 retries with 1s delay, then alert
- **External APIs** (Stripe, Clerk): 2 retries with 2s delay

**Circuit Breaker Pattern:**
- Track failure rate per external service (5-minute window)
- Open circuit if failure rate > 50% (stop calling service)
- Half-open after 15 minutes (try one request)
- Close circuit if request succeeds (resume normal operation)

**Graceful Degradation:**
- AI validation failure → use rule-based fallback
- Notification channel failure → try alternative channels
- Scraping failure → log and continue with other retailers
- Database connection failure → retry with exponential backoff, alert operator

**Rationale:**
- Prevents cascading failures from external service issues
- Reduces unnecessary load on failing services
- Provides clear operational visibility into system health
- Maintains partial functionality during outages

**Trade-offs:**
- ✅ **Pro**: System remains operational during partial failures
- ✅ **Pro**: Reduces alert noise from transient errors
- ✅ **Pro**: Protects external services from overload
- ⚠️ **Con**: Adds complexity to error handling logic
- ⚠️ **Con**: Circuit breaker state needs monitoring

### 6. Structured Logging Architecture

**Decision: Correlation IDs + Structured JSON Logging**

Implement comprehensive logging for debugging and monitoring:

**Log Structure:**
```typescript
{
  timestamp: "2026-01-16T10:30:00Z",
  level: "info" | "warn" | "error",
  correlationId: "uuid",
  component: "scraper" | "validator" | "notifier" | "api",
  message: "Human-readable message",
  context: {
    retailer?: string,
    productId?: string,
    userId?: string,
    anomalyId?: string,
    // ... relevant context
  },
  error?: {
    message: string,
    stack: string,
    code?: string
  }
}
```

**Correlation ID Flow:**
- Generate UUID at request entry point (API, cron job, worker job)
- Pass through entire pipeline via Redis message payloads:
  - Scraping job: `{ retailer, url, correlationId }`
  - Anomaly stream: `{ anomalyId, data, correlationId }`
  - Notification queue: `{ glitchId, data, correlationId }`
- Include in all logs, metrics, and error reports
- Enables tracing single deal through entire system

**Log Levels:**
- **ERROR**: Failures requiring operator attention
- **WARN**: Degraded functionality, retries, fallbacks
- **INFO**: Normal operations, job completions, state changes
- **DEBUG**: Detailed execution flow (disabled in production)

**Rationale:**
- Correlation IDs enable end-to-end request tracing
- Structured JSON logs are searchable in GCP Cloud Logging
- Consistent format simplifies log analysis and alerting
- Context fields provide debugging information without verbose messages

**Trade-offs:**
- ✅ **Pro**: Dramatically improves debugging capability
- ✅ **Pro**: Enables automated log analysis and alerting
- ✅ **Pro**: Correlation IDs trace requests across services
- ⚠️ **Con**: Requires updating all logging statements
- ⚠️ **Con**: Slightly higher log storage costs

### 7. CI/CD & Deployment Pipeline

**Decision: GitHub Actions → GCR → Cloud Run + VM**

Automated deployment pipeline with smoke tests:

**Pipeline Stages:**
1. **Build** (GitHub Actions)
   - Lint, type-check, unit tests
   - Build Docker images (app, workers)
   - Push to Google Container Registry (GCR)

2. **Database Migration** (GitHub Actions)
   - Run `prisma migrate deploy` against Supabase
   - Verify migration success before proceeding

3. **Deploy App** (GitHub Actions)
   - Deploy new image to Cloud Run
   - Wait for deployment to stabilize (30s)

4. **Deploy Workers** (Automated via SSH)
   - GitHub Actions uses SSH action to connect to VM
   - Pull new images from GCR: `docker-compose pull`
   - Restart services: `docker-compose up -d`
   - Verify workers started successfully

5. **Smoke Tests** (GitHub Actions)
   - Health check: `/api/health` returns 200
   - Auth check: Clerk session creation works
   - Database check: Can query Supabase
   - Stripe check: Can create checkout session
   - Worker check: Jobs are processing (check Redis queue)

6. **Monitoring** (GitHub Actions)
   - Monitor health endpoint for 5 minutes
   - Check error rates in logs
   - Verify no alert spikes
   - Mark deployment successful or trigger rollback

**Rollback Strategy:**
- Git revert problematic commit
- Push to main branch
- CI/CD automatically deploys reverted version
- Target: < 10 minute rollback time

**Rationale:**
- GitHub Actions is free for public repos, integrated with code
- GCR provides reliable Docker image storage
- Cloud Run auto-deploys from GCR (zero-downtime)
- VM deployment is manual initially (automate later if needed)
- Smoke tests catch critical issues before users affected

**Trade-offs:**
- ✅ **Pro**: Fully automated for both app and workers
- ✅ **Pro**: Smoke tests provide deployment confidence
- ✅ **Pro**: Rollback is simple and fast (< 10 minutes)
- ✅ **Pro**: Version consistency between app and workers
- ⚠️ **Con**: Requires SSH key management in GitHub Secrets
- ⚠️ **Con**: Smoke tests add 5-10 minutes to deployment time

### 8. Testing Strategy

**Decision: Focus on critical path integration tests**

Given limited time and solo operator context, prioritize high-value tests:

**Test Coverage Priorities:**
1. **Critical Path Integration Tests** (Must Have)
   - User signup → subscription → first notification (end-to-end)
   - Scraping → anomaly detection → AI validation → notification (pipeline)
   - Stripe webhook → subscription update → database (payment flow)

2. **Unit Tests for Core Logic** (Should Have)
   - Anomaly detection algorithm (z-score, discount calculation)
   - AI validation fallback logic
   - Notification filtering and scheduling
   - Retry and circuit breaker logic

3. **Smoke Tests** (Must Have)
   - Health checks for all services
   - Database connectivity
   - External API availability (Stripe, Clerk, Gemini)
   - Worker job processing

4. **E2E Tests** (Nice to Have - Post Launch)
   - Full user journey with real browser
   - Multi-channel notification delivery
   - Subscription lifecycle (upgrade, downgrade, cancel)

**Test Infrastructure:**
- Vitest for unit tests (already configured)
- Playwright for integration tests (already available)
- GitHub Actions for CI test execution
- Separate test database (Supabase project or local PostgreSQL)

**Rationale:**
- Critical path tests catch most impactful bugs
- Unit tests for complex logic prevent regressions
- Smoke tests provide deployment confidence
- E2E tests are valuable but time-intensive (defer to post-launch)

**Trade-offs:**
- ✅ **Pro**: Achievable in 2-3 week timeline
- ✅ **Pro**: Covers highest-risk areas
- ✅ **Pro**: Provides confidence for production launch
- ⚠️ **Con**: Not comprehensive coverage (60-70% vs 90%+)
- ⚠️ **Con**: Some edge cases may slip through

---

## Data Model

### 1. Existing Schema Assessment

The current Prisma schema (file:prisma/schema.prisma) is well-designed for production:
- Proper indexes on frequently queried fields
- Relationships correctly defined with cascade deletes
- Audit logging and API usage tracking in place
- Subscription and user preference models complete

**No major schema changes required for production readiness.**

**Connection Pooling Configuration:**

For Cloud Run serverless deployment, configure Prisma to use Supabase's built-in PgBouncer:

```typescript
// Update DATABASE_URL to use connection pooler
DATABASE_URL="postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

// Prisma client configuration
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL") // For migrations
}
```

This prevents "too many connections" errors from Cloud Run's auto-scaling.

### 2. Minor Schema Enhancements

**A. Add Deployment Tracking Table**

Track deployments for rollback and debugging:

```prisma
model Deployment {
  id            String    @id @default(uuid())
  version       String    // Git commit SHA or tag
  deployedBy    String    // GitHub Actions or operator name
  deployedAt    DateTime  @default(now())
  environment   String    // "production" | "staging"
  status        String    // "success" | "failed" | "rolled_back"
  smokeTestResults Json?  // Results of smoke tests
  rollbackReason String?  // If rolled back, why
  
  @@index([deployedAt])
  @@index([environment, status])
  @@map("deployments")
}
```

**B. Add System Health Metrics Table**

Store periodic health snapshots for trend analysis:

```prisma
model HealthSnapshot {
  id                String   @id @default(uuid())
  timestamp         DateTime @default(now())
  scrapingSuccessRate Decimal @db.Decimal(5, 2)
  anomalyDetectionRate Decimal @db.Decimal(5, 2)
  notificationDeliveryRate Decimal @db.Decimal(5, 2)
  avgApiResponseTime Int     // milliseconds
  activeWorkers     Int
  queueDepth        Int
  errorCount        Int
  
  @@index([timestamp])
  @@map("health_snapshots")
}
```

**C. Enhance PricingAnomaly with Retry Tracking**

Add fields to track validation retries:

```prisma
model PricingAnomaly {
  // ... existing fields ...
  
  validationAttempts Int      @default(0) @map("validation_attempts")
  lastValidationError String? @map("last_validation_error")
  
  // ... existing relations ...
}
```

**D. Add Circuit Breaker State Table**

Track circuit breaker state for external services (non-database services only):

```prisma
model CircuitBreakerState {
  id            String   @id @default(uuid())
  serviceName   String   @unique // "gemini", "stripe", "clerk", "retailer:amazon" (NOT "database")
  state         String   // "closed" | "open" | "half_open"
  failureCount  Int      @default(0)
  lastFailureAt DateTime?
  openedAt      DateTime?
  nextRetryAt   DateTime?
  updatedAt     DateTime @updatedAt
  
  @@index([serviceName, state])
  @@map("circuit_breaker_states")
}
```

**Hybrid Storage Strategy:**
- **Database circuit breaker**: State stored in Redis (key: `circuit:database`, value: JSON)
- **Other services**: State stored in database table (Gemini, Stripe, Clerk, retailers)
- **Rationale**: Avoids circular dependency—database circuit breaker works even when database is down

### 3. Data Migration Strategy

**Approach: Additive migrations only**

- All new tables are additions (no breaking changes)
- Existing data remains untouched
- Migrations can be applied without downtime
- Rollback is safe (new tables simply unused)

**Migration Steps:**
1. Create migration: `npx prisma migrate dev --name add_production_tables`
2. Review generated SQL
3. Test migration on staging database
4. Apply to production: `npx prisma migrate deploy`
5. Verify tables created successfully

### 4. Data Retention Policy

**Strategy: Minimal retention for small launch, expand later**

- **Products & Price History**: Keep all (core value)
- **Anomalies & Validated Glitches**: Keep all (historical analysis)
- **Notifications**: Keep 30 days (debugging)
- **Audit Logs**: Keep 90 days (compliance)
- **Job Runs**: Keep 30 days (operational history)
- **Health Snapshots**: Keep 30 days (trend analysis)

**Cleanup Jobs:**
- Daily cron job deletes old records based on retention policy
- Implemented in existing cleanup job (file:src/app/api/cron/route.ts)

---

## Component Architecture

### 1. Scraping Engine Enhancements

**Current Architecture:**
- Orchestrator (file:src/scrapers/orchestrator.ts) manages BullMQ queue
- Workers (Playwright, Jina) execute scraping jobs
- Proxy manager and rate limiter handle anti-bot measures

**Enhancements:**

**A. Fallback Selector System**

Add resilient selector matching:

```typescript
interface SelectorConfig {
  primary: string;
  fallbacks: string[];
  validator?: (element: Element) => boolean;
}

// Example usage
const priceSelector: SelectorConfig = {
  primary: '.a-price .a-offscreen',
  fallbacks: [
    '.a-price-whole',
    '[data-a-color="price"] .a-offscreen',
    '.priceToPay .a-offscreen'
  ],
  validator: (el) => /^\$?\d+\.?\d*$/.test(el.textContent)
};
```

**B. Circuit Breaker Integration**

Wrap scraping calls with circuit breaker:

```typescript
class ScraperCircuitBreaker {
  async scrapeWithCircuitBreaker(retailer: string, scrapeFn: () => Promise<ProductData[]>) {
    const state = await getCircuitBreakerState(retailer);
    
    if (state === 'open') {
      throw new Error(`Circuit breaker open for ${retailer}`);
    }
    
    try {
      const result = await scrapeFn();
      await recordSuccess(retailer);
      return result;
    } catch (error) {
      await recordFailure(retailer);
      throw error;
    }
  }
}
```

**C. Performance Optimizations**

- Parallel job processing (increase concurrency from 5 to 10)
- Product URL deduplication (skip if scraped in last 15 minutes)
- Batch database inserts (insert 50 products at once instead of one-by-one)

**Integration Points:**
- Orchestrator creates jobs in BullMQ queue
- Workers pull jobs and execute with circuit breaker protection
- Results saved to database with batch inserts
- Metrics emitted to Prometheus for monitoring

### 2. AI Validation Service Refactoring

**Current Architecture:**
- Single validation function (file:src/lib/ai/validator.ts)
- OpenRouter/DeepSeek API calls
- Fallback to rule-based validation

**Enhancements:**

**A. Multi-Provider Validation Strategy**

```typescript
interface AIProvider {
  name: string;
  validate(anomaly: PricingAnomaly): Promise<ValidationResult>;
  isAvailable(): Promise<boolean>;
}

class GeminiProvider implements AIProvider {
  name = 'gemini';
  async validate(anomaly: PricingAnomaly): Promise<ValidationResult> {
    // Call Google AI Studio Gemini API
  }
}

class DeepSeekProvider implements AIProvider {
  name = 'deepseek';
  async validate(anomaly: PricingAnomaly): Promise<ValidationResult> {
    // Call OpenRouter DeepSeek API
  }
}

class ValidationService {
  private providers: AIProvider[] = [
    new GeminiProvider(),
    new DeepSeekProvider()
  ];
  
  async validate(anomaly: PricingAnomaly): Promise<ValidationResult> {
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) {
          return await provider.validate(anomaly);
        }
      } catch (error) {
        console.warn(`Provider ${provider.name} failed, trying next`);
      }
    }
    
    // Final fallback to rule-based
    return fallbackValidation(anomaly);
  }
}
```

**B. Retry Logic with Exponential Backoff**

```typescript
async function validateWithRetry(anomaly: PricingAnomaly, maxRetries = 2): Promise<ValidationResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await validationService.validate(anomaly);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await sleep(delay);
    }
  }
}
```

**Integration Points:**
- Anomaly validator worker (file:src/workers/anomaly-validator.ts) calls validation service
- Validation service tries Gemini first, then DeepSeek, then rule-based
- Results saved to database and published to Redis stream
- Metrics track success rate by provider

### 3. Monitoring & Metrics Collection

**Current Architecture:**
- Basic metrics service (file:src/lib/monitoring/metrics.ts) stores counts in Redis
- Alert service (file:src/lib/monitoring/alerts.ts) sends Discord webhooks

**Enhancements:**

**A. Prometheus Metrics Push Integration**

Push metrics from Cloud Run to Prometheus Pushgateway:

```typescript
// Push metrics to Pushgateway (not scraped)
import { Pushgateway } from 'prom-client';

const pushgateway = new Pushgateway(
  process.env.PUSHGATEWAY_URL || 'http://vm-ip:9091'
);

// Push metrics every 60 seconds
setInterval(() => {
  pushgateway.pushAdd({ jobName: 'pricehawk-app' });
}, 60000);

// Also expose /api/internal/metrics for manual inspection

# HELP scraping_success_total Total successful scraping jobs
# TYPE scraping_success_total counter
scraping_success_total{retailer="amazon"} 150
scraping_success_total{retailer="walmart"} 120

# HELP anomaly_detection_rate Anomaly detection rate
# TYPE anomaly_detection_rate gauge
anomaly_detection_rate 0.15

# HELP notification_delivery_duration_seconds Notification delivery duration
# TYPE notification_delivery_duration_seconds histogram
notification_delivery_duration_seconds_bucket{channel="email",le="1"} 45
notification_delivery_duration_seconds_bucket{channel="email",le="5"} 98
```

**B. Structured Logging Middleware**

Add correlation ID middleware for Next.js API routes:

```typescript
export function withCorrelationId(handler: NextApiHandler): NextApiHandler {
  return async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    
    return handler(req, res);
  };
}
```

**C. Email Alert Integration**

Replace Discord-only alerts with multi-channel alerting:

```typescript
class AlertService {
  async sendAlert(alert: Alert) {
    // Send to Discord (existing)
    await this.sendDiscordAlert(alert);
    
    // Send email via Resend
    if (alert.severity === 'critical') {
      await this.sendEmailAlert(alert);
    }
    
    // Log to GCP Cloud Logging
    await this.logAlert(alert);
  }
}
```

**Integration Points:**
- Cloud Run app pushes metrics to Prometheus Pushgateway on VM
- Workers emit metrics directly to Prometheus (same VM, can scrape)
- Prometheus scrapes Pushgateway and worker endpoints every 60 seconds
- Grafana Cloud visualizes metrics from Prometheus
- Grafana Cloud monitors Prometheus health (alerts if data stops)
- Alertmanager evaluates rules and sends email alerts
- GCP Cloud Logging stores structured logs

### 4. Deployment & Health Check System

**Current Architecture:**
- Basic health check endpoint (file:src/app/api/health/route.ts)
- GitHub Actions CI/CD (file:.github/workflows/ci.yml, file:.github/workflows/release.yml)

**Enhancements:**

**A. Comprehensive Health Checks**

Expand health endpoint to check all dependencies:

```typescript
GET /api/health (Public)

Response:
{
  status: "healthy" | "degraded" | "unhealthy",
  timestamp: "2026-01-16T10:30:00Z",
  version: "1.2.3",
  checks: {
    database: { status: "healthy", latency: 15 },
    redis: { status: "healthy", latency: 5 }
  }
}

GET /api/internal/status (Authenticated with ADMIN_SECRET)

Response:
{
  status: "healthy" | "degraded" | "unhealthy",
  timestamp: "2026-01-16T10:30:00Z",
  version: "1.2.3",
  checks: {
    database: { status: "healthy", latency: 15 },
    redis: { status: "healthy", latency: 5 },
    gemini: { status: "healthy", latency: 200 },
    stripe: { status: "healthy", latency: 150 },
    workers: {
      scraper: { status: "healthy", queueDepth: 5, lastHeartbeat: "2026-01-16T10:29:45Z" },
      validator: { status: "healthy", queueDepth: 2, lastHeartbeat: "2026-01-16T10:29:50Z" },
      notifier: { status: "healthy", queueDepth: 0, lastHeartbeat: "2026-01-16T10:29:55Z" }
    },
    circuitBreakers: {
      gemini: "closed",
      stripe: "closed",
      "retailer:amazon": "closed"
    }
  }
}
```

**Rationale:**
- Public `/api/health` for load balancers and uptime monitors (minimal info)
- Authenticated `/api/internal/status` for smoke tests and operator debugging (detailed info)
- Worker health tracked via heartbeat metrics in Redis

**B. Smoke Test Suite**

Add automated smoke tests in GitHub Actions:

```typescript
// tests/smoke/critical-path.test.ts
describe('Critical Path Smoke Tests', () => {
  test('Health check returns 200', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);
  });
  
  test('Can create Stripe checkout session', async () => {
    const response = await fetch(`${BASE_URL}/api/checkout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TEST_TOKEN}` },
      body: JSON.stringify({ tier: 'pro', billingCycle: 'annual' })
    });
    expect(response.status).toBe(200);
  });
  
  test('Internal status check (workers, queues)', async () => {
    const response = await fetch(`${BASE_URL}/api/internal/status`, {
      headers: { 'Authorization': `Bearer ${ADMIN_SECRET}` }
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workers.scraper.healthy).toBe(true);
    expect(data.queues.depth).toBeLessThan(100);
  });
});

// New endpoint: /api/internal/status
// Returns worker health, queue depths, circuit breaker states
// Protected by ADMIN_SECRET for security
```

**C. Deployment Tracking**

Log deployments to database for audit trail:

```typescript
async function recordDeployment(version: string, status: string, smokeTestResults: any) {
  await db.deployment.create({
    data: {
      version,
      deployedBy: 'github-actions',
      environment: 'production',
      status,
      smokeTestResults
    }
  });
}
```

**Integration Points:**
- GitHub Actions runs smoke tests after deployment
- Health endpoint checked every 60 seconds by Prometheus
- Deployment records stored in database for history
- Failed deployments trigger rollback automatically

### 5. Worker Process Management

**Current Architecture:**
- Separate worker files (file:src/workers/anomaly-validator.ts, file:src/workers/notification-sender.ts)
- Each worker runs as independent process
- BullMQ and Redis Streams for job distribution

**Enhancements:**

**A. Unified Worker Orchestration**

Create single entry point for all workers on Compute Engine VM:

```yaml
# docker-compose.yml on VM
version: '3.8'

services:
  scraper-worker:
    image: gcr.io/PROJECT_ID/pricehawk-worker:latest
    command: npm run worker:scraper
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - WORKER_TYPE=scraper
    restart: always
    
  validator-worker:
    image: gcr.io/PROJECT_ID/pricehawk-worker:latest
    command: npm run worker:validator
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - WORKER_TYPE=validator
    restart: always
    
  notifier-worker:
    image: gcr.io/PROJECT_ID/pricehawk-worker:latest
    command: npm run worker:notifier
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - WORKER_TYPE=notifier
    restart: always
    
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: always
  
  pushgateway:
    image: prom/pushgateway:latest
    ports:
      - "9091:9091"
    restart: always

volumes:
  prometheus_data:
```

**Deployment Automation:**
- GitHub Actions uses SSH action to connect to VM after pushing images to GCR
- Runs: `docker-compose pull && docker-compose up -d`
- Ensures app and workers deploy in sync (version consistency)

**B. Graceful Shutdown Handling**

Add signal handlers to workers with BullMQ job locking:

```typescript
// BullMQ configuration with job locking
const worker = new Worker('queue-name', processorFn, {
  connection: redisConnection,
  lockDuration: 30000, // 30 seconds
  lockRenewTime: 15000, // Renew every 15 seconds
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await worker.close(); // Finish current jobs (BullMQ handles locking)
  await db.$disconnect();
  await redis.quit();
  process.exit(0);
});
```

**Job Protection:**
- BullMQ automatically locks jobs during processing
- If worker crashes, job lock expires and job is retried
- Graceful shutdown waits for current jobs to complete
- No job loss during deployments
```

**C. Worker Health Monitoring**

Each worker exposes health metrics:

```typescript
// Worker health check
setInterval(async () => {
  await metrics.increment('worker.heartbeat', { type: WORKER_TYPE });
  await metrics.gauge('worker.queue_depth', await getQueueDepth());
}, 60000); // Every minute
```

**Integration Points:**
- Docker Compose manages worker lifecycle on VM
- Workers pull jobs from BullMQ queues and Redis streams
- Prometheus scrapes worker metrics
- Graceful shutdown prevents job loss during deployments

---

## Implementation Phases

Given the 2-3 week timeline, work is organized into two sprints:

### Sprint 1 (Week 1): Core Infrastructure

1. **GCP Setup** (2 days)
   - Create GCP project, enable APIs
   - Set up Cloud Run service
   - Provision Compute Engine VM
   - Configure Supabase and Upstash

2. **Scraping Improvements** (3 days)
   - Implement fallback selectors
   - Add circuit breaker pattern
   - Optimize performance (parallel, batching)
   - Add 2-3 new retailers

3. **AI Validation Refactoring** (2 days)
   - Integrate Google Gemini API
   - Implement provider fallback logic
   - Add retry with exponential backoff

### Sprint 2 (Week 2): Monitoring & Hardening

4. **Monitoring Setup** (3 days)
   - Deploy Prometheus on VM
   - Configure Grafana Cloud dashboards
   - Set up email alerting
   - Implement structured logging

5. **Testing & CI/CD** (2 days)
   - Write critical path integration tests
   - Add smoke test suite
   - Configure GitHub Actions deployment
   - Test rollback procedure

6. **Documentation & Launch Prep** (2 days)
   - Write operational runbooks
   - Document deployment procedures
   - Create troubleshooting guides
   - Final production validation

---

## Success Metrics

**Technical Metrics:**
- Deployment success rate: 100%
- Smoke test pass rate: 100%
- Scraping accuracy: 95%+
- AI validation latency: < 5 seconds
- Notification delivery rate: 95%+
- System uptime: 99%+

**Operational Metrics:**
- Mean time to deployment: < 15 minutes
- Mean time to rollback: < 10 minutes
- Mean time to resolution (critical): < 30 minutes
- Alert false positive rate: < 5%

**Cost Metrics:**
- Infrastructure cost: < $50/month
- AI API cost: < $20/month
- Total operational cost: < $100/month
