import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 2.4.4 — Link Purpose (In Context) */
export const CRITERION_ID = '2.4.4';
export const ATTR_PREFIX = 'a11y-link';
export const ALWAYS_INCLUDE = false;

export function getLabelText(el: DetectedElement): string {
  return el.textAlternative
    ? `Link: \u201c${el.textAlternative}\u201d`
    : `Link: Ambiguous text`;
}

export function processElements(raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] {
  return raw.map(el => ({
    ...el,
    id: uuidv4(),
    auditStatus: el.textAlternative !== null ? 'pass' as const : 'fail' as const,
    auditComment: el.textAlternative !== null
      ? `Descriptive accessible name: \u201c${el.textAlternative}\u201d`
      : 'Link text is ambiguous — the purpose cannot be determined from the link text alone.',
  }));
}

export async function extract(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
  return page.evaluate(() => {
    const { truncHtml, getSelector } = window.__a11yScanUtils;

    // Generic/ambiguous link text patterns that fail 2.4.4 without additional context
    const AMBIGUOUS_PATTERNS = /^(click here|here|read more|more|learn more|link|this|continue|details|info|information|go|view|see|see more|see all|show more|show all|find out more|find out|visit|open|download|get|get more|get started|start|begin|next|previous|prev|back|forward|full story|full article|article|page|more info|more information|more details|more here|this link|this page|this article)$/i;

    const elements: any[] = [];

    function tag(el: Element, data: any) {
      const scanId = `a11y-link-${elements.length}`;
      el.setAttribute('data-a11y-link-scan-id', scanId);
      elements.push(data);
    }

    document.querySelectorAll('a[href]').forEach(el => {
      // Compute accessible name: aria-labelledby > aria-label > link text content > title
      let accessibleName: string | null = null;

      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy.split(/\s+/)
          .map(id => document.getElementById(id)?.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        if (text) accessibleName = text;
      }

      if (!accessibleName) {
        const ariaLabel = el.getAttribute('aria-label')?.trim();
        if (ariaLabel) accessibleName = ariaLabel;
      }

      const linkText = el.textContent?.trim().replace(/\s+/g, ' ') || '';

      if (!accessibleName) {
        if (linkText) accessibleName = linkText;
      }

      if (!accessibleName) {
        const title = el.getAttribute('title')?.trim();
        if (title) accessibleName = title;
      }

      // Only surface links whose accessible name matches an ambiguous pattern
      if (!accessibleName || !AMBIGUOUS_PATTERNS.test(accessibleName)) return;

      tag(el, {
        elementType: 'link',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        // textAlternative = null signals a fail (ambiguous with no override)
        textAlternative: null,
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    return elements;
  }) as Promise<Omit<DetectedElement, 'id'>[]>;
}

// ---------------------------------------------------------------------------
// On-demand standalone detection (WCAG 2.4.4)
// ---------------------------------------------------------------------------

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

/** Launches its own browser and detects ambiguous links with per-element screenshots. */
export async function detectLinkPurpose(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 500)));

    onProgress?.({ type: 'status', message: 'Page loaded — scanning for ambiguous links…' });

    await page.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

    // Reuse the same extraction logic
    const rawElements = await extract(page);

    onProgress?.({ type: 'status', message: `Found ${rawElements.length} ambiguous link${rawElements.length !== 1 ? 's' : ''} — capturing screenshots…` });

    const results: Omit<DetectedElement, 'id'>[] = [];

    for (const raw of rawElements) {
      let screenshotDataUrl: string | undefined;
      try {
        const handle = await page.$(raw.selector!);
        if (handle) {
          await page.evaluate(el => (el as HTMLElement).scrollIntoView({ block: 'center' }), handle);
          await page.evaluate(() => new Promise<void>(r => setTimeout(r, 150)));
          const box = await handle.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            const PADDING = 8;
            const clip = {
              x: Math.max(0, box.x - PADDING),
              y: Math.max(0, box.y - PADDING),
              width: box.width + PADDING * 2,
              height: box.height + PADDING * 2,
            };
            const buf = await page.screenshot({ clip, type: 'jpeg', quality: 80 });
            screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(buf as Uint8Array).toString('base64')}`;
          }
        }
      } catch {
        // screenshot failed — continue without it
      }

      const el: Omit<DetectedElement, 'id'> = {
        ...raw,
        auditStatus: 'fail' as const,
        auditComment: 'Link text is ambiguous — the purpose cannot be determined from the link text alone.',
        screenReaderText: raw.html.replace(/<[^>]+>/g, '').trim() || 'ambiguous link',
        screenshotDataUrl,
      };
      results.push(el);
      onProgress?.({ type: 'element', element: el });
    }

    return results;
  } finally {
    await browser.close();
  }
}
