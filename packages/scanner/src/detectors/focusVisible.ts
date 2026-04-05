import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 2.4.7 — Focus Visible (on-demand detection only, not part of the scan pipeline) */

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

/**
 * Detects focusable elements whose focus indicator has been suppressed.
 * Three categories:
 *   1. CSS :focus/:focus-visible rules that set outline:none/0 without a replacement
 *   2. Global/universal resets that strip outlines broadly
 *   3. Focusable elements whose computed outline is none/0px with no box-shadow
 */
export async function detectFocusVisible(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
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
    onProgress?.({ type: 'status', message: 'Page loaded — scanning for focus-style issues…' });

    await page.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

    type RawElement = {
      html: string;
      selector: string;
      textAlternative: string | null;
      reason: string;
    };

    const rawElements = await page.evaluate((): RawElement[] => {
      const { truncHtml, getSelector, getTextAlt } = window.__a11yScanUtils;
      const seen = new Set<Element>();
      const results: RawElement[] = [];

      const FOCUSABLE_SELECTOR = [
        'a[href]', 'button:not([disabled])', 'input:not([disabled])',
        'select:not([disabled])', 'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])', 'details > summary',
      ].join(',');

      // Replacement properties that constitute a visible focus style
      function hasReplacementStyle(decl: CSSStyleDeclaration): boolean {
        if (decl.boxShadow && decl.boxShadow !== 'none') return true;
        if (decl.borderColor || decl.borderWidth || decl.border) {
          // only count border changes as replacement if they differ from base — heuristic
          return true;
        }
        if (decl.backgroundColor && decl.backgroundColor !== 'transparent' && decl.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;
        if (decl.textDecorationLine || decl.textDecoration) return true;
        if (decl.outlineWidth && decl.outlineWidth !== '0px') return true;
        return false;
      }

      function outlineRemoved(decl: CSSStyleDeclaration): boolean {
        const outline = decl.outline;
        const outlineWidth = decl.outlineWidth;
        const outlineStyle = decl.outlineStyle;
        return (
          outline === 'none' || outline === '0' ||
          outlineWidth === '0px' ||
          outlineStyle === 'none'
        );
      }

      function isVisible(el: HTMLElement): boolean {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      }

      function addElement(el: HTMLElement, reason: string) {
        if (seen.has(el)) return;
        if (!isVisible(el)) return;
        seen.add(el);
        const tag = el.tagName.toLowerCase();
        const textAlt = getTextAlt(el);
        results.push({
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt ?? `${tag} — ${reason}`,
          reason,
        });
      }

      // Category 1: CSS :focus / :focus-visible rules that remove outline without replacement
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules ?? [])) {
            if (!(rule instanceof CSSStyleRule)) continue;
            const sel = rule.selectorText;
            if (!sel.includes(':focus') && !sel.includes(':focus-visible') && !sel.includes(':focus-within')) continue;
            if (!outlineRemoved(rule.style)) continue;
            if (hasReplacementStyle(rule.style)) continue;

            // Strip pseudo-classes to get the base element selector
            const baseSelector = sel
              .split(',')
              .map(s => s.replace(/:focus-visible\b/g, '').replace(/:focus-within\b/g, '').replace(/:focus\b/g, '').trim())
              .filter(Boolean)
              .join(',');
            if (!baseSelector) continue;

            try {
              document.querySelectorAll<HTMLElement>(baseSelector).forEach(el => {
                if (!el.matches(FOCUSABLE_SELECTOR) && !el.closest(FOCUSABLE_SELECTOR)) return;
                addElement(el, `:focus rule sets outline:none with no replacement style`);
              });
            } catch { /* invalid selector — skip */ }
          }
        } catch { /* cross-origin stylesheet — skip */ }
      }

      // Category 2: Global resets — universal selectors or body/html that strip outlines
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules ?? [])) {
            if (!(rule instanceof CSSStyleRule)) continue;
            const sel = rule.selectorText.trim();
            const isGlobal = sel === '*' || sel === '*:focus' || sel === '*:focus-visible' || sel === 'html' || sel === 'body';
            if (!isGlobal) continue;
            if (!outlineRemoved(rule.style)) continue;
            if (hasReplacementStyle(rule.style)) continue;

            // Flag all visible focusable elements
            document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach(el => {
              addElement(el, `global ${sel} selector suppresses outline`);
            });
          }
        } catch { /* cross-origin stylesheet — skip */ }
      }

      // Category 3: Focusable elements with computed outline:none and no box-shadow
      document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach(el => {
        if (!isVisible(el)) return;
        const computed = window.getComputedStyle(el);
        if (!outlineRemoved(computed)) return;
        if (computed.boxShadow && computed.boxShadow !== 'none') return;
        addElement(el, 'computed outline: none with no box-shadow fallback');
      });

      return results;
    });
    onProgress?.({ type: 'status', message: `Found ${rawElements.length} element${rawElements.length !== 1 ? 's' : ''} with potential focus-style issues — capturing screenshots…` });

    // Per-element screenshot
    const results: Omit<DetectedElement, 'id'>[] = [];

    for (const raw of rawElements) {
      let screenshotDataUrl: string | undefined;
      try {
        const handle = await page.$(raw.selector);
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
        elementType: 'no-focus-style' as const,
        html: raw.html,
        selector: raw.selector,
        textAlternative: raw.textAlternative,
        isDecorative: false,
        auditStatus: 'not-reviewed' as const,
        screenReaderText: raw.reason,
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
