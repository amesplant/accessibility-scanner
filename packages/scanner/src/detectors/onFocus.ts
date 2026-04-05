import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 3.2.1 — On Focus (on-demand detection only, not part of the scan pipeline) */

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

/**
 * Detects elements that may trigger a context change on focus.
 * Intercepts addEventListener('focus'/'focusin') calls via evaluateOnNewDocument
 * before page scripts run, then collects stamped elements with per-element screenshots.
 */
export async function detectOnPage(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Stamp elements that receive 'focus' or 'focusin' JS listeners before any page script runs
    await page.evaluateOnNewDocument(() => {
      const _orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if ((type === 'focus' || type === 'focusin') && this instanceof Element) {
          (this as HTMLElement).setAttribute('data-a11y-focus-trigger', 'true');
        }
        return _orig.call(this, type, listener, options);
      };
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 500)));
    onProgress?.({ type: 'status', message: 'Page loaded — scanning for focus triggers…' });

    // Inject browser utils
    await page.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

    // Collect all elements with focus triggers, onfocus attributes, or autofocus
    type RawElement = {
      html: string;
      selector: string;
      textAlternative: string | null;
      isDecorative: boolean;
      screenReaderText: string;
      reason: 'js-listener' | 'onfocus-attr' | 'autofocus';
    };

    const rawElements = await page.evaluate((): RawElement[] => {
      const { truncHtml, getSelector, getTextAlt } = window.__a11yScanUtils;
      const seen = new Set<Element>();
      const results: RawElement[] = [];

      function isVisible(el: HTMLElement): boolean {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      }

      function addElement(el: HTMLElement, reason: RawElement['reason']) {
        if (seen.has(el)) return;
        if (!isVisible(el)) return;
        seen.add(el);
        const tag = el.tagName.toLowerCase();
        const textAlt = getTextAlt(el);
        const reasonLabel =
          reason === 'js-listener' ? 'JS focus listener'
          : reason === 'onfocus-attr' ? 'onfocus attribute'
          : 'autofocus';
        results.push({
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt ?? `${tag} — ${reasonLabel}`,
          isDecorative: false,
          screenReaderText: `${tag} element with ${reasonLabel}${textAlt ? `: "${textAlt}"` : ''}`,
          reason,
        });
      }

      document.querySelectorAll<HTMLElement>('[data-a11y-focus-trigger]').forEach(el => addElement(el, 'js-listener'));
      document.querySelectorAll<HTMLElement>('[onfocus]').forEach(el => addElement(el, 'onfocus-attr'));
      document.querySelectorAll<HTMLElement>('[autofocus]').forEach(el => addElement(el, 'autofocus'));

      return results;
    });
    onProgress?.({ type: 'status', message: `Found ${rawElements.length} candidate element${rawElements.length !== 1 ? 's' : ''} — capturing screenshots…` });

    // Take a per-element screenshot (scrollIntoView → clip to bounding box)
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
        elementType: 'focus-trigger' as const,
        html: raw.html,
        selector: raw.selector,
        textAlternative: raw.textAlternative,
        isDecorative: false,
        auditStatus: 'not-reviewed' as const,
        screenReaderText: raw.screenReaderText,
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
