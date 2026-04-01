import { Command } from 'commander';
import { SitemapScanner } from './scanner.js';
import { DatabaseService } from './database.js';

const program = new Command();

program
  .name('a11y-scanner')
  .description('Accessibility scanner using axe-core')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan a website using its sitemap')
  .requiredOption('-s, --sitemap <url|path>', 'Sitemap URL or local file path')
  .option('-c, --concurrent <number>', 'Concurrent pages to scan', '8')
  .option('--headless', 'Run in headless mode', true)
  .action(async (options) => {
    const scanner = new SitemapScanner(options);
    const report = await scanner.scan();
    
    const db = new DatabaseService();
    await db.saveReport(report);

    // report is now persisted to the JSON file; the React dashboard
    // will pick it up from the API.  no need for a separate HTML or
    // per-run JSON export.
    // eslint-disable-next-line no-console
    console.log(`Scan complete; report ID ${report.id}`);
  });

program
  .command('clear')
  .description('Wipe all stored scan reports')
  .action(async () => {
    const db = new DatabaseService();
    await db.clearReports();
    // eslint-disable-next-line no-console
    console.log('All reports deleted.');
  });

program.parse();