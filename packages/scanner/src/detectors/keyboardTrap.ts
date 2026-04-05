import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 2.1.2 — No Keyboard Trap (on-demand detection only, not part of the scan pipeline) */

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

/**
 * Flags elements that are potential keyboard trap risks:
 *   1. Elements with keydown/keyup JS listeners that may intercept navigation keys
 *   2. Modal dialogs and ARIA modal containers (native <dialog>, role="dialog", aria-modal)
 *   3. Iframes and embedded content where focus can cross frame boundaries
 *   4. Elements with positive tabindex values that distort natural tab order
 */
export async function detectKeyboardTrap(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Stamp elements that receive keyboard event listeners before page scripts run
    await page.evaluateOnNewDocument(() => {
      const _orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if ((type === 'keydown' || type === 'keyup' || type === 'keypress') && this instanceof Element) {
          if (!(this as HTMLElement).hasAttribute('data-a11y-key-handler')) {
            (this as HTMLElement).setAttribute('data-a11y-key-handler', type);
          }
        }
        return _orig.call(this, type, listener, options);
      };
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 500)));

    onProgress?.({ type: 'status', message: 'Page loaded — scanning for keyboard trap risks…' });

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

      function isVisible(el: HTMLElement): boolean {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      }

      function addElement(el: HTMLElement, reason: string) {
        if (seen.has(el)) return;
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

      // Category 1: Elements with keyboard event listeners (may intercept navigation)
      document.querySelectorAll<HTMLElement>('[data-a11y-key-handler]').forEach(el => {
        if (!isVisible(el)) return;
        const type = el.getAttribute('data-a11y-key-handler') ?? 'keydown';
        addElement(el, `${type} handler — verify Tab and Escape can still navigate away`);
      });

      // Category 2: Modal dialogs and ARIA modal containers
      document.querySelectorAll<HTMLElement>('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]').forEach(el => {
        addElement(el, 'modal/dialog — verify focus is trapped inside and Escape closes it');
      });

      // Category 3: Iframes and embeds where focus can cross frame boundaries
      document.querySelectorAll<HTMLElement>('iframe, embed').forEach(el => {
        if (!isVisible(el)) return;
        const tag = el.tagName.toLowerCase();
        addElement(el, `${tag} — verify keyboard focus can exit this embedded content`);
      });

      // Category 4: Positive tabindex creates non-natural tab order
      document.querySelectorAll<HTMLElement>('[tabindex]').forEach(el => {
        if (!isVisible(el)) return;
        const ti = parseInt(el.getAttribute('tabindex') ?? '0', 10);
        if (ti > 0) {
          addElement(el, `tabindex="${ti}" — positive value distorts natural tab order`);
        }
      });

      return results;
    });

    onProgress?.({ type: 'status', message: `Found ${rawElements.length} potential trap risk${rawElements.length !== 1 ? 's' : ''} — capturing screenshots…` });

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
        elementType: 'keyboard-trap' as const,
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
