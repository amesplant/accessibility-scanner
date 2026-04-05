import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 1.3.1 — Info and Relationships */
export const CRITERION_ID = '1.3.1';
export const ATTR_PREFIX = 'a11y-struct';
export const ALWAYS_INCLUDE = false;

const TYPE_LABELS: Record<string, string> = {
  'form-field': 'Form Field',
  'data-table': 'Table',
  'heading': 'Heading',
};

export function getLabelText(el: DetectedElement): string {
  const typeLabel = TYPE_LABELS[el.elementType] ?? el.elementType;
  return el.textAlternative
    ? `${typeLabel}: \u201c${el.textAlternative}\u201d`
    : `${typeLabel}: No label`;
}

export function processElements(raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] {
  return raw.map(el => {
    const base = { ...el, id: uuidv4() };
    if (base.isDecorative) {
      return { ...base, auditStatus: 'pass' as const, auditComment: 'Marked as presentational — hidden from assistive technology.' };
    }
    if (base.textAlternative === null) {
      const comment = base.elementType === 'form-field'
        ? 'No programmatic label — screen readers will not announce the purpose of this field.'
        : base.elementType === 'data-table'
        ? 'No <th> header cells detected — screen readers cannot associate data cells with their headers.'
        : 'No accessible name — verify structure is conveyed programmatically.';
      return { ...base, auditStatus: 'fail' as const, auditComment: comment };
    }
    return base;
  });
}

export async function extract(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
  return page.evaluate(() => {
    const { truncHtml, getSelector, getFormLabel } = window.__a11yScanUtils;

    const elements: any[] = [];

    function tag(el: Element, data: any) {
      const scanId = `a11y-struct-${elements.length}`;
      el.setAttribute('data-a11y-struct-scan-id', scanId);
      elements.push(data);
    }

    // 1. Form fields — input (excluding non-labelable types), select, textarea
    const EXCLUDED_INPUT_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.getAttribute('aria-hidden') === 'true') return;
      if (el.tagName === 'INPUT') {
        const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
        if (EXCLUDED_INPUT_TYPES.has(type)) return;
      }
      const label = getFormLabel(el);
      const rawType = el.tagName === 'SELECT' ? 'select'
        : el.tagName === 'TEXTAREA' ? 'textarea'
        : ((el as HTMLInputElement).type || 'text').toLowerCase();
      const roleDesc = rawType === 'select' ? 'combo box'
        : rawType === 'textarea' ? 'multi-line text'
        : rawType === 'checkbox' ? 'checkbox'
        : rawType === 'radio' ? 'radio button'
        : rawType === 'range' ? 'slider'
        : 'text field';
      tag(el, {
        elementType: 'form-field',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: label,
        isDecorative: false,
        auditStatus: 'not-reviewed',
        screenReaderText: label ? `"${label}", ${roleDesc}` : `(unlabeled), ${roleDesc}`,
      });
    });

    // 2. Data tables
    document.querySelectorAll('table').forEach(el => {
      const role = el.getAttribute('role');
      if (role === 'presentation' || role === 'none') {
        tag(el, {
          elementType: 'data-table',
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: 'Presentational (role=presentation)',
          isDecorative: true,
          auditStatus: 'not-reviewed',
          screenReaderText: 'Hidden from assistive technology',
        });
        return;
      }
      const thCells = Array.from(el.querySelectorAll('th'));
      const caption = el.querySelector('caption')?.textContent?.trim() || null;
      const headerTexts = thCells.slice(0, 6).map(th => th.textContent?.trim()).filter(Boolean);
      const headerDesc = headerTexts.length > 0
        ? headerTexts.join(', ') + (thCells.length > 6 ? '…' : '')
        : null;
      const textAlt = thCells.length > 0 ? (caption || headerDesc) : null;
      const screenReaderText = thCells.length > 0
        ? `${thCells.length} header cell${thCells.length !== 1 ? 's' : ''}: ${headerDesc}`
        : 'No <th> header cells detected';
      // Truncate to opening tag + thead/first row to keep html readable
      const raw = el.outerHTML;
      const tbodyIdx = raw.indexOf('<tbody');
      const htmlSnippet = tbodyIdx !== -1
        ? truncHtml(raw.slice(0, tbodyIdx) + '…</table>')
        : truncHtml(raw);
      tag(el, {
        elementType: 'data-table',
        html: htmlSnippet,
        selector: getSelector(el),
        textAlternative: textAlt,
        isDecorative: false,
        auditStatus: 'not-reviewed',
        screenReaderText,
      });
    });

    // 3. Headings h1–h6
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
      const isHidden = el.getAttribute('aria-hidden') === 'true';
      const level = parseInt(el.tagName.slice(1), 10);
      const text = el.textContent?.trim() || null;
      tag(el, {
        elementType: 'heading',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: isHidden ? null : text,
        isDecorative: isHidden,
        auditStatus: 'not-reviewed',
        screenReaderText: isHidden
          ? 'Hidden from assistive technology'
          : text
          ? `"${text}", heading level ${level}`
          : `(empty heading), heading level ${level}`,
      });
    });

    return elements;
  }) as Promise<Omit<DetectedElement, 'id'>[]>;
}

// ---------------------------------------------------------------------------
// On-demand standalone detection (WCAG 1.3.1)
// ---------------------------------------------------------------------------

type OnProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'element'; element: Omit<DetectedElement, 'id'> };
type OnProgressFn = (event: OnProgressEvent) => void;

/** Launches its own browser and detects form fields, tables, and headings with per-element screenshots. */
export async function detectInfoRelationships(url: string, onProgress?: OnProgressFn): Promise<Omit<DetectedElement, 'id'>[]> {
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
    onProgress?.({ type: 'status', message: 'Page loaded — scanning for form fields, tables, and headings…' });

    await page.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

    const rawElements = await extract(page);
    onProgress?.({ type: 'status', message: `Found ${rawElements.length} element${rawElements.length !== 1 ? 's' : ''} — capturing screenshots…` });

    const results: Omit<DetectedElement, 'id'>[] = [];

    for (const raw of rawElements) {
      let auditStatus: 'pass' | 'fail' | 'not-reviewed' = raw.auditStatus as any;
      let auditComment: string | undefined;
      if (raw.isDecorative) {
        auditStatus = 'pass';
        auditComment = 'Marked as presentational — hidden from assistive technology.';
      } else if (raw.textAlternative === null) {
        auditComment = raw.elementType === 'form-field'
          ? 'No programmatic label — screen readers will not announce the purpose of this field.'
          : raw.elementType === 'data-table'
          ? 'No <th> header cells detected — screen readers cannot associate data cells with their headers.'
          : 'No accessible name — verify structure is conveyed programmatically.';
        auditStatus = 'fail';
      }

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
        auditStatus,
        auditComment,
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
