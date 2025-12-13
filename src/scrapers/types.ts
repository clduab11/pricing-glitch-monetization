
export * from '../types';

export interface ScraperConfig {
  retailer: string;
  targetUrl: string;
  selectors: Record<string, string>;
  antiBot: boolean;
  rateLimit: number; // requests per minute
}
