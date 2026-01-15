# Pricehawk Launch Checklist - February 28, 2026

## 🚀 Pre-Launch Infrastructure

### Hosting Setup

#### Option A: Vercel + Railway (Recommended)

| Component    | Platform | Tier                         | Est. Cost     |
| ------------ | -------- | ---------------------------- | ------------- |
| Next.js App  | Vercel   | Hobby (free) or Pro ($20/mo) | $0-20         |
| Workers (3x) | Railway  | Starter                      | $5-20         |
| PostgreSQL   | Neon     | Free tier → Pro              | $0-25         |
| Redis        | Upstash  | Pay-per-use                  | $5-15         |
| **Total**    |          |                              | **$10-80/mo** |

#### Option B: Full Railway

| Component    | Platform | Est. Cost |
| ------------ | -------- | --------- |
| All services | Railway  | $20-50/mo |

**GitHub Pages:** Only use for a static marketing/landing page. Cannot host Pricehawk's dynamic backend.

---

## 📱 Social Media API Setup

### Twitter/X (@pricehawk-bot)

- [ ] Create Twitter Developer account
- [ ] Create App in Developer Portal
- [ ] Enable OAuth 2.0 + write permissions
- [ ] Get API credentials:
  ```
  TWITTER_CLIENT_ID=
  TWITTER_CLIENT_SECRET=
  TWITTER_BEARER_TOKEN=
  TWITTER_ACCESS_TOKEN=
  TWITTER_ACCESS_TOKEN_SECRET=
  ```
- [ ] Set callback URL: `https://pricehawk.io/api/auth/twitter/callback`
- [ ] Test posting capability
- [ ] Apply for Elevated access if needed

### Telegram (@PricehawkBot + Channel)

- [ ] Message @BotFather: `/newbot`
- [ ] Name: "Pricehawk Deals"
- [ ] Username: `PricehawkDealsBot`
- [ ] Save bot token
- [ ] Create channel: @PricehawkDeals
- [ ] Add bot as channel admin
- [ ] Get channel ID (negative number)
  ```
  TELEGRAM_BOT_TOKEN=
  TELEGRAM_CHANNEL_ID=
  ```
- [ ] Test channel posting

### WhatsApp Business

- [ ] Create Meta Business Manager account
- [ ] Set up WhatsApp Business account
- [ ] Complete business verification
- [ ] Request API access
- [ ] Create message templates:
  - Deal alert template
  - Daily digest template
- [ ] Wait for template approval (~24-48 hours)
  ```
  WHATSAPP_PHONE_NUMBER_ID=
  WHATSAPP_BUSINESS_ID=
  WHATSAPP_ACCESS_TOKEN=
  ```

### Beehiiv Newsletter

- [ ] Upgrade to Scale plan ($49/month)
- [ ] Get API key from Settings → Integrations
- [ ] Note Publication ID
  ```
  BEEHIIV_API_KEY=
  BEEHIIV_PUBLICATION_ID=
  USE_BEEHIIV_DIGEST=true
  ```
- [ ] Design newsletter template
- [ ] Set up subscriber segments (free vs paid)
- [ ] Test programmatic posting

---

## 📊 Content Automation Schedule

### Hourly Twitter Posts (24/day)

```
Schedule: 0 * * * * (every hour)
Content:  Top 1-2 deals from last hour
Format:   Tweet + price chart image
Rotation: 12 template variations
```

### Telegram Channel (Hourly)

```
Schedule: 5 * * * * (5 minutes past each hour)
Content:  Same deals as Twitter
Format:   Rich HTML with inline buttons
```

### Beehiiv Newsletter (12-hour digest)

```
Schedule: 8AM + 8PM daily
Content:  Top 12 deals from past 12 hours
Format:   Free tier: 3 deals
          Paid tier: All 12 deals
```

### WhatsApp (Pro+ Subscribers)

```
Schedule: On-demand for high-confidence deals (>90%)
Content:  Personalized deal alerts
Limit:    Max 5/day per subscriber
```

---

## ✅ Feature Completion Checklist

### Social Media Automation

- [x] Twitter hourly posting implemented
- [x] Tweet templates rotating correctly
- [x] Price chart images generating
- [x] Affiliate disclosure included
- [x] Telegram channel broadcasting
- [x] WhatsApp template messages working
- [x] Beehiiv API integration complete

### Content Quality

- [ ] Deal expiration detection working
- [x] Content variation engine active
- [x] Duplicate post prevention
- [x] Image generation reliable
- [ ] Affiliate links tracking clicks

### Core Platform

- [ ] All 9 notification providers tested
- [ ] Stripe billing functional
- [ ] User dashboard accessible
- [ ] Real-time deal feed working
- [ ] Historical deal browser available

---

## 🔐 Security Checklist

- [ ] All API keys in environment variables
- [ ] No secrets in git history
- [ ] HTTPS enforced
- [ ] Rate limiting active
- [ ] Webhook signatures verified
- [ ] Admin endpoints protected
- [ ] User data encrypted

---

## 📈 Monitoring Setup

- [ ] Error tracking (Sentry recommended)
- [ ] Uptime monitoring
- [ ] API response time logging
- [ ] Worker health checks
- [ ] Database connection pooling
- [ ] Redis memory monitoring

---

## 🎯 Launch Day (Feb 28, 2026)

### Morning (8 AM)

- [ ] Verify all workers running
- [ ] Check cron jobs executing
- [ ] Monitor first social posts
- [ ] Verify email delivery
- [ ] Test signup flow

### Midday (12 PM)

- [ ] Review analytics
- [ ] Check error rates
- [ ] Verify subscription flow
- [ ] Monitor database load

### Evening (6 PM)

- [ ] Send launch announcement
- [ ] Monitor social engagement
- [ ] Respond to user feedback
- [ ] Check notification delivery rates

---

## 📞 Support Contacts

- **GitHub Issues:** github.com/clduab11/pricehawk/issues
- **Email:** support@pricehawk.io
- **Twitter:** @pricehawk-bot

---

_Launch Target: February 28, 2026_
_Created: January 15, 2026_
