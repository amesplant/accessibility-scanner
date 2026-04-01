import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

const SKIP_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf|eot|pdf|zip|gz|mp4|mp3|xml)(\?.*)?$/i;
const SKIP_PATHS = /\/(wp-json|wp-admin|wp-login\.php|xmlrpc\.php|feed)(\/|$)/i;

export interface CrawlOptions {
  maxPages?: number;
  onProgress?: (url: string, count: number) => void;
  signal?: AbortSignal;
  concurrency?: number;
}

export async function crawlSite(rootUrl: string, options: CrawlOptions = {}): Promise<string[]> {
  const { maxPages = 200, onProgress, signal, concurrency = 6 } = options;

  const root = new URL(rootUrl);
  const origin = root.origin;
  // Ensure basePath always ends with '/' so prefix-matching is exact per segment.
  const basePath = root.pathname.endsWith('/') ? root.pathname : root.pathname + '/';

  const queued = new Set<string>();
  const htmlPages = new Set<string>();

  let currentLevel: string[] = [normalizeUrl(rootUrl)];
  for (const url of currentLevel) queued.add(url);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const limit = pLimit(concurrency);

    while (currentLevel.length > 0 && htmlPages.size < maxPages && !signal?.aborted) {
      const nextLevel = new Set<string>();

      await Promise.all(currentLevel.map(url =>
        limit(async () => {
          if (signal?.aborted) return;
          onProgress?.(url, htmlPages.size);

          const page = await browser.newPage();
          try {
            const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Only process pages that returned HTML
            const contentType = res?.headers()['content-type'] ?? '';
            if (!contentType.includes('text/html')) return;

            htmlPages.add(url);

            // Scroll to bottom to trigger lazy-loaded / infinite-scroll content,
            // then wait for any resulting network activity to settle.
            await autoScroll(page);
            await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

            const links = await extractLinks(page, url, origin, basePath);
            for (const href of links) {
              if (!queued.has(href)) {
                queued.add(href);
                nextLevel.add(href);
              }
            }
          } catch (err: any) {
            if (err?.name === 'AbortError' || signal?.aborted) return;
            // Skip pages that fail to load
          } finally {
            await page.close().catch(() => {});
          }
        })
      ));

      if (signal?.aborted) break;
      currentLevel = [...nextLevel].slice(0, maxPages - htmlPages.size);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return [...htmlPages];
}

function normalizeUrl(href: string): string {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '') || '/';
}

async function autoScroll(page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      const distance = 800;
      const intervalMs = 200;
      const maxScrolls = 40; // cap at ~8 s of scrolling per page
      let scrolls = 0;
      let lastHeight = 0;
      let stableCount = 0;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        scrolls++;

        const newHeight = document.body.scrollHeight;
        if (newHeight === lastHeight) {
          stableCount++;
        } else {
          stableCount = 0;
          lastHeight = newHeight;
        }

        // Stop if we've hit the bottom (stable for 3 ticks) or the cap
        if (stableCount >= 3 || scrolls >= maxScrolls) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, intervalMs);
    });
  });
}

async function extractLinks(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>,
  base: string,
  origin: string,
  basePath: string
): Promise<string[]> {
  const hrefs: string[] = await page.$$eval('a[href]', anchors =>
    anchors.map(a => (a as HTMLAnchorElement).href)
  );

  const found: string[] = [];
  for (const href of hrefs) {
    if (!href) continue;
    try {
      const resolved = new URL(href, base);
      if (resolved.origin !== origin) continue;
      if (SKIP_EXTENSIONS.test(resolved.pathname)) continue;
      if (SKIP_PATHS.test(resolved.pathname)) continue;
      // Only follow links at or below the starting path
      const pathname = resolved.pathname.endsWith('/')
        ? resolved.pathname
        : resolved.pathname + '/';
      if (!pathname.startsWith(basePath)) continue;

      found.push(normalizeUrl(resolved.toString()));
    } catch {
      // invalid URL — skip
    }
  }

  return found;
}
