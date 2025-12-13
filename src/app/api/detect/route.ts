import { NextRequest, NextResponse } from 'next/server';
import { validateAndProcess, validateAnomaly } from '@/lib/ai/validator';
import { PricingAnomalySchema, PricingAnomaly } from '@/types';
import { z } from 'zod';

// Request validation schema
const DetectRequestSchema = z.object({
  anomaly: PricingAnomalySchema.optional(),
  // Alternative: provide raw data for validation
  product_name: z.string().optional(),
  current_price: z.number().positive().optional(),
  original_price: z.number().positive().optional(),
  retailer_id: z.string().optional(),
  discount_percentage: z.number().optional(),
  z_score: z.number().optional(),
});

/**
 * POST /api/detect
 * Validate a pricing anomaly using AI (OpenRouter/DeepSeek)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const parseResult = DetectRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request',
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // If full anomaly object provided, process it
    if (data.anomaly) {
      const validatedGlitch = await validateAndProcess(data.anomaly);

      if (!validatedGlitch) {
        return NextResponse.json({
          success: true,
          is_glitch: false,
          message: 'Anomaly rejected - not a confirmed pricing error',
        });
      }

      return NextResponse.json({
        success: true,
        is_glitch: true,
        glitch: validatedGlitch,
      });
    }

    // If raw data provided, construct anomaly and validate
    if (data.current_price && data.product_name) {
      const tempId = crypto.randomUUID();
      const anomaly: PricingAnomaly = {
        id: `temp_${tempId}`,
        productId: `temp_prod_${tempId}`,
        product: {
          id: `temp_prod_${tempId}`,
          title: data.product_name,
          price: data.current_price,
          originalPrice: data.original_price || undefined,
          stockStatus: 'unknown',
          retailer: data.retailer_id || 'unknown',
          scrapedAt: new Date().toISOString(),
          url: '',
          // Add default values for required fields in Product type
        },
        anomalyType: data.z_score && data.z_score > 3 ? 'z_score' : 'percentage_drop',
        zScore: data.z_score,
        discountPercentage: data.discount_percentage || 
          (data.original_price ? ((data.original_price - data.current_price) / data.original_price) * 100 : 0),
        initialConfidence: 50,
        detectedAt: new Date().toISOString(),
        status: 'pending',
      };

      const validation = await validateAnomaly(anomaly);

      return NextResponse.json({
        success: true,
        validation,
      });
    }

    return NextResponse.json(
      { 
        success: false, 
        error: 'Either anomaly object or product data (product_name, current_price) is required',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Detect API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/detect
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'detect',
    timestamp: new Date().toISOString(),
  });
}
