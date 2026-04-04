import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';

/** WCAG 1.1.1 — Non-text Content */
export const CRITERION_ID = '1.1.1';
export const ATTR_PREFIX = 'a11y';
export const ALWAYS_INCLUDE = true;

export function getLabelText(el: DetectedElement): string {
  const typeLabel: Record<string, string> = {
    'img': 'Image',
    'input-image': 'Image Input',
    'svg': 'SVG',
    'canvas': 'Canvas',
    'video': 'Video',
    'button-icon': 'Icon Button',
    'role-img': 'Role=img',
    'area': 'Image Map Area',
    'object': 'Object',
    'audio': 'Audio',
    'video-only': 'Video',
    'link': 'Link',
    'form-field': 'Form Field',
    'data-table': 'Table',
    'heading': 'Heading',
  };
  const label = typeLabel[el.elementType] ?? el.elementType;
  return el.textAlternative
    ? `${label}: \u201c${el.textAlternative}\u201d`
    : `${label}: No text alternative`;
}

export function processElements(raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] {
  return raw.map(el => {
    const base = { ...el, id: uuidv4() };
    if (base.isDecorative) {
      return { ...base, auditStatus: 'pass' as const, auditComment: 'Decorative — correctly hidden from screen readers.' };
    }
    if (base.textAlternative === null) {
      return { ...base, auditStatus: 'fail' as const, auditComment: 'No text alternative detected — screen reader will not announce this element.' };
    }
    return base;
  });
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

    function resolveAriaLabelledby(el: Element): string | null {
      const ids = el.getAttribute('aria-labelledby');
      if (!ids) return null;
      const text = ids.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      return text || null;
    }

    function getTextAlt(el: Element): string | null {
      const labelledby = resolveAriaLabelledby(el);
      if (labelledby) return labelledby;
      const ariaLabel = el.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const alt = el.getAttribute('alt');
      if (alt !== null) return alt;
      const title = el.getAttribute('title')?.trim();
      if (title) return title;
      return null;
    }

    function checkDecorative(el: Element): boolean {
      const alt = el.getAttribute('alt');
      const role = el.getAttribute('role');
      return alt === '' || role === 'presentation' || role === 'none';
    }

    const elements: any[] = [];

    function tag(el: Element, data: any) {
      const scanId = `a11y-${elements.length}`;
      el.setAttribute('data-a11y-scan-id', scanId);
      elements.push(data);
    }

    // 1. <img>
    document.querySelectorAll('img').forEach(el => {
      const alt = el.getAttribute('alt');
      tag(el, {
        elementType: 'img',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: alt !== null ? alt : null,
        isDecorative: checkDecorative(el),
        auditStatus: 'not-reviewed',
      });
    });

    // 2. <input type="image">
    document.querySelectorAll('input[type="image"]').forEach(el => {
      const alt = el.getAttribute('alt');
      tag(el, {
        elementType: 'input-image',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: alt !== null ? alt : null,
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    // 3. <svg> (skip aria-hidden ones)
    document.querySelectorAll('svg').forEach(el => {
      if (el.getAttribute('aria-hidden') === 'true') return;
      const role = el.getAttribute('role');
      const titleEl = el.querySelector('title');
      const titleText = titleEl?.textContent?.trim() || null;
      const textAlt = resolveAriaLabelledby(el)
        || el.getAttribute('aria-label')?.trim()
        || titleText
        || null;
      const svgHtml = el.outerHTML;
      tag(el, {
        elementType: 'svg',
        html: truncHtml(svgHtml.length > 200 ? svgHtml.slice(0, svgHtml.indexOf('>') + 1) + '…' : svgHtml),
        selector: getSelector(el),
        textAlternative: textAlt || null,
        isDecorative: role === 'presentation' || role === 'none',
        auditStatus: 'not-reviewed',
      });
    });

    // 4. <canvas>
    document.querySelectorAll('canvas').forEach(el => {
      tag(el, {
        elementType: 'canvas',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: getTextAlt(el),
        isDecorative: checkDecorative(el),
        auditStatus: 'not-reviewed',
      });
    });

    // 5. <video>
    document.querySelectorAll('video').forEach(el => {
      const hasCaption = el.querySelector('track[kind="captions"]') !== null;
      tag(el, {
        elementType: 'video',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: hasCaption ? 'Has captions track' : null,
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    // 6. Icon-only buttons (no visible text content)
    document.querySelectorAll('button, [role="button"]').forEach(el => {
      if (el.getAttribute('aria-hidden') === 'true') return;
      const visibleText = el.textContent?.trim() || '';
      if (visibleText) return;
      tag(el, {
        elementType: 'button-icon',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: getTextAlt(el),
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    // 7. [role="img"] (non-SVG, non-hidden)
    document.querySelectorAll('[role="img"]').forEach(el => {
      if (el.tagName.toLowerCase() === 'svg') return;
      if (el.getAttribute('aria-hidden') === 'true') return;
      tag(el, {
        elementType: 'role-img',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: getTextAlt(el),
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    // 8. <area>
    document.querySelectorAll('area').forEach(el => {
      const alt = el.getAttribute('alt');
      tag(el, {
        elementType: 'area',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: alt !== null ? alt : null,
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    // 9. <object>
    document.querySelectorAll('object').forEach(el => {
      const textAlt = getTextAlt(el) || el.textContent?.trim() || null;
      tag(el, {
        elementType: 'object',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: textAlt,
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    return elements;
  }) as Promise<Omit<DetectedElement, 'id'>[]>;
}
