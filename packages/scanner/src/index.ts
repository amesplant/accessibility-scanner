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

        // eslint-disable-next-line no-console
        console.log(`Batch ${i}/${totalBatches} complete; report ID ${chunkReport.id}`);
      }

      // Persist all batch shards under a single bundle id so the dashboard
      // exposes one scan entry instead of one entry per batch file.
      const bundleId = await db.saveReportBundle(partialReports, {
        sitemap: options.sitemap,
      });

      const bundleManifest = {
        id: bundleId,
        sitemap: options.sitemap,
        pageTitle: partialReports[0]?.pageTitle,
        startTime: partialReports.reduce((earliest, report) =>
          new Date(report.startTime).getTime() < new Date(earliest).getTime() ? report.startTime : earliest,
        partialReports[0]?.startTime ?? new Date().toISOString()),
        endTime: partialReports.reduce((latest, report) =>
          new Date(report.endTime).getTime() > new Date(latest).getTime() ? report.endTime : latest,
        partialReports[0]?.endTime ?? new Date().toISOString()),
        auditType: partialReports[0]?.auditType,
        wcagLevel: partialReports[0]?.wcagLevel,
        includeBestPractices: partialReports[0]?.includeBestPractices,
        projectId: partialReports[0]?.projectId,
        summary: partialReports.reduce((acc, report) => {
          acc.totalPages += report.summary.totalPages;
          acc.totalViolations += report.summary.totalViolations;
          for (const [impact, count] of Object.entries(report.summary.violationsByImpact)) {
            acc.violationsByImpact[impact] = (acc.violationsByImpact[impact] ?? 0) + count;
          }
          for (const [type, count] of Object.entries(report.summary.violationsByType)) {
            acc.violationsByType[type] = (acc.violationsByType[type] ?? 0) + count;
          }
          for (const [level, count] of Object.entries(report.summary.violationsByLevel)) {
            acc.violationsByLevel[level] = (acc.violationsByLevel[level] ?? 0) + count;
          }
          return acc;
        }, {
          totalPages: 0,
          totalViolations: 0,
          violationsByImpact: {} as Record<string, number>,
          violationsByType: {} as Record<string, number>,
          violationsByLevel: {} as Record<string, number>,
        }),
        kind: 'bundle',
        shards: partialReports.map((report) => ({
          id: report.id,
          file: path.join('shards', `${report.id}.json`),
          count: report.results.length,
        })),
      };

      if (options.output) {
        const outputPath = path.isAbsolute(options.output)
          ? options.output
          : path.resolve(process.cwd(), options.output);
        await fs.writeFile(outputPath, JSON.stringify(bundleManifest));

        // eslint-disable-next-line no-console
        console.log(`Bundle manifest written to ${outputPath} and saved with ID ${bundleId}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`Bundle saved with ID ${bundleId}`);
      }

      return;
    }

    const report = await scanner.scan();

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);
      await fs.writeFile(outputPath, JSON.stringify(report));
      await db.saveReport(report);
      // eslint-disable-next-line no-console
      console.log(`Scan complete; report written to ${outputPath} and saved with ID ${report.id}`);
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
  .description('Merge partial scan reports into a bundled report')
  .requiredOption('-i, --input <items...>', 'Input report IDs or file paths')
  .option('-o, --output <path>', 'Output path (JSON) for bundled report manifest')
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

    const bundleId = await db.saveReportBundle(reports);

    const bundleManifest = {
      id: bundleId,
      sitemap: reports[0]?.sitemap,
      pageTitle: reports[0]?.pageTitle,
      startTime: reports.reduce((earliest, report) =>
        new Date(report.startTime).getTime() < new Date(earliest).getTime() ? report.startTime : earliest,
      reports[0]?.startTime ?? new Date().toISOString()),
      endTime: reports.reduce((latest, report) =>
        new Date(report.endTime).getTime() > new Date(latest).getTime() ? report.endTime : latest,
      reports[0]?.endTime ?? new Date().toISOString()),
      auditType: reports[0]?.auditType,
      wcagLevel: reports[0]?.wcagLevel,
      includeBestPractices: reports[0]?.includeBestPractices,
      projectId: reports[0]?.projectId,
      summary: reports.reduce((acc, report) => {
        acc.totalPages += report.summary.totalPages;
        acc.totalViolations += report.summary.totalViolations;
        for (const [impact, count] of Object.entries(report.summary.violationsByImpact)) {
          acc.violationsByImpact[impact] = (acc.violationsByImpact[impact] ?? 0) + count;
        }
        for (const [type, count] of Object.entries(report.summary.violationsByType)) {
          acc.violationsByType[type] = (acc.violationsByType[type] ?? 0) + count;
        }
        for (const [level, count] of Object.entries(report.summary.violationsByLevel)) {
          acc.violationsByLevel[level] = (acc.violationsByLevel[level] ?? 0) + count;
        }
        return acc;
      }, {
        totalPages: 0,
        totalViolations: 0,
        violationsByImpact: {} as Record<string, number>,
        violationsByType: {} as Record<string, number>,
        violationsByLevel: {} as Record<string, number>,
      }),
      kind: 'bundle',
      shards: reports.map((report) => ({
        id: report.id,
        file: path.join('shards', `${report.id}.json`),
        count: report.results.length,
      })),
    };

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);
      await fs.writeFile(outputPath, JSON.stringify(bundleManifest));
      // eslint-disable-next-line no-console
      console.log(`Bundle manifest written to ${outputPath} and saved with ID ${bundleId}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`Bundle saved with ID ${bundleId}`);
    }

    // Clean up source reports from DB to keep only the merged result
    const sourceIds = options.input
      .filter((item: string) => !item.endsWith('.json') && !item.includes('/') && !item.includes('\\'));

    if (sourceIds.length > 0) {
      for (const id of sourceIds) {
        await db.deleteReport(id).catch(() => null);
      }
      // eslint-disable-next-line no-console
      console.log(`Deleted source reports from DB: ${sourceIds.join(', ')}`);
    }
  });

program.parse();