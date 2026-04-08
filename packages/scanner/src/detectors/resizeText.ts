import { DetectedElement } from '@accessibility-scanner/shared';

/** WCAG 1.4.4 — Resize Text — on-demand detection only */

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

export async function detectResizeText(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
  const puppeteer = (await import('puppeteer')).default;

  onProgress?.({ type: 'status', message: 'Loading page — capturing a full-page preview at 200% zoom…' });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 800)));
    await page.evaluate(() => {
      document.documentElement.style.setProperty('zoom', '2');
      document.documentElement.style.setProperty('transform-origin', 'top left');
      window.scrollTo(0, 0);
    });
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 800)));

    const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 75 });
    const screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer as Uint8Array).toString('base64')}`;

    const result: Omit<DetectedElement, 'id'> = {
      elementType: 'resize-text-preview',
      html: '<!-- Full-page preview captured at 200% zoom -->',
      selector: 'html',
      textAlternative: 'Full-page 200% preview',
      isDecorative: false,
      auditStatus: 'not-reviewed',
      auditComment: 'Full-page preview captured at 200% zoom. Review the screenshot for clipped text, overlap, truncation, or lost functionality.',
      screenReaderText: 'Full-page preview captured at 200 percent zoom.',
      screenshotDataUrl,
    };

    onProgress?.({ type: 'status', message: '200% preview captured. Review the screenshot for clipped or overlapping text.' });
    onProgress?.({ type: 'element', element: result });

    return [result];
  } finally {
    await browser.close();
  }
}