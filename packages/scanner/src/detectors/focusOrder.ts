import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';

/** WCAG 2.4.3 — Focus Order */
export const CRITERION_ID = '2.4.3';
export const ATTR_PREFIX = 'a11y-focus';
export const ALWAYS_INCLUDE = false;

export const VIEWPORTS = [
  { label: 'Mobile',  width: 375,  height: 812  },
  { label: 'Tablet',  width: 768,  height: 1024 },
  { label: 'Desktop', width: 1280, height: 900  },
] as const;

export type ViewportLabel = typeof VIEWPORTS[number]['label'];

export function getLabelText(el: DetectedElement): string {
  return el.textAlternative ?? 'Focus order map';
}

export function processElements(raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] {
  return raw.map(el => ({ ...el, id: uuidv4() }));
}

/** Count focusable elements at the current viewport without injecting visible badges. */
async function countFocusable(page: any): Promise<number> {
  return page.evaluate(() => {
    const SELECTOR = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'details > summary',
    ].join(', ');
    return Array.from(document.querySelectorAll(SELECTOR)).filter(el => {
      const s = window.getComputedStyle(el as HTMLElement);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    }).length;
  });
}

/**
 * Scan-time extract — returns one placeholder per viewport with focusable count.
 * No screenshots are taken here; they are generated on demand via the server endpoint.
 */
export async function extract(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
  const originalViewport = page.viewport() as { width: number; height: number } | null;
  const results: Omit<DetectedElement, 'id'>[] = [];

  for (const vp of VIEWPORTS) {
    try {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await page.evaluate(() => new Promise<void>(r => setTimeout(r, 200)));
      const count = await countFocusable(page);
      results.push({
        elementType: 'focus-order-map' as const,
        html: `<!-- ${vp.label} ${vp.width}×${vp.height} -->`,
        selector: 'body',
        textAlternative: `${vp.label} (${vp.width}px) — ${count} focusable element${count !== 1 ? 's' : ''}`,
        isDecorative: false,
        auditStatus: 'not-reviewed' as const,
        screenReaderText: `Focus order map at ${vp.label} viewport (${vp.width}px): ${count} focusable elements in tab order`,
      });
    } catch {
      // skip this viewport
    }
  }

  await page.setViewport(originalViewport ?? { width: 1280, height: 900 });
  return results;
}

// ---------------------------------------------------------------------------
// On-demand screenshot capture (used by the server endpoint)
// ---------------------------------------------------------------------------

async function injectBadgesAndCount(page: any): Promise<number> {
  return page.evaluate(() => {
    document.querySelectorAll('[data-a11y-focus-badge]').forEach((el: Element) => el.remove());
    document.querySelector('[data-a11y-focus-style]')?.remove();

    const SELECTOR = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'details > summary',
    ].join(', ');

    const all = Array.from(document.querySelectorAll(SELECTOR)) as HTMLElement[];
    const focusable = all.filter(el => {
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    });
    const positive = focusable.filter(el => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
    const natural  = focusable.filter(el => el.tabIndex === 0);
    const ordered  = [...positive, ...natural];

    const style = document.createElement('style');
    style.setAttribute('data-a11y-focus-style', 'true');
    style.textContent = `
      [data-a11y-focus-badge] {
        position: absolute !important;
        width: 22px !important; height: 22px !important;
        background: #facc15 !important; color: #000 !important;
        font: bold 11px/22px system-ui, sans-serif !important;
        text-align: center !important; border-radius: 50% !important;
        z-index: 2147483647 !important; pointer-events: none !important;
        box-shadow: 0 1px 4px rgba(0,0,0,0.45) !important;
        border: 1.5px solid rgba(0,0,0,0.3) !important;
        box-sizing: border-box !important;
      }
    `;
    document.head.appendChild(style);

    ordered.forEach((el, i) => {
      const rect  = el.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.setAttribute('data-a11y-focus-badge', 'true');
      badge.style.top  = `${Math.max(0, rect.top  + window.scrollY)}px`;
      badge.style.left = `${Math.max(0, rect.left + window.scrollX)}px`;
      badge.textContent = String(i + 1);
      document.body.appendChild(badge);
    });

    return ordered.length;
  });
}

/**
 * Captures a full-page focus-order screenshot for the given URL, viewport, and color scheme.
 * Launches its own browser instance so it can be called independently from the scan pipeline.
 */
export async function captureViewportScreenshot(
  url: string,
  viewportLabel: ViewportLabel,
  colorScheme: 'light' | 'dark',
): Promise<{ screenshotDataUrl: string; focusableCount: number }> {
  // Dynamic import to avoid bundling puppeteer at the module level for tests
  const puppeteer = (await import('puppeteer')).default;

  // --force-dark-mode sets prefers-color-scheme at the Chrome process level (new headless
  // inherits OS preference otherwise, making emulateMediaFeatures unreliable for light captures
  // when the OS is in dark mode and vice-versa).
  // --disable-features=WebContentsForceDark prevents Chrome's own color-inversion algorithm
  // from running on top of the site's own dark theme.
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-features=WebContentsForceDark',
    ...(colorScheme === 'dark' ? ['--force-dark-mode'] : []),
  ];

  const browser = await puppeteer.launch({ headless: true, args });

  try {
    const vp = VIEWPORTS.find(v => v.label === viewportLabel);
    if (!vp) throw new Error(`Unknown viewport: ${viewportLabel}`);

    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

    // CSS layer: use CDP directly — Puppeteer v24's emulateMediaFeatures wrapper has
    // reliability issues in new-headless mode; raw CDP is more consistent.
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: colorScheme }],
    });

    // JS layer: override window.matchMedia before any page script runs so JS-driven
    // theme detection (class toggles, etc.) sees the correct value.
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

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 1000)));
    await page.evaluate(() => window.scrollTo(0, 0));

    const focusableCount = await injectBadgesAndCount(page);
    const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 75 });

    return {
      screenshotDataUrl: `data:image/jpeg;base64,${Buffer.from(buf as Uint8Array).toString('base64')}`,
      focusableCount,
    };
  } finally {
    await browser.close();
  }
}
