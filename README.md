# Pricehawk 🦅

## **The Enterprise-Grade Pricing Error Detection Platform**

> **Catch retail pricing glitches before they go viral. Validate with AI. Profit instantly.**

[![License: ELv2](https://img.shields.io/badge/License-ELv2%20%2B%20Commercial-blue)](LICENSE)
![Status: Production](https://img.shields.io/badge/Status-Production_Ready-success)
![Stack](https://img.shields.io/badge/Stack-Next.js_14_%7C_Prisma_%7C_Redis-black)
![AI](https://img.shields.io/badge/AI-DeepSeek_V3-purple)

---

## 📉 The Opportunity

In the complex world of algorithmic pricing, retailers make mistakes every single day. Decimal errors, coupon stacking glitches, and currency conversion mishaps create instant arbitrage opportunities.

**The problem?** By the time you see a deal on social media, it's already dead.
**The solution?** Pricehawk.

| Category        | Typical Price | Glitch Price | Potential Profit |
| --------------- | ------------- | ------------ | ---------------- |
| 📺 **OLED TVs** | $2,499        | **$249.99**  | `$2,250`         |
| 💻 **Laptops**  | $1,200        | **$120.00**  | `$1,080`         |
| 🎧 **Audio**    | $350          | **$35.00**   | `$315`           |
| 🏠 **Home**     | $600          | **$60.00**   | `$540`           |

> _Pricehawk monitors 100+ retailers 24/7, detecting anomalies in seconds and delivering them to you before the public finds out._

---

## ⚡ How It Works

Pricehawk combines distributed web scraping with Generative AI to filter out "fake" sales and identify **true pricing errors**.

```mermaid
graph LR
    subgraph Detection ["👁️ Detection Layer"]
        A[Scraper Engine] -->|Raw HTML| B(Price Parser)
        B -->|Price Update| C{Anomaly?}
    end

    subgraph Validation ["🧠 AI Validation Layer"]
        C -->|Yes| D[Context Assembler]
        D -->|History + Competitors| E[DeepSeek V3 Agent]
        E -->|Confidence Score| F{Is Legitimate?}
    end

    subgraph Delivery ["🚀 Delivery Layer"]
        F -->|Yes ">80%"| G[Notification Router]
        G -->|Instant| H[Discord / SMS]
        G -->|Digest| I[Email / Twitter]
    end

    style Detection fill:#e1f5fe,stroke:#01579b
    style Validation fill:#f3e5f5,stroke:#4a148c
    style Delivery fill:#e8f5e9,stroke:#1b5e20
```

---

## 🏗️ Technical Architecture

Built for speed, reliability, and scale. Pricehawk operates on an event-driven architecture designed to handle thousands of concurrent price checks.

### Core Stack

- **⚡ Framework**: [Next.js 14](https://nextjs.org) (App Router)
- **🗄️ Database**: [PostgreSQL](https://postgresql.org) + [Prisma](https://prisma.io)
- **📨 Event Bus**: [Redis](https://redis.io) Streams + [BullMQ](https://bullmq.io)
- **🧠 Intelligence**: [DeepSeek V3](https://deepseek.com) via OpenRouter
- **🕷️ Scraping**: [Firecrawl](https://firecrawl.dev) + [Playwright](https://playwright.dev)
- **🐳 DevOps**: Docker & Railway

### Capabilities

- **Affiliate Monetization**: Automatically injects affiliate tags (Amazon, etc.) into shared links.
- **Deal Lifecycle**: Auto-expires deals when prices return to normal.
- **Multi-Channel**: Delivers to Discord, Telegram, Twitter/X, and SMS simultaneously.

---

## 🚀 Getting Started

Deploying Pricehawk is simple with our Docker compliance.

### 1. Requirements

- Docker & Docker Compose
- API Keys (OpenRouter, Twitter, Telegram, etc.)

### 2. Run with One Command

```bash
# Clone the repository
git clone https://github.com/clduab11/pricehawk.git

# Start the full stack (App + Workers + DB + Redis)
docker compose up --build -d
```

### 3. Access the Dashboard

Visit `http://localhost:3000` to access the admin console and view live pricing feeds.

---

## 💰 Business Model

Pricehawk is designed as a SaaS platform with clear monetization channels:

1. **Subscriptions**: Tiered access (Starter, Pro, Elite) for faster alerts.
2. **Affiliate Revenue**: Automatic tag injection on all shared deal links.
3. **API Access**: Enterprise data stream for high-volume resellers.

```mermaid
pie title Revenue Streams
    "SaaS Subscriptions" : 60
    "Affiliate Commissions" : 25
    "API Licensing" : 10
    "Data Reselling" : 5
```

---

## 🗺️ Roadmap

- [x] **Phase 1: Foundation** - Scrapers, DB, Basic Auth
- [x] **Phase 2: Intelligence** - AI Validation, Redis Pipeline
- [x] **Phase 3: Expansion** - Twitter, Telegram, & Affiliate Integration
- [ ] **Phase 4: Mobile** - React Native App & Push Notifications
- [ ] **Phase 5: Global** - International Retailer Support

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### License

Pricehawk is dual-licensed:

- **ELv2**: Free for personal/non-commercial use.
- **Commercial**: Required for business use or resale.

---

<div align="center">
  <sub>Built with 🦅 by Parallax Analytics</sub>
</div>
