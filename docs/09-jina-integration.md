# Jina.ai Integration

This document describes the Jina.ai enrichment layer used for reranking validated glitches in the Pricehawk detection pipeline.

## Overview

Jina.ai provides a reranker service that scores documents based on relevance to a query. In Pricehawk, we use this capability to score validated pricing glitches based on their:

- **Virality potential**: How likely the deal is to spread on social media
- **Honor probability**: How likely the retailer is to fulfill orders

## Pipeline Position

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Scraping   │────▶│   Anomaly    │────▶│  AI Validator │────▶│ Jina Reranker│
│   Engine     │     │  Detection   │     │  (DeepSeek)   │     │  (Optional)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                       │
                                                                       ▼
                                                               ┌──────────────┐
                                                               │ Notification │
                                                               │   Delivery   │
                                                               └──────────────┘
```

The Jina reranker is called **after** DeepSeek V3 validation succeeds and **before** notifications are sent. It runs as an optional enrichment step that adds a relevance score without blocking the main pipeline.

## Data Flow

1. **Input**: Validated glitch record with product details
2. **Transformation**: Glitch is formatted as a document with key attributes
3. **Reranking Query**: A prompt optimized for identifying high-value, likely-to-be-honored deals
4. **Output**: Relevance score (0-1) stored on the glitch record

### Fields Added to Database

| Field | Type | Description |
|-------|------|-------------|
| `jina_score` | Decimal(5,4) | Relevance score from 0.0000 to 1.0000 |
| `jina_ranked_at` | DateTime | Timestamp when Jina scoring was performed |

## Configuration

### Environment Variables

```bash
# Jina.ai API key (required for reranking)
JINA_API_KEY=jina_...

# Enable/disable Jina reranking (default: false)
USE_JINA_RERANK=false
```

### Enabling Jina Reranking

1. Obtain a Jina API key from [jina.ai](https://jina.ai)
2. Set `JINA_API_KEY` in your environment
3. Set `USE_JINA_RERANK=true`

## Integration Details

### Reranking Query

The reranking query is optimized to identify glitches with:

- Major retailer presence
- Significant discount (>70%)
- Electronics or popular brands
- Clear pricing error patterns (decimal error, database mistake)
- Time-sensitive urgency
- Widespread demographic appeal

### Document Format

Each glitch is formatted with the following attributes for reranking:

```
Product: [Title]
Retailer: [Retailer Name]
Category: [Category]
Original Price: $[Original]
Current Price: $[Current]
Savings: [Percentage]%
Glitch Type: [Type]
Confidence: [AI Confidence]%
Profit Margin: [Margin]%
Detection Reasoning: [AI Reasoning]
```

## Cost and Performance

### API Costs

Jina reranker pricing (as of January 2026):

| Tier | Price | Included |
|------|-------|----------|
| Free | $0 | 1M tokens/month |
| Pay-as-you-go | $0.02/1K tokens | Unlimited |

For typical glitch documents (~200 tokens each), expect:
- 5,000 glitches/day ≈ 1M tokens ≈ $20/month

### Performance

- **Latency**: ~100-300ms per rerank call
- **Batch Size**: Up to 100 documents per call
- **Timeout**: 10 seconds default

### Error Handling

The Jina integration is designed to be non-blocking:

- API failures are logged but don't stop the validation pipeline
- Glitches without Jina scores can still be processed and sent
- Scores are updated asynchronously after initial glitch creation

## Usage in Ranking

The Jina score is used as a bonus factor in the glitch ranking algorithm:

```typescript
function calculateGlitchRank(glitch: ValidatedGlitch): number {
  const baseScore = glitch.profitMargin * 0.6 + glitch.confidence * 0.3;
  const jinaBonus = (glitch.jinaScore ?? 0) * 10;
  return baseScore + jinaBonus;
}
```

This means a perfect Jina score (1.0) adds up to 10 points to the ranking, potentially elevating high-virality deals.

## Troubleshooting

### Common Issues

1. **"Jina API key not configured"**
   - Ensure `JINA_API_KEY` is set in your environment
   - Verify the key is valid at [jina.ai](https://jina.ai)

2. **"Jina scoring failed (non-blocking)"**
   - Check network connectivity to api.jina.ai
   - Verify API quota hasn't been exceeded
   - Review logs for specific error messages

3. **Scores not appearing on glitches**
   - Confirm `USE_JINA_RERANK=true` is set
   - Check that validation is succeeding before Jina is called
   - Verify database connection is working

## Future Enhancements

- Batch scoring for daily digest generation
- Custom fine-tuned reranker model for pricing errors
- A/B testing of different reranking queries
- Integration with Jina's embedding API for semantic search
