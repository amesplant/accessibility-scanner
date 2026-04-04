import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';

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
    function truncHtml(html: string): string {
      return html.length > 500 ? html.slice(0, 500) + '…' : html;
    }

    function getSelector(el: Element): string {
      if ((el as HTMLElement).id) return `#${CSS.escape((el as HTMLElement).id)}`;
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        let seg = cur.tagName.toLowerCase();
        if ((cur as HTMLElement).id) {
          seg = `#${CSS.escape((cur as HTMLElement).id)}`;
          parts.unshift(seg);
          break;
        }
        const parent = cur.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
          if (sameTag.length > 1) seg += `:nth-of-type(${sameTag.indexOf(cur as HTMLElement) + 1})`;
        }
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

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
