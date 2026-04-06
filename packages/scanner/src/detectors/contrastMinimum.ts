import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 1.4.3 — Contrast (Minimum) — on-demand detection only */

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

type RawElement = {
  html: string;
  selector: string;
  fg: string;
  bg: string;
  ratio: number;
  threshold: number;
  fontSize: string;
  fontWeight: string;
  isLargeText: boolean;
  textSnippet: string;
};

/** Opens a page with the given color scheme set at both the browser and JS layer. */
async function openColorSchemePage(
  puppeteer: any,
  url: string,
  colorScheme: 'light' | 'dark',
) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-features=WebContentsForceDark',
    ...(colorScheme === 'dark' ? ['--force-dark-mode'] : []),
  ];
  const browser = await puppeteer.launch({ headless: true, args });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: colorScheme }],
  });
  await page.evaluateOnNewDocument(`
    (() => {
      const _scheme = '${colorScheme}';
      const _orig = window.matchMedia.bind(window);
      window.matchMedia = function(query) {
        if (typeof query === 'string' && query.toLowerCase().includes('prefers-color-scheme')) {
          const matches =
            (_scheme === 'dark'  && query.toLowerCase().includes('dark'))  ||
            (_scheme === 'light' && query.toLowerCase().includes('light'));
          return { matches, media: query, onchange: null,
            addListener: () => {}, removeListener: () => {},
            addEventListener: () => {}, removeEventListener: () => {},
            dispatchEvent: () => true };
        }
        return _orig(query);
      };
    })();
  `);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => new Promise<void>(r => setTimeout(r, 500)));
  return { browser, page };
}

/** Takes a per-element screenshot (scrollIntoView → clip to bounding box). */
async function takeElementScreenshot(page: any, selector: string): Promise<string | undefined> {
  try {
    const handle = await page.$(selector);
    if (!handle) return undefined;
    await page.evaluate((el: Element) => (el as HTMLElement).scrollIntoView({ block: 'center' }), handle);
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 150)));
    const box = await handle.boundingBox();
    if (!box || box.width === 0 || box.height === 0) return undefined;
    const PADDING = 8;
    const clip = {
      x: Math.max(0, box.x - PADDING),
      y: Math.max(0, box.y - PADDING),
      width: box.width + PADDING * 2,
      height: box.height + PADDING * 2,
    };
    const buf = await page.screenshot({ clip, type: 'jpeg', quality: 80 });
    return `data:image/jpeg;base64,${Buffer.from(buf as Uint8Array).toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Launches its own browser and detects text elements failing WCAG contrast thresholds. */
export async function detectContrastMinimum(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
  const puppeteer = (await import('puppeteer')).default;

  // ── Pass 1: light mode — detect failing elements + capture light screenshots ──
  onProgress?.({ type: 'status', message: 'Loading page (light mode) — scanning text contrast…' });
  const { browser: lightBrowser, page: lightPage } = await openColorSchemePage(puppeteer, url, 'light');

  let rawElements: RawElement[] = [];
  try {
    await lightPage.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

    rawElements = await lightPage.evaluate((): RawElement[] => {
      const { truncHtml, getSelector } = window.__a11yScanUtils;

      function parseRgb(color: string): [number, number, number] | null {
        const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
      }
      function getAlpha(color: string): number {
        const m = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
        return m ? parseFloat(m[1]) : 1;
      }
      function getEffectiveBg(el: Element): [number, number, number] {
        let node: Element | null = el;
        while (node && node.tagName !== 'HTML') {
          const bg = window.getComputedStyle(node).backgroundColor;
          const rgb = parseRgb(bg);
          if (rgb && getAlpha(bg) > 0.05) return rgb;
          node = node.parentElement;
        }
        return [255, 255, 255];
      }
      function relativeLuminance([r, g, b]: [number, number, number]): number {
        return [r, g, b].reduce((acc, c, i) => {
          const s = c / 255;
          const l = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          return acc + l * [0.2126, 0.7152, 0.0722][i];
        }, 0);
      }
      function contrastRatio(c1: [number, number, number], c2: [number, number, number]): number {
        const l1 = relativeLuminance(c1);
        const l2 = relativeLuminance(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      function rgbToHex([r, g, b]: [number, number, number]): string {
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      }

      const seen = new Set<Element>();
      const results: RawElement[] = [];
      const MAX_RESULTS = 150;

      const candidates = document.querySelectorAll<HTMLElement>(
        'p, h1, h2, h3, h4, h5, h6, a, span, li, td, th, label, button, dt, dd, caption, figcaption, blockquote, summary, div',
      );

      for (const el of Array.from(candidates)) {
        if (results.length >= MAX_RESULTS) break;
        if (seen.has(el)) continue;

        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        if (!directText) continue;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const fgRgb = parseRgb(style.color);
        if (!fgRgb) continue;

        const bgRgb = getEffectiveBg(el);
        const ratio = contrastRatio(fgRgb, bgRgb);
        const fontSize = parseFloat(style.fontSize) || 16;
        const isBold = parseInt(style.fontWeight) >= 700 || style.fontWeight === 'bold';
        const isLargeText = fontSize >= 24 || (fontSize >= 18.67 && isBold);
        const threshold = isLargeText ? 3 : 4.5;

        if (ratio >= threshold) continue;
        seen.add(el);

        results.push({
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          fg: rgbToHex(fgRgb),
          bg: rgbToHex(bgRgb),
          ratio: Math.round(ratio * 100) / 100,
          threshold,
          fontSize: `${Math.round(fontSize)}px`,
          fontWeight: isBold ? 'bold' : 'normal',
          isLargeText,
          textSnippet: directText.slice(0, 60),
        });
      }
      return results;
    });

    onProgress?.({ type: 'status', message: `Found ${rawElements.length} element${rawElements.length !== 1 ? 's' : ''} failing contrast — capturing light screenshots…` });

    // Capture light screenshots
    const lightScreenshots = new Map<string, string | undefined>();
    for (const raw of rawElements) {
      lightScreenshots.set(raw.selector, await takeElementScreenshot(lightPage, raw.selector));
    }

    onProgress?.({ type: 'status', message: 'Capturing dark-mode screenshots…' });

    // ── Pass 2: dark mode — screenshots only ──
    const darkScreenshots = new Map<string, string | undefined>();
    const { browser: darkBrowser, page: darkPage } = await openColorSchemePage(puppeteer, url, 'dark');
    try {
      for (const raw of rawElements) {
        darkScreenshots.set(raw.selector, await takeElementScreenshot(darkPage, raw.selector));
      }
    } finally {
      await darkBrowser.close();
    }

    // ── Assemble results ──
    const results: Omit<DetectedElement, 'id'>[] = [];
    for (const raw of rawElements) {
      const textType = raw.isLargeText ? 'large text' : 'normal text';
      const el: Omit<DetectedElement, 'id'> = {
        elementType: 'low-contrast' as const,
        html: raw.html,
        selector: raw.selector,
        textAlternative: `"${raw.textSnippet}"`,
        isDecorative: false,
        auditStatus: 'fail' as const,
        auditComment: `Contrast ratio ${raw.ratio}:1 (${textType}, threshold ${raw.threshold}:1) — fg: ${raw.fg}, bg: ${raw.bg}`,
        screenReaderText: `${raw.fontSize} ${raw.fontWeight} text: "${raw.textSnippet}" — contrast ${raw.ratio}:1 fails ${raw.threshold}:1 threshold`,
        screenshotDataUrl: lightScreenshots.get(raw.selector),
        darkScreenshotDataUrl: darkScreenshots.get(raw.selector),
      };
      results.push(el);
      onProgress?.({ type: 'element', element: el });
    }

    return results;
  } finally {
    await lightBrowser.close();
  }
}
