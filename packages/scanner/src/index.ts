import { Command } from 'commander';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { SitemapScanner } from './scanner.js';
import { DatabaseService, type ReportBundleManifest, type ReportShardRef } from './database.js';
import type { ScanReport } from '../../shared/dist/index.js';

type BundleSummary = {
  totalPages: number;
  totalViolations: number;
  violationsByImpact: Record<string, number>;
  violationsByType: Record<string, number>;
  violationsByLevel: Record<string, number>;
  manualFailCount: number;
  auditedPages: number;
};

function createBundleSummary(): BundleSummary {
  return {
    totalPages: 0,
    totalViolations: 0,
    violationsByImpact: {},
    violationsByType: {},
    violationsByLevel: {},
    manualFailCount: 0,
    auditedPages: 0,
  };
}

function accumulateBundleSummary(summary: BundleSummary, report: ScanReport): void {
  summary.totalPages += report.summary.totalPages;
  summary.totalViolations += report.summary.totalViolations;
  summary.manualFailCount += report.summary.manualFailCount ?? 0;
  summary.auditedPages += report.summary.auditedPages ?? 0;

  for (const [impact, count] of Object.entries(report.summary.violationsByImpact)) {
    summary.violationsByImpact[impact] = (summary.violationsByImpact[impact] ?? 0) + count;
  }

  for (const [type, count] of Object.entries(report.summary.violationsByType)) {
    summary.violationsByType[type] = (summary.violationsByType[type] ?? 0) + count;
  }

  for (const [level, count] of Object.entries(report.summary.violationsByLevel)) {
    summary.violationsByLevel[level] = (summary.violationsByLevel[level] ?? 0) + count;
  }
}

function buildBundleManifest(
  bundleId: string,
  metadata: Pick<ScanReport, 'sitemap' | 'pageTitle' | 'startTime' | 'endTime' | 'auditType' | 'wcagLevel' | 'includeBestPractices' | 'projectId'>,
  summary: BundleSummary,
  shards: ReportShardRef[],
): ReportBundleManifest {
  return {
    id: bundleId,
    sitemap: metadata.sitemap,
    pageTitle: metadata.pageTitle,
    startTime: metadata.startTime,
    endTime: metadata.endTime,
    auditType: metadata.auditType,
    wcagLevel: metadata.wcagLevel,
    includeBestPractices: metadata.includeBestPractices,
    projectId: metadata.projectId,
    summary,
    kind: 'bundle',
    shards,
  };
}

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
      const bundleId = randomUUID();
      const shards: ReportShardRef[] = [];
      const summary = createBundleSummary();
      let firstReport: ScanReport | undefined;
      let startTime: ScanReport['startTime'] | undefined;
      let endTime: ScanReport['endTime'] | undefined;

      for (let i = 1; i <= totalBatches; i++) {
        // run each batch with explicit URLs so scanner does not re-slice the same batch
        const chunkUrls = allUrls.slice((i - 1) * batchSize, i * batchSize);
        const chunkScanner = new SitemapScanner({ ...options, urls: chunkUrls });
        const chunkReport = await chunkScanner.scan();

        if (!firstReport) {
          firstReport = chunkReport;
        }

        startTime = !startTime || new Date(chunkReport.startTime).getTime() < new Date(startTime).getTime()
          ? chunkReport.startTime
          : startTime;
        endTime = !endTime || new Date(chunkReport.endTime).getTime() > new Date(endTime).getTime()
          ? chunkReport.endTime
          : endTime;

        const shardRef = await db.saveReportBundleShard(bundleId, chunkReport);
        shards.push(shardRef);
        accumulateBundleSummary(summary, chunkReport);

        const maybeGc = (globalThis as { gc?: () => void }).gc;
        if (typeof maybeGc === 'function') {
          maybeGc();
        }

        // eslint-disable-next-line no-console
        console.log(`Batch ${i}/${totalBatches} complete; report ID ${chunkReport.id}`);
      }

      if (!firstReport) {
        throw new Error('No reports were generated for the requested batches');
      }

      const bundleManifest = buildBundleManifest(bundleId, {
        sitemap: options.sitemap,
        pageTitle: firstReport.pageTitle,
        startTime: startTime ?? firstReport.startTime,
        endTime: endTime ?? firstReport.endTime,
        auditType: firstReport.auditType,
        wcagLevel: firstReport.wcagLevel,
        includeBestPractices: firstReport.includeBestPractices,
        projectId: firstReport.projectId,
      }, summary, shards);
      await db.saveReportBundleManifest(bundleId, bundleManifest);

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
    const bundleId = randomUUID();
    const shards: ReportShardRef[] = [];
    const summary = createBundleSummary();
    let firstReport: ScanReport | undefined;
    let startTime: ScanReport['startTime'] | undefined;
    let endTime: ScanReport['endTime'] | undefined;

    for (const item of options.input) {
      let report: ScanReport | undefined;
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

      if (!firstReport) {
        firstReport = report;
      }

      startTime = !startTime || new Date(report.startTime).getTime() < new Date(startTime).getTime()
        ? report.startTime
        : startTime;
      endTime = !endTime || new Date(report.endTime).getTime() > new Date(endTime).getTime()
        ? report.endTime
        : endTime;

      const shardRef = await db.saveReportBundleShard(bundleId, report);
      shards.push(shardRef);
      accumulateBundleSummary(summary, report);
    }

    if (!firstReport) {
      throw new Error('No reports were provided to merge');
    }

    const bundleManifest = buildBundleManifest(bundleId, {
      sitemap: firstReport.sitemap,
      pageTitle: firstReport.pageTitle,
      startTime: startTime ?? firstReport.startTime,
      endTime: endTime ?? firstReport.endTime,
      auditType: firstReport.auditType,
      wcagLevel: firstReport.wcagLevel,
      includeBestPractices: firstReport.includeBestPractices,
      projectId: firstReport.projectId,
    }, summary, shards);
    await db.saveReportBundleManifest(bundleId, bundleManifest);

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