import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
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
  .option('--batch-size <number>', 'Maximum pages per batch (0 = no batching)', '0')
  .option('--batch-index <number>', '1-based batch index when batch-size is set')
  .option('--output <path>', 'Optional path to write report JSON directly')
  .action(async (options) => {
    const db = new DatabaseService();
    const scanner = new SitemapScanner(options);

    const batchSize = Number(options.batchSize ?? 0);

    if (batchSize > 0 && !options.batchIndex) {
      const allUrls = await scanner.getUrls();
      const totalBatches = Math.ceil(allUrls.length / batchSize);
      const partialReports = [];

      for (let i = 1; i <= totalBatches; i++) {
        // run each batch with explicit URLs so scanner does not re-slice the same batch
        const chunkUrls = allUrls.slice((i - 1) * batchSize, i * batchSize);
        const chunkScanner = new SitemapScanner({ ...options, urls: chunkUrls });
        const chunkReport = await chunkScanner.scan();
        partialReports.push(chunkReport);

        if (!options.output) {
          await db.saveReport(chunkReport);
        }

        // eslint-disable-next-line no-console
        console.log(`Batch ${i}/${totalBatches} complete; report ID ${chunkReport.id}`);
      }

      // Merge all partial chunk results into a single consolidated report
      const mergedReport = SitemapScanner.mergeReports(partialReports, { outputSitemap: options.sitemap });

      if (options.output) {
        const outputPath = path.isAbsolute(options.output)
          ? options.output
          : path.resolve(process.cwd(), options.output);
        await fs.writeFile(outputPath, JSON.stringify(mergedReport));
        // eslint-disable-next-line no-console
        console.log(`Merged report written to ${outputPath}`);
      } else {
        await db.saveReport(mergedReport);

        // Remove partial chunk reports so dashboard shows only consolidated result
        await Promise.all(partialReports.map((chunkReport) => db.deleteReport(chunkReport.id)));

        // eslint-disable-next-line no-console
        console.log(`Merged report saved with ID ${mergedReport.id} (deleted partial chunk reports)`);
      }

      return;
    }

    const report = await scanner.scan();

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);
      await fs.writeFile(outputPath, JSON.stringify(report));
      // eslint-disable-next-line no-console
      console.log(`Scan complete; report written to ${outputPath}`);
      return;
    }

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

program
  .command('merge')
  .description('Merge partial scan reports into a consolidated report')
  .requiredOption('-i, --input <items...>', 'Input report IDs or file paths')
  .option('-o, --output <path>', 'Output path (JSON) for merged report')
  .action(async (options) => {
    const db = new DatabaseService();
    const reports = [];

    for (const item of options.input) {
      let report;
      if (item.endsWith('.json') || item.includes('/') || item.includes('\\')) {
        const absolute = path.isAbsolute(item) ? item : path.resolve(process.cwd(), item);
        const raw = await fs.readFile(absolute, 'utf-8');
        report = JSON.parse(raw);
      } else {
        report = await db.getReport(item);
      }

      if (!report) {
        throw new Error(`Report not found: ${item}`);
      }
      reports.push(report);
    }

    const mergedReport = SitemapScanner.mergeReports(reports);

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);
      await fs.writeFile(outputPath, JSON.stringify(mergedReport));
      // eslint-disable-next-line no-console
      console.log(`Merged report written to ${outputPath}`);
    } else {
      await db.saveReport(mergedReport);
      // eslint-disable-next-line no-console
      console.log(`Merged report saved with ID ${mergedReport.id}`);
    }
  });

program.parse();