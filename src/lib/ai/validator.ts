import { PricingAnomaly, ValidatedGlitch, ValidationResult } from '@/types';
import { publishConfirmedGlitch } from '@/lib/clients/redis';
import { createServerSupabaseClient } from '@/lib/clients/supabase';

// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'deepseek/deepseek-chat'; // DeepSeek V3

// System prompt for glitch analysis
const SYSTEM_PROMPT = `You are an AI expert in e-commerce pricing analysis. Your job is to determine if a price is a genuine pricing error (glitch) or a legitimate sale/discount.

Analyze the provided product data and determine:
1. Whether this is likely a pricing glitch (is_glitch: true/false)
2. Your confidence level (0-100)
3. Brief reasoning for your decision
4. The type of glitch if applicable

Consider these factors:
- Discount percentage (>70% is suspicious, >90% is very likely a glitch)
- Z-score (>3 indicates significant deviation from historical prices)
- Common glitch patterns:
  - Decimal errors (e.g., $19.99 instead of $199.99)
  - Database errors (wrong product linked to price)
  - Coupon stacking (multiple discounts applied incorrectly)
  - Clearance mistakes
- Retailer context (some retailers have frequent glitches)
- Product category (electronics, appliances more prone to glitches)
- Time of day (late night updates often cause errors)

Respond ONLY with valid JSON in this exact format:
{
  "is_glitch": boolean,
  "confidence": number,
  "reasoning": "string",
  "glitch_type": "decimal_error" | "database_error" | "clearance" | "coupon_stack" | "unknown"
}`;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Validate a pricing anomaly using AI (OpenRouter/DeepSeek)
 */
export async function validateAnomaly(anomaly: PricingAnomaly): Promise<ValidationResult> {
  if (!OPENROUTER_API_KEY) {
    console.warn('OpenRouter API key not configured');
    // Return a conservative estimate based on rule-based logic
    return fallbackValidation(anomaly);
  }

  const userPrompt = formatAnomalyForAI(anomaly);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Pricing Glitch Monitor',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error:', error);
      return fallbackValidation(anomaly);
    }

    const data: OpenRouterResponse = await response.json();
    
    if (data.error) {
      console.error('OpenRouter error:', data.error.message);
      return fallbackValidation(anomaly);
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      return fallbackValidation(anomaly);
    }

    // Parse AI response
    const parsed = JSON.parse(content);
    return {
      is_glitch: parsed.is_glitch ?? false,
      confidence: Math.min(Math.max(parsed.confidence ?? 0, 0), 100),
      reasoning: parsed.reasoning ?? 'AI analysis completed',
      glitch_type: parsed.glitch_type ?? 'unknown',
    };
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    return fallbackValidation(anomaly);
  }
}

/**
 * Format anomaly data for AI analysis
 */
function formatAnomalyForAI(anomaly: PricingAnomaly): string {
  const { product, anomaly_type, z_score, discount_percentage, initial_confidence } = anomaly;
  
  return `Analyze this potential pricing error:

Product: ${product.product_name}
Retailer: ${product.retailer_id}
Category: ${product.category || 'Unknown'}

Pricing:
- Current Price: $${product.current_price.toFixed(2)}
- Original Price: ${product.original_price ? `$${product.original_price.toFixed(2)}` : 'Not listed'}
- Discount: ${discount_percentage.toFixed(1)}%

Detection Signals:
- Anomaly Type: ${anomaly_type}
- Z-Score: ${z_score?.toFixed(2) || 'N/A'}
- Initial Confidence: ${initial_confidence}%

Stock Status: ${product.stock_status}
Detection Time: ${anomaly.detected_at}

Is this a pricing glitch or a legitimate sale?`;
}

/**
 * Fallback validation using rule-based logic (when AI is unavailable)
 */
function fallbackValidation(anomaly: PricingAnomaly): ValidationResult {
  const { discount_percentage, z_score, anomaly_type, initial_confidence } = anomaly;
  
  // Rule-based decision making
  let isGlitch = false;
  let confidence = initial_confidence;
  let reasoning = '';
  let glitchType: ValidationResult['glitch_type'] = 'unknown';

  if (anomaly_type === 'decimal_error') {
    isGlitch = true;
    confidence = Math.min(95, confidence + 10);
    reasoning = 'Price ratio suggests decimal point error (price is less than 1% of original).';
    glitchType = 'decimal_error';
  } else if (discount_percentage > 90) {
    isGlitch = true;
    confidence = Math.min(90, confidence + 5);
    reasoning = `Extremely high discount (${discount_percentage.toFixed(0)}%) is very likely a pricing error.`;
    glitchType = 'database_error';
  } else if (z_score && z_score > 4 && discount_percentage > 60) {
    isGlitch = true;
    confidence = Math.min(85, confidence);
    reasoning = `High Z-score (${z_score.toFixed(1)}) combined with ${discount_percentage.toFixed(0)}% discount indicates anomaly.`;
    glitchType = 'database_error';
  } else if (discount_percentage > 70) {
    isGlitch = discount_percentage > 80;
    confidence = Math.min(70, confidence);
    reasoning = `Significant discount (${discount_percentage.toFixed(0)}%). May be legitimate sale or error.`;
    glitchType = discount_percentage > 80 ? 'clearance' : 'unknown';
  } else {
    isGlitch = false;
    confidence = 100 - confidence;
    reasoning = 'Discount is within normal sale range. Likely legitimate promotion.';
  }

  return {
    is_glitch: isGlitch,
    confidence,
    reasoning,
    glitch_type: glitchType,
  };
}

/**
 * Complete validation pipeline for an anomaly
 */
export async function validateAndProcess(anomaly: PricingAnomaly): Promise<ValidatedGlitch | null> {
  // Run AI validation
  const validation = await validateAnomaly(anomaly);

  // Only process confirmed glitches with sufficient confidence
  if (!validation.is_glitch || validation.confidence < 60) {
    // Update anomaly status to rejected
    await updateAnomalyStatus(anomaly.id, 'rejected');
    return null;
  }

  // Create validated glitch record
  const glitchId = `glitch_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const validatedGlitch: ValidatedGlitch = {
    id: glitchId,
    anomaly_id: anomaly.id,
    product: anomaly.product,
    validation,
    profit_margin: anomaly.discount_percentage,
    estimated_duration: estimateGlitchDuration(validation.glitch_type),
    validated_at: new Date().toISOString(),
  };

  // Save to database
  await saveValidatedGlitch(validatedGlitch);

  // Publish to Redis for notification workers
  await publishConfirmedGlitch(glitchId, validatedGlitch);

  // Update anomaly status
  await updateAnomalyStatus(anomaly.id, 'validated');

  return validatedGlitch;
}

/**
 * Estimate how long a glitch might last based on type
 */
function estimateGlitchDuration(glitchType: ValidationResult['glitch_type']): string {
  switch (glitchType) {
    case 'decimal_error':
      return '15-30 minutes';
    case 'database_error':
      return '30-60 minutes';
    case 'clearance':
      return '2-4 hours';
    case 'coupon_stack':
      return '1-2 hours';
    default:
      return '30 minutes';
  }
}

/**
 * Update anomaly status in database
 */
async function updateAnomalyStatus(anomalyId: string, status: PricingAnomaly['status']): Promise<void> {
  const supabase = createServerSupabaseClient();
  
  const { error } = await supabase
    .from('anomalies')
    .update({ status })
    .eq('id', anomalyId);

  if (error) {
    console.error('Error updating anomaly status:', error);
  }
}

/**
 * Save validated glitch to database
 */
async function saveValidatedGlitch(glitch: ValidatedGlitch): Promise<void> {
  const supabase = createServerSupabaseClient();
  
  const { error } = await supabase
    .from('validated_glitches')
    .insert({
      id: glitch.id,
      anomaly_id: glitch.anomaly_id,
      is_glitch: glitch.validation.is_glitch,
      confidence: glitch.validation.confidence,
      reasoning: glitch.validation.reasoning,
      glitch_type: glitch.validation.glitch_type,
      profit_margin: glitch.profit_margin,
      validated_at: glitch.validated_at,
    });

  if (error) {
    console.error('Error saving validated glitch:', error);
  }
}
