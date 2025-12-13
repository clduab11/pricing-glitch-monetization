import { db } from '../db/index.js';
import { Product } from '../types/index.js';

interface AnalysisResult {
  isPricingError: boolean;
  confidence: number;
  errorType: 'decimal' | 'percentage_drop' | 'historical' | 'unknown';
  profitMargin: number;
  zScore?: number;
}

export class PriceAnalysisEngine {
  async analyzeProduct(product: Product): Promise<AnalysisResult> {
    const decimalCheck = await this.checkDecimalError(product);
    if (decimalCheck.isPricingError) return decimalCheck;

    const percentageCheck = await this.checkPercentageDiscount(product);
    if (percentageCheck.isPricingError) return percentageCheck;

    const historicalCheck = await this.checkHistoricalPricing(product);
    if (historicalCheck.isPricingError) return historicalCheck;

    return {
      isPricingError: false,
      confidence: 0,
      errorType: 'unknown',
      profitMargin: 0,
    };
  }

  private async checkDecimalError(product: Product): Promise<AnalysisResult> {
    const { price, originalPrice } = product;
    if (!originalPrice) return { isPricingError: false, confidence: 0, errorType: 'unknown', profitMargin: 0 };

    const ratio = price / originalPrice;
    if (ratio < 0.1 || ratio > 10) { // Simple heuristic
         return {
          isPricingError: true,
          confidence: 90,
          errorType: 'decimal',
          profitMargin: ((originalPrice - price) / originalPrice) * 100,
        };
    }
    return { isPricingError: false, confidence: 0, errorType: 'unknown', profitMargin: 0 };
  }

  private async checkPercentageDiscount(product: Product): Promise<AnalysisResult> {
    const { price, originalPrice } = product;
    if (!originalPrice) return { isPricingError: false, confidence: 0, errorType: 'unknown', profitMargin: 0 };

    const discountPercent = ((originalPrice - price) / originalPrice) * 100;
    if (discountPercent > 50) {
       return {
          isPricingError: true,
          confidence: discountPercent > 80 ? 80 : 60,
          errorType: 'percentage_drop',
          profitMargin: discountPercent,
        };
    }
    return { isPricingError: false, confidence: 0, errorType: 'unknown', profitMargin: 0 };
  }

  private async checkHistoricalPricing(product: Product): Promise<AnalysisResult> {
    // Fetch basic history
    const history = await db.priceHistory.findMany({
      where: { productId: product.id }, // Need product.id if it exists, or look up by URL
      take: 10,
    });

    if (history.length < 3) return { isPricingError: false, confidence: 0, errorType: 'unknown', profitMargin: 0 };
    
    // For simplicity, skip complex math if no numpy equivalent
    return { isPricingError: false, confidence: 0, errorType: 'unknown', profitMargin: 0 };
  }
}
