import puppeteer, { Browser } from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { XMLParser } from 'fast-xml-parser';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScanResult, ScanReport, DetectedElement, AxeRuleResult } from '../../shared/dist/index.js';
import { DETECTORS, DetectorModule } from './detectors/index.js';
import { BROWSER_UTILS_SCRIPT } from './detectors/browserUtils.js';

const FIXED_BATCH_SIZE = 150;
export class SitemapScanner {
  private browser: Browser | null = null;
  private options: any;

  constructor(options: any) {
    this.options = options;
  }

  async getUrls(): Promise<string[]> {
    if (this.options.urls && Array.isArray(this.options.urls)) {
      return this.options.urls;
    }
    if (!this.options.sitemap) {
      throw new Error('Missing sitemap URL or urls array');
    }
    return this.fetchSitemapUrls(this.options.sitemap);
  }

  async scan(): Promise<ScanReport> {
    const signal: AbortSignal | undefined = this.options.signal;
    const allUrls: string[] = await this.getUrls();
    const batchSize = this.options.batchSize ? FIXED_BATCH_SIZE : 0;
    const batchIndex = Number(this.options.batchIndex ?? 0);
    let urls = allUrls;

    const hasExplicitUrls = Array.isArray(this.options.urls);

    if (batchSize > 0 && !hasExplicitUrls) {
      if (batchIndex <= 0) {
        throw new Error('When batchSize is set, batchIndex must be a positive integer');
      }
      const totalBatches = Math.ceil(allUrls.length / batchSize);
      if (batchIndex > totalBatches) {
        throw new Error(`batchIndex ${batchIndex} is out of range (1..${totalBatches})`);
      }
      const start = (batchIndex - 1) * batchSize;
      const end = Math.min(allUrls.length, start + batchSize);
      urls = allUrls.slice(start, end);
      this.options.batchInfo = { batchIndex, totalBatches, start, end, originalTotal: allUrls.length };
    } else if (batchSize > 0 && hasExplicitUrls) {
      // Already pre-sliced chunk from caller; avoid re-applying batch slicing.
      const totalBatches = 1;
      this.options.batchInfo = {
        batchIndex: batchIndex > 0 ? batchIndex : 1,
        totalBatches,
        start: 0,
        end: allUrls.length,
        originalTotal: allUrls.length,
      };
    }

    const limit = pLimit(parseInt(this.options.concurrent));

    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const startTime = new Date();
    const results: ScanResult[] = [];

    const scanPromises = urls.map(url =>
      limit(async () => {
        if (signal?.aborted) return;
        const result = await this.scanPage(url);
        if (signal?.aborted) return;
        results.push(result);
        this.options.onProgress?.(results.length, urls.length, url);
        // eslint-disable-next-line no-console
        console.log(`Scanned: ${url}`);
        return result;
      })
    );

    await Promise.all(scanPromises);
    await this.browser.close();

    const endTime = new Date();
    
    return this.generateReport(results, startTime, endTime);
  }

  private async fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
    let xml: string;

    const localPath = resolve(sitemapUrl);
    if (!sitemapUrl.startsWith('http://') && !sitemapUrl.startsWith('https://') && existsSync(localPath)) {
      xml = readFileSync(localPath, 'utf-8');
    } else {
      const response = await fetch(sitemapUrl);
      xml = await response.text();
    }
    
    const parser = new XMLParser();
    const sitemap = parser.parse(xml);
    
    const urls: string[] = [];
    
    // Handle both regular sitemaps and sitemap index files
    if (sitemap.sitemapindex) {
      // Sitemap index - fetch all child sitemaps
      const sitemaps = Array.isArray(sitemap.sitemapindex.sitemap) 
        ? sitemap.sitemapindex.sitemap 
        : [sitemap.sitemapindex.sitemap];
      
      for (const sm of sitemaps) {
        const childUrls = await this.fetchSitemapUrls(sm.loc);
        urls.push(...childUrls);
      }
    } else if (sitemap.urlset) {
      // Regular sitemap
      const urlEntries = Array.isArray(sitemap.urlset.url) 
        ? sitemap.urlset.url 
        : [sitemap.urlset.url];
      
      urls.push(...urlEntries.map((u: any) => u.loc));
    }
    
    return urls;
  }

  async scanSingle(url: string): Promise<ScanResult> {
    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      return await this.scanPage(url);
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  private mapRuleResults(rules: any[]): AxeRuleResult[] {
    return rules.map((rule: any) => ({
      id: rule.id,
      impact: rule.impact as AxeRuleResult['impact'],
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: rule.tags,
      level: this.deriveLevel(rule.tags),
      nodes: (rule.nodes ?? []).map((node: any) => ({
        html: node.html,
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
  }

  private async scanPage(url: string): Promise<ScanResult> {
    const page = await this.browser!.newPage();

    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      const axe = new AxePuppeteer(page);
      const wcagLevel: 'A' | 'AA' | 'AAA' = this.options.wcagLevel ?? 'AA';
      const includeBestPractices: boolean = this.options.includeBestPractices ?? false;
      const axeTags: string[] = [];
      // Always include Level A tags
      axeTags.push('wcag2a', 'wcag21a');
      if (wcagLevel === 'AA' || wcagLevel === 'AAA') {
        axeTags.push('wcag2aa', 'wcag21aa', 'wcag22aa');
      }
      if (wcagLevel === 'AAA') {
        axeTags.push('wcag2aaa');
      }
      if (includeBestPractices) {
        axeTags.push('best-practice');
      }
      axe.withTags(axeTags);

      // Inject shared browser-side utilities once so all detectors can use them
      await page.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

      const [axeResults, pageTitle, ...rawDetected] = await Promise.all([
        axe.analyze(),
        page.title(),
        ...DETECTORS.map((d: DetectorModule) => d.extract(page)),
      ]);

      const allDetected = rawDetected.map((raw, i) =>
        DETECTORS[i].processElements(raw as Omit<DetectedElement, 'id'>[]),
      );

      const viewportWidth: number = await page.evaluate(() => window.innerWidth);
      const viewportHeight: number = await page.evaluate(() => window.innerHeight);

      const detectedElementsMap: NonNullable<ScanResult['detectedElements']> = {};
      for (let i = 0; i < DETECTORS.length; i++) {
        const d = DETECTORS[i];
        if (d.ALWAYS_INCLUDE || allDetected[i].length > 0) {
          detectedElementsMap[d.CRITERION_ID] = allDetected[i];
        }
      }

      const results = axeResults;
      const passRules = this.mapRuleResults(results.passes);
      const incompleteRules = this.mapRuleResults(results.incomplete);

      // Build violations array before return so we can mutate nodes for screenshots
      const violations = results.violations.map((v: any) => ({
        id: v.id,
        impact: v.impact as any,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        level: this.deriveLevel(v.tags),
        nodes: v.nodes.map((n: any) => ({
          html: n.html,
          target: n.target,
          failureSummary: n.failureSummary,
        }))
      }));

      // Capture screenshots of violation nodes using their CSS selectors (cap 5/violation, 30 total)
      let violationScreenshots = 0;
      for (const violation of violations) {
        let perViolation = 0;
        for (const node of violation.nodes) {
          if (violationScreenshots >= 30 || perViolation >= 5) break;
          const selector = Array.isArray(node.target) && node.target.length > 0
            ? node.target[node.target.length - 1]
            : null;
          if (!selector || typeof selector !== 'string') continue;
          try {
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel);
              if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            }, selector);
            const handle = await page.$(selector);
            if (!handle) continue;
            const box = await handle.boundingBox();
            if (!box || box.width === 0 || box.height === 0) { await handle.dispose(); continue; }
            const pad = 8;
            const clip = {
              x: Math.max(0, box.x - pad),
              y: Math.max(0, box.y - pad),
              width: Math.min(box.width + pad * 2, viewportWidth),
              height: Math.min(box.height + pad * 2, viewportHeight),
            };
            const buf = await page.screenshot({ clip, type: 'jpeg', quality: 75 });
            node.screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(buf as Uint8Array).toString('base64')}`;
            await handle.dispose();
            perViolation++;
            violationScreenshots++;
          } catch {
            // skip — element detached, invalid selector, or viewport issue
          }
        }
      }

      return {
        id: uuidv4(),
        url,
        title: pageTitle || undefined,
        timestamp: new Date(),
        violations,
        passes: results.passes.length,
        incomplete: results.incomplete.length,
        inapplicable: results.inapplicable.length,
        passRules,
        incompleteRules,
        detectedElements: detectedElementsMap,
      };
    } catch (error) {
      console.error(`Error scanning ${url}:`, error);
      return {
        id: uuidv4(),
        url,
        timestamp: new Date(),
        violations: [],
        passes: 0,
        incomplete: 0,
        inapplicable: 0,
        passRules: [],
        incompleteRules: [],
      };
    } finally {
      await page.close();
    }
  }

  private generateReport(
    results: ScanResult[], 
    startTime: Date, 
    endTime: Date
  ): ScanReport {
    const summary = {
      totalPages: results.length,
      totalViolations: results.reduce((sum, r) => sum + r.violations.length, 0),
      violationsByImpact: {} as Record<string, number>,
      violationsByType: {} as Record<string, number>,
      violationsByLevel: {} as Record<string, number>,
      manualFailCount: 0,
      auditedPages: 0,
    };

    // Calculate violations by impact, type, and level
    results.forEach(result => {
      if (result.manualAudit?.completed) {
        summary.auditedPages += 1;
      }
      summary.manualFailCount += result.manualAudit?.checks.filter(c => c.status === 'fail').length ?? 0;

      result.violations.forEach(violation => {
        summary.violationsByImpact[violation.impact] = 
          (summary.violationsByImpact[violation.impact] || 0) + 1;
        
        summary.violationsByType[violation.id] = 
          (summary.violationsByType[violation.id] || 0) + 1;

        const lvl = violation.level || 'best-practice';
        summary.violationsByLevel[lvl] = (summary.violationsByLevel[lvl] || 0) + 1;
      });
    });

    // Use the title of the root page (the one matching the crawl/sitemap URL)
    const rootUrl = this.options.label ?? this.options.sitemap;
    const normalize = (u: string) => { try { return new URL(u).href.replace(/\/$/, ''); } catch { return u; } };
    const rootNorm = normalize(rootUrl);
    const rootResult = results.find(r => normalize(r.url) === rootNorm);
    const pageTitle = rootResult?.title || results[0]?.title;

    return {
      id: uuidv4(),
      sitemap: rootUrl,
      pageTitle,
      startTime,
      endTime,
      auditType: this.options.auditType,
      wcagLevel: this.options.wcagLevel ?? 'AA',
      includeBestPractices: this.options.includeBestPractices ?? false,
      results,
      summary
    };
  }

  static mergeReports(reports: ScanReport[], options: { label?: string; outputSitemap?: string } = {}): ScanReport {
    if (!reports.length) {
      throw new Error('No reports to merge');
    }

    const combinedResults = reports.flatMap(r => r.results);
    const startTime = new Date(Math.min(...reports.map(r => new Date(r.startTime).getTime())));
    const endTime = new Date(Math.max(...reports.map(r => new Date(r.endTime).getTime())));

    const summary = {
      totalPages: combinedResults.length,
      totalViolations: combinedResults.reduce((sum, r) => sum + r.violations.length, 0),
      violationsByImpact: {} as Record<string, number>,
      violationsByType: {} as Record<string, number>,
      violationsByLevel: {} as Record<string, number>,
      manualFailCount: 0,
      auditedPages: 0,
    };

    combinedResults.forEach(result => {
      if (result.manualAudit?.completed) {
        summary.auditedPages += 1;
      }
      summary.manualFailCount += result.manualAudit?.checks.filter(c => c.status === 'fail').length ?? 0;

      result.violations.forEach(violation => {
        summary.violationsByImpact[violation.impact] = (summary.violationsByImpact[violation.impact] || 0) + 1;
        summary.violationsByType[violation.id] = (summary.violationsByType[violation.id] || 0) + 1;
        const lvl = violation.level || 'best-practice';
        summary.violationsByLevel[lvl] = (summary.violationsByLevel[lvl] || 0) + 1;
      });
    });

    const first = reports[0];

    let rootPageTitle = first.pageTitle;
    const sitemapBase = options.outputSitemap || first.sitemap;
    try {
      const sitemapUrl = new URL(sitemapBase);
      const rootUrl = `${sitemapUrl.origin}/`;
      const rootResult = combinedResults.find((r) => {
        try {
          return new URL(r.url).href.replace(/\/$/, '') === rootUrl.replace(/\/$/, '');
        } catch {
          return r.url.replace(/\/$/, '') === rootUrl.replace(/\/$/, '');
        }
      });
      if (rootResult?.title) {
        rootPageTitle = rootResult.title;
      }
    } catch {
      // keep first.pageTitle when sitemapBase is not a URL
    }

    return {
      id: uuidv4(),
      sitemap: options.outputSitemap || first.sitemap,
      pageTitle: rootPageTitle,
      startTime,
      endTime,
      auditType: first.auditType,
      wcagLevel: first.wcagLevel,
      includeBestPractices: first.includeBestPractices,
      results: combinedResults,
      summary
    };
  }

  /**
   * Look for a wcag level indicator in the axe tags.  Returns
   * 'A', 'AA', 'AAA' or 'best-practice'.
   */
  private deriveLevel(tags: string[]): 'A'|'AA'|'AAA'|'best-practice' {
    for (const t of tags) {
      const m = t.match(/wcag[0-9.]*([a]{1,3})$/i);
      if (m) {
        const suffix = m[1].toUpperCase();
        if (suffix === 'AAA' || suffix === 'AA' || suffix === 'A') {
          return suffix as 'A'|'AA'|'AAA';
        }
      }
    }
    return 'best-practice';
  }
}