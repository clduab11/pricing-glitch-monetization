
import { ScrapingOrchestrator } from './scrapers/orchestrator.js';
import { PriceAnalysisEngine } from './analysis/engine.js';
import { NotificationService } from './notifications/service.js';

async function main() {
  console.log('Starting Pricing Glitch Platform Workers...');

  // Initialize systems
  const orchestrator = new ScrapingOrchestrator();
  const _analysisEngine = new PriceAnalysisEngine();
  const _notificationService = new NotificationService();

  try {
    // Start Orchestrator (BullMQ Workers)
    await orchestrator.initialize();
    console.log('✅ Scraping Orchestrator initialized');

    // In a real system, we'd have a separate worker listening for 'product-found' events
    // For this POC, we'll hook into the flow differently or just keep it running.
    // The orchestrator runs BullMQ workers which will process jobs.
    
    console.log('🚀 Worker service running via Docker. Press Ctrl+C to exit.');
    
    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
