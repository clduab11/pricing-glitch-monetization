import { NextRequest, NextResponse } from 'next/server';
import { scrapeAndDetect, scrapeUrl } from '@/lib/scraping/firecrawl';
import { z } from 'zod';
import { validateProductUrl, URLValidationError } from '@/lib/validators/url-validator';

// Request validation schema
const ScrapeRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  extract_only: z.boolean().optional().default(false),
});

/**
 * POST /api/scrape
 * Scrape a URL for product data and detect pricing anomalies
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const parseResult = ScrapeRequestSchema.safeParse(body);
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

    const { url, extract_only } = parseResult.data;

    // Validate URL against whitelist (SSRF prevention)
    try {
      validateProductUrl(url);
    } catch (error) {
      if (error instanceof URLValidationError) {
        return NextResponse.json(
          {
            success: false,
            error: 'URL validation failed',
            details: error.message,
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // If extract_only, just scrape and return raw data
    if (extract_only) {
      const result = await scrapeUrl({ url });
      return NextResponse.json({
        success: result.success,
        data: result.data,
        error: result.error,
      });
    }

    // Full pipeline: scrape + detect
    const result = await scrapeAndDetect(url);

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      product: result.product,
      anomaly: result.anomaly || null,
      is_anomaly: !!result.anomaly,
    });
  } catch (error) {
    console.error('Scrape API error:', error);
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
 * GET /api/scrape
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'scrape',
    timestamp: new Date().toISOString(),
  });
}
