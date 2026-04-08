import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { DetectedElement } from '@accessibility-scanner/shared';

/** WCAG 3.1.1 — Language of Page */
export const CRITERION_ID = '3.1.1';
export const ATTR_PREFIX = 'a11y-page-language';
export const ALWAYS_INCLUDE = true;

function isProbablyValidLanguageTag(value: string): boolean {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value);
}

export function getLabelText(el: DetectedElement): string {
  return el.textAlternative
    ? `Page language: ${el.textAlternative}`
    : 'Page language: missing';
}

export function processElements(raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] {
  return raw.map((el) => {
    const base = { ...el, id: uuidv4() };
    const lang = base.textAlternative?.trim() ?? '';

    if (!lang) {
      return {
        ...base,
        auditStatus: 'not-reviewed' as const,
        auditComment: 'No non-empty lang attribute detected on the <html> element. Screen readers may use the wrong pronunciation rules.',
      };
    }

    if (!isProbablyValidLanguageTag(lang)) {
      return {
        ...base,
        auditStatus: 'not-reviewed' as const,
        auditComment: `Detected lang="${lang}" on the <html> element, but it does not look like a valid language tag. Use a BCP 47 code such as "en" or "en-US".`,
      };
    }

    return {
      ...base,
      auditStatus: 'not-reviewed' as const,
      auditComment: `Detected lang="${lang}" on the <html> element. Confirm it matches the page's primary language.`,
    };
  });
}

export async function extract(page: any): Promise<Omit<DetectedElement, 'id'>[]> {
  return page.evaluate(() => {
    const { truncHtml, getSelector } = window.__a11yScanUtils;
    const root = document.documentElement;
    const lang = root?.getAttribute('lang')?.trim() || null;

    return [{
      elementType: 'page-language' as const,
      html: truncHtml(root?.outerHTML ?? '<html>'),
      selector: root ? getSelector(root) : 'html',
      textAlternative: lang,
      isDecorative: false,
      auditStatus: 'not-reviewed' as const,
      screenReaderText: lang
        ? `Detected lang attribute: ${lang}`
        : 'No lang attribute detected on the html element.',
    }];
  }) as Promise<Omit<DetectedElement, 'id'>[]>;
}

export async function detectPageLanguage(url: string): Promise<Omit<DetectedElement, 'id'>[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; accessibility-scanner/1.0; +https://github.com/pdavies88/accessibility-scanner)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const html = await response.text();
  const htmlTagMatch = html.match(/<html\b[^>]*>/i);
  const langMatch = htmlTagMatch?.[0].match(/\blang\s*=\s*(["']?)([^"'\s>]+)\1/i);
  const htmlTag = htmlTagMatch?.[0] ?? '<html>';
  const lang = langMatch?.[2]?.trim() || null;

  return [{
    elementType: 'page-language',
    html: htmlTag.length > 500 ? `${htmlTag.slice(0, 500)}...` : htmlTag,
    selector: 'html',
    textAlternative: lang,
    isDecorative: false,
    auditStatus: 'not-reviewed',
    screenReaderText: lang
      ? `Detected lang attribute: ${lang}`
      : 'No lang attribute detected on the html element.',
  }];
}
