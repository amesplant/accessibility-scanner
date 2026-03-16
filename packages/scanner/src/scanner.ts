import puppeteer, { Browser } from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { XMLParser } from 'fast-xml-parser';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScanResult, ScanReport } from '@accessibility-scanner/shared';

export class SitemapScanner {
  private browser: Browser | null = null;
  private options: any;

  constructor(options: any) {
    this.options = options;
  }

  async scan(): Promise<ScanReport> {
    const signal: AbortSignal | undefined = this.options.signal;
    const urls: string[] = this.options.urls ?? await this.fetchSitemapUrls(this.options.sitemap);
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

  private async scanPage(url: string): Promise<ScanResult> {
    const page = await this.browser!.newPage();
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const axe = new AxePuppeteer(page);
      const [results, pageTitle] = await Promise.all([axe.analyze(), page.title()]);

      return {
        id: uuidv4(),
        url,
        title: pageTitle || undefined,
        timestamp: new Date(),
        violations: results.violations.map((v: any) => ({
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
            failureSummary: n.failureSummary
          }))
        })),
        passes: results.passes.length,
        incomplete: results.incomplete.length,
        inapplicable: results.inapplicable.length
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
        inapplicable: 0
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
      violationsByLevel: {} as Record<string, number>
    };

    // Calculate violations by impact, type, and level
    results.forEach(result => {
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
      results,
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