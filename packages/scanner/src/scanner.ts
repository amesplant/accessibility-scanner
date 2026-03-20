import puppeteer, { Browser } from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { XMLParser } from 'fast-xml-parser';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScanResult, ScanReport, DetectedElement } from '@accessibility-scanner/shared';

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

    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: this.options.useGoogleSso ? false : this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    if (this.options.useGoogleSso) {
      launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      launchOptions.userDataDir = this.options.googleSsoProfilePath
        ?? `${process.env.HOME}/Library/Application Support/Google/Chrome`;
    }

    this.browser = await puppeteer.launch(launchOptions);

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
      if (this.options.basicAuth?.username) {
        await page.authenticate({
          username: this.options.basicAuth.username,
          password: this.options.basicAuth.password,
        });
      }

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
      const [results, pageTitle, rawElements, rawMedia, rawCaptions] = await Promise.all([
        axe.analyze(),
        page.title(),
        this.extractNonTextElements(page),
        this.extractMediaElements(page),
        this.extractCaptionsElements(page),
      ]);

      const processElements = (raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] =>
        raw.map(el => {
          const base = { ...el, id: uuidv4() };
          if (base.isDecorative) {
            return { ...base, auditStatus: 'pass' as const, auditComment: 'Decorative — correctly hidden from screen readers.' };
          }
          if (base.textAlternative === null) {
            return { ...base, auditStatus: 'fail' as const, auditComment: 'No text alternative detected — screen reader will not announce this element.' };
          }
          return base;
        });

      const detectedElements = processElements(rawElements);
      const detectedMedia = processElements(rawMedia);
      const detectedCaptions: DetectedElement[] = rawCaptions.map(el => ({
        ...el,
        id: uuidv4(),
        auditStatus: el.textAlternative !== null ? 'pass' as const : 'fail' as const,
        auditComment: el.textAlternative !== null
          ? 'Captions track detected.'
          : 'No captions track detected — videos with speech or meaningful audio require synchronized captions.',
      }));

      // Add highlight + label styles once for all context screenshots
      await page.addStyleTag({
        content: `
          [data-a11y-highlight] {
            outline: 4px solid #facc15 !important;
            outline-offset: 4px !important;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.55) !important;
            position: relative !important;
            z-index: 2147483640 !important;
          }
          [data-a11y-label] {
            position: fixed !important;
            z-index: 2147483647 !important;
            background: #facc15 !important;
            color: #000 !important;
            font: bold 12px/1.5 system-ui,sans-serif !important;
            padding: 5px 10px !important;
            border-radius: 4px !important;
            max-width: 320px !important;
            word-break: break-word !important;
            pointer-events: none !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
          }
        `,
      });

      const viewportWidth: number = await page.evaluate(() => window.innerWidth);
      const viewportHeight: number = await page.evaluate(() => window.innerHeight);

      // Capture screenshots using data-a11y-scan-id for reliable element lookup — cap at 30
      // Process 1.1.1 elements first, then 1.2.1 media elements (offsets avoid ID collisions
      // since extractMediaElements uses its own a11y-media-N attribute namespace)
      for (let i = 0; i < Math.min(detectedElements.length, 30); i++) {
        const el = detectedElements[i];
        const scanAttr = `a11y-${i}`;
        try {
          // Scroll into view and tag the element
          const visible = await page.evaluate((idx: string) => {
            const node = document.querySelector(`[data-a11y-scan-id="${idx}"]`) as HTMLElement | null;
            if (!node) return false;
            node.scrollIntoView({ behavior: 'instant', block: 'center' });
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }, scanAttr);

          if (!visible) continue;

          const handle = await page.$(`[data-a11y-scan-id="${scanAttr}"]`);
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

          // Element-level crop screenshot
          const elBuf = await page.screenshot({ clip, type: 'jpeg', quality: 80 });
          el.screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(elBuf as Uint8Array).toString('base64')}`;

          // Context screenshot: yellow outline, dimmed surroundings, labelled annotation
          await handle.evaluate(
            (node: Element, labelText: string) => {
              node.setAttribute('data-a11y-highlight', 'true');

              // Inject floating label near the element
              const rect = node.getBoundingClientRect();
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const label = document.createElement('div');
              label.setAttribute('data-a11y-label', 'true');
              label.textContent = labelText;
              document.body.appendChild(label);

              // Position: above element if room, otherwise below
              const approxLabelH = 36;
              const top = rect.top > approxLabelH + 8
                ? rect.top - approxLabelH - 6
                : Math.min(rect.bottom + 6, vh - approxLabelH - 4);
              label.style.top = `${Math.max(4, top)}px`;
              label.style.left = `${Math.max(4, Math.min(rect.left, vw - 324))}px`;
            },
            (() => {
              const typeLabel: Record<string, string> = {
                'img': 'Image', 'input-image': 'Image Input', 'svg': 'SVG',
                'canvas': 'Canvas', 'video': 'Video', 'button-icon': 'Icon Button',
                'role-img': 'Role=img', 'area': 'Image Map Area', 'object': 'Object',
                'audio': 'Audio', 'video-only': 'Video',
              };
              const label = typeLabel[el.elementType] ?? el.elementType;
              return el.textAlternative
                ? `${label}: \u201c${el.textAlternative}\u201d`
                : `${label}: No text alternative`;
            })(),
          );

          const ctxBuf = await page.screenshot({ type: 'jpeg', quality: 75 });
          el.contextScreenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(ctxBuf as Uint8Array).toString('base64')}`;

          // Clean up highlight + label
          await handle.evaluate((node: Element) => {
            node.removeAttribute('data-a11y-highlight');
            document.querySelector('[data-a11y-label]')?.remove();
          });
          await handle.dispose();

        } catch {
          // skip — element hidden, detached, or viewport issue
        }
      }

      // Screenshots for 1.2.1 media elements
      const mediaTypeLabels: Record<string, string> = { 'audio': 'Audio', 'video-only': 'Video' };
      for (let i = 0; i < Math.min(detectedMedia.length, 30); i++) {
        const el = detectedMedia[i];
        const scanAttr = `a11y-media-${i}`;
        try {
          const visible = await page.evaluate((idx: string) => {
            const node = document.querySelector(`[data-a11y-media-scan-id="${idx}"]`) as HTMLElement | null;
            if (!node) return false;
            node.scrollIntoView({ behavior: 'instant', block: 'center' });
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }, scanAttr);

          if (!visible) continue;

          const handle = await page.$(`[data-a11y-media-scan-id="${scanAttr}"]`);
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

          const elBuf = await page.screenshot({ clip, type: 'jpeg', quality: 80 });
          el.screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(elBuf as Uint8Array).toString('base64')}`;

          await handle.evaluate(
            (node: Element, labelText: string) => {
              node.setAttribute('data-a11y-highlight', 'true');
              const rect = node.getBoundingClientRect();
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const label = document.createElement('div');
              label.setAttribute('data-a11y-label', 'true');
              label.textContent = labelText;
              document.body.appendChild(label);
              const approxLabelH = 36;
              const top = rect.top > approxLabelH + 8
                ? rect.top - approxLabelH - 6
                : Math.min(rect.bottom + 6, vh - approxLabelH - 4);
              label.style.top = `${Math.max(4, top)}px`;
              label.style.left = `${Math.max(4, Math.min(rect.left, vw - 324))}px`;
            },
            (() => {
              const label = mediaTypeLabels[el.elementType] ?? el.elementType;
              return el.textAlternative
                ? `${label}: \u201c${el.textAlternative}\u201d`
                : `${label}: No alternative`;
            })(),
          );

          const ctxBuf = await page.screenshot({ type: 'jpeg', quality: 75 });
          el.contextScreenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(ctxBuf as Uint8Array).toString('base64')}`;

          await handle.evaluate((node: Element) => {
            node.removeAttribute('data-a11y-highlight');
            document.querySelector('[data-a11y-label]')?.remove();
          });
          await handle.dispose();
        } catch {
          // skip — element hidden, detached, or viewport issue
        }
      }

      // Screenshots for 1.2.2 captions elements
      const captionsTypeLabels: Record<string, string> = { 'video': 'Video' };
      for (let i = 0; i < Math.min(detectedCaptions.length, 30); i++) {
        const el = detectedCaptions[i];
        const scanAttr = `a11y-captions-${i}`;
        try {
          const visible = await page.evaluate((idx: string) => {
            const node = document.querySelector(`[data-a11y-captions-scan-id="${idx}"]`) as HTMLElement | null;
            if (!node) return false;
            node.scrollIntoView({ behavior: 'instant', block: 'center' });
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }, scanAttr);

          if (!visible) continue;

          const handle = await page.$(`[data-a11y-captions-scan-id="${scanAttr}"]`);
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

          const elBuf = await page.screenshot({ clip, type: 'jpeg', quality: 80 });
          el.screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(elBuf as Uint8Array).toString('base64')}`;

          await handle.evaluate(
            (node: Element, labelText: string) => {
              node.setAttribute('data-a11y-highlight', 'true');
              const rect = node.getBoundingClientRect();
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const label = document.createElement('div');
              label.setAttribute('data-a11y-label', 'true');
              label.textContent = labelText;
              document.body.appendChild(label);
              const approxLabelH = 36;
              const top = rect.top > approxLabelH + 8
                ? rect.top - approxLabelH - 6
                : Math.min(rect.bottom + 6, vh - approxLabelH - 4);
              label.style.top = `${Math.max(4, top)}px`;
              label.style.left = `${Math.max(4, Math.min(rect.left, vw - 324))}px`;
            },
            (() => {
              const label = captionsTypeLabels[el.elementType] ?? el.elementType;
              return el.textAlternative
                ? `${label}: \u201c${el.textAlternative}\u201d`
                : `${label}: No captions track`;
            })(),
          );

          const ctxBuf = await page.screenshot({ type: 'jpeg', quality: 75 });
          el.contextScreenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(ctxBuf as Uint8Array).toString('base64')}`;

          await handle.evaluate((node: Element) => {
            node.removeAttribute('data-a11y-highlight');
            document.querySelector('[data-a11y-label]')?.remove();
          });
          await handle.dispose();
        } catch {
          // skip — element hidden, detached, or viewport issue
        }
      }

      const detectedElementsMap: NonNullable<ScanResult['detectedElements']> = {
        '1.1.1': detectedElements,
      };
      if (detectedMedia.length > 0) {
        detectedElementsMap['1.2.1'] = detectedMedia;
      }
      if (detectedCaptions.length > 0) {
        detectedElementsMap['1.2.2'] = detectedCaptions;
      }

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
        inapplicable: 0
      };
    } finally {
      await page.close();
    }
  }

  private async extractNonTextElements(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
    return page.evaluate(() => {
      function truncHtml(html: string): string {
        return html.length > 500 ? html.slice(0, 500) + '…' : html;
      }

      function getSelector(el: Element): string {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const parts: string[] = [];
        let cur: Element | null = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          let seg = cur.tagName.toLowerCase();
          if ((cur as HTMLElement).id) {
            seg = `#${CSS.escape((cur as HTMLElement).id)}`;
            parts.unshift(seg);
            break;
          }
          const parent = cur.parentElement;
          if (parent) {
            const sameTag = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
            if (sameTag.length > 1) seg += `:nth-of-type(${sameTag.indexOf(cur as HTMLElement) + 1})`;
          }
          parts.unshift(seg);
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      }

      function resolveAriaLabelledby(el: Element): string | null {
        const ids = el.getAttribute('aria-labelledby');
        if (!ids) return null;
        const text = ids.split(/\s+/)
          .map(id => document.getElementById(id)?.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        return text || null;
      }

      function getTextAlt(el: Element): string | null {
        const labelledby = resolveAriaLabelledby(el);
        if (labelledby) return labelledby;
        const ariaLabel = el.getAttribute('aria-label')?.trim();
        if (ariaLabel) return ariaLabel;
        const alt = el.getAttribute('alt');
        if (alt !== null) return alt;
        const title = el.getAttribute('title')?.trim();
        if (title) return title;
        return null;
      }

      function checkDecorative(el: Element): boolean {
        const alt = el.getAttribute('alt');
        const role = el.getAttribute('role');
        return alt === '' || role === 'presentation' || role === 'none';
      }

      const elements: any[] = [];

      // Tag element with a scan-ID for reliable Puppeteer lookup after evaluate() returns
      function tag(el: Element, data: any) {
        const scanId = `a11y-${elements.length}`;
        el.setAttribute('data-a11y-scan-id', scanId);
        elements.push(data);
      }

      // 1. <img>
      document.querySelectorAll('img').forEach(el => {
        const alt = el.getAttribute('alt');
        tag(el, {
          elementType: 'img',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: alt !== null ? alt : null,
          isDecorative: checkDecorative(el),
          auditStatus: 'not-reviewed',
        });
      });

      // 2. <input type="image">
      document.querySelectorAll('input[type="image"]').forEach(el => {
        const alt = el.getAttribute('alt');
        tag(el, {
          elementType: 'input-image',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: alt !== null ? alt : null,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      // 3. <svg> (skip aria-hidden ones)
      document.querySelectorAll('svg').forEach(el => {
        if (el.getAttribute('aria-hidden') === 'true') return;
        const role = el.getAttribute('role');
        const titleEl = el.querySelector('title');
        const titleText = titleEl?.textContent?.trim() || null;
        const textAlt = resolveAriaLabelledby(el)
          || el.getAttribute('aria-label')?.trim()
          || titleText
          || null;
        const svgHtml = el.outerHTML;
        tag(el, {
          elementType: 'svg',
          html: truncHtml(svgHtml.length > 200 ? svgHtml.slice(0, svgHtml.indexOf('>') + 1) + '…' : svgHtml),
          selector: getSelector(el),
          textAlternative: textAlt || null,
          isDecorative: role === 'presentation' || role === 'none',
          auditStatus: 'not-reviewed',
        });
      });

      // 4. <canvas>
      document.querySelectorAll('canvas').forEach(el => {
        tag(el, {
          elementType: 'canvas',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: getTextAlt(el),
          isDecorative: checkDecorative(el),
          auditStatus: 'not-reviewed',
        });
      });

      // 5. <video>
      document.querySelectorAll('video').forEach(el => {
        const hasCaption = el.querySelector('track[kind="captions"]') !== null;
        tag(el, {
          elementType: 'video',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: hasCaption ? 'Has captions track' : null,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      // 6. Icon-only buttons (no visible text content)
      document.querySelectorAll('button, [role="button"]').forEach(el => {
        if (el.getAttribute('aria-hidden') === 'true') return;
        const visibleText = el.textContent?.trim() || '';
        if (visibleText) return;
        tag(el, {
          elementType: 'button-icon',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: getTextAlt(el),
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      // 7. [role="img"] (non-SVG, non-hidden)
      document.querySelectorAll('[role="img"]').forEach(el => {
        if (el.tagName.toLowerCase() === 'svg') return;
        if (el.getAttribute('aria-hidden') === 'true') return;
        tag(el, {
          elementType: 'role-img',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: getTextAlt(el),
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      // 8. <area>
      document.querySelectorAll('area').forEach(el => {
        const alt = el.getAttribute('alt');
        tag(el, {
          elementType: 'area',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: alt !== null ? alt : null,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      // 9. <object>
      document.querySelectorAll('object').forEach(el => {
        const textAlt = getTextAlt(el) || el.textContent?.trim() || null;
        tag(el, {
          elementType: 'object',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      return elements;
    }) as Promise<Omit<DetectedElement, 'id'>[]>;
  }

  private async extractMediaElements(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
    return page.evaluate(() => {
      function truncHtml(html: string): string {
        return html.length > 500 ? html.slice(0, 500) + '…' : html;
      }

      function getSelector(el: Element): string {
        if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
        const parts: string[] = [];
        let cur: Element | null = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          let seg = cur.tagName.toLowerCase();
          if ((cur as HTMLElement).id) {
            seg = `#${CSS.escape((cur as HTMLElement).id)}`;
            parts.unshift(seg);
            break;
          }
          const parent = cur.parentElement;
          if (parent) {
            const sameTag = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
            if (sameTag.length > 1) seg += `:nth-of-type(${sameTag.indexOf(cur as HTMLElement) + 1})`;
          }
          parts.unshift(seg);
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      }

      function resolveAriaLabelledby(el: Element): string | null {
        const ids = el.getAttribute('aria-labelledby');
        if (!ids) return null;
        const text = ids.split(/\s+/)
          .map(id => document.getElementById(id)?.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        return text || null;
      }

      const elements: any[] = [];

      function tag(el: Element, data: any) {
        const scanId = `a11y-media-${elements.length}`;
        el.setAttribute('data-a11y-media-scan-id', scanId);
        elements.push(data);
      }

      // 1. <audio> elements — need a transcript or text alternative (WCAG 1.2.1)
      document.querySelectorAll('audio').forEach(el => {
        const hasDescTrack = el.querySelector('track[kind="descriptions"]') !== null;
        const hasSubtitleTrack = el.querySelector('track[kind="subtitles"]') !== null;
        const ariaLabel = resolveAriaLabelledby(el)
          || el.getAttribute('aria-label')?.trim()
          || null;
        const hasAriaDescribedby = el.hasAttribute('aria-describedby');
        let textAlt: string | null = null;
        if (hasDescTrack) textAlt = 'Has description track';
        else if (hasSubtitleTrack) textAlt = 'Has subtitles track';
        else if (ariaLabel) textAlt = ariaLabel;
        else if (hasAriaDescribedby) textAlt = 'Has aria-describedby reference';
        tag(el, {
          elementType: 'audio',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      // 2. Muted <video> elements — likely video-only, need a text alternative (WCAG 1.2.1)
      document.querySelectorAll('video').forEach(el => {
        const isMuted = (el as HTMLVideoElement).muted || el.hasAttribute('muted');
        if (!isMuted) return;
        const hasDescTrack = el.querySelector('track[kind="descriptions"]') !== null;
        const ariaLabel = resolveAriaLabelledby(el)
          || el.getAttribute('aria-label')?.trim()
          || el.getAttribute('title')?.trim()
          || null;
        let textAlt: string | null = null;
        if (hasDescTrack) textAlt = 'Has description track';
        else if (ariaLabel) textAlt = ariaLabel;
        tag(el, {
          elementType: 'video-only',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      return elements;
    }) as Promise<Omit<DetectedElement, 'id'>[]>;
  }

  private async extractCaptionsElements(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
    return page.evaluate(() => {
      function truncHtml(html: string): string {
        return html.length > 500 ? html.slice(0, 500) + '…' : html;
      }

      function getSelector(el: Element): string {
        if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
        const parts: string[] = [];
        let cur: Element | null = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          let seg = cur.tagName.toLowerCase();
          if ((cur as HTMLElement).id) {
            seg = `#${CSS.escape((cur as HTMLElement).id)}`;
            parts.unshift(seg);
            break;
          }
          const parent = cur.parentElement;
          if (parent) {
            const sameTag = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
            if (sameTag.length > 1) seg += `:nth-of-type(${sameTag.indexOf(cur as HTMLElement) + 1})`;
          }
          parts.unshift(seg);
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      }

      const elements: any[] = [];

      function tag(el: Element, data: any) {
        const scanId = `a11y-captions-${elements.length}`;
        el.setAttribute('data-a11y-captions-scan-id', scanId);
        elements.push(data);
      }

      // Non-muted <video> elements — likely have audio/speech, need synchronized captions (WCAG 1.2.2)
      document.querySelectorAll('video').forEach(el => {
        const isMuted = (el as HTMLVideoElement).muted || el.hasAttribute('muted');
        if (isMuted) return; // muted videos are video-only, covered by 1.2.1

        const hasCaptionsTrack  = el.querySelector('track[kind="captions"]')  !== null;
        const hasSubtitlesTrack = el.querySelector('track[kind="subtitles"]') !== null;

        let textAlt: string | null = null;
        if (hasCaptionsTrack)        textAlt = 'Has captions track';
        else if (hasSubtitlesTrack)  textAlt = 'Has subtitles track';

        tag(el, {
          elementType: 'video',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt,
          isDecorative: false,
          auditStatus: 'not-reviewed',
        });
      });

      return elements;
    }) as Promise<Omit<DetectedElement, 'id'>[]>;
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
      wcagLevel: this.options.wcagLevel ?? 'AA',
      includeBestPractices: this.options.includeBestPractices ?? false,
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