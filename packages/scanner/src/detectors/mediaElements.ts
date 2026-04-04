import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';

/** WCAG 1.2.1 — Audio-only and Video-only (Prerecorded) */
export const CRITERION_ID = '1.2.1';
export const ATTR_PREFIX = 'a11y-media';
export const ALWAYS_INCLUDE = false;

const TYPE_LABELS: Record<string, string> = { 'audio': 'Audio', 'video-only': 'Video' };

export function getLabelText(el: DetectedElement): string {
  const label = TYPE_LABELS[el.elementType] ?? el.elementType;
  return el.textAlternative
    ? `${label}: \u201c${el.textAlternative}\u201d`
    : `${label}: No alternative`;
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
    const { truncHtml, getSelector, resolveAriaLabelledby } = window.__a11yScanUtils;

    const elements: any[] = [];

    function tag(el: Element, data: any) {
      const scanId = `a11y-media-${elements.length}`;
      el.setAttribute('data-a11y-media-scan-id', scanId);
      elements.push(data);
    }

    // 1. <audio> elements — need a transcript or text alternative (WCAG 1.2.1)
    document.querySelectorAll('audio').forEach(el => {
      const hasDescTrack = el.querySelector('track[kind="descriptions"]') !== null;
      const hasSubtitleTrack = el.querySelector('track[kind="subtitles"]') !== null;
      const ariaLabel = resolveAriaLabelledby(el)
        || el.getAttribute('aria-label')?.trim()
        || null;
      const hasAriaDescribedby = el.hasAttribute('aria-describedby');
      let textAlt: string | null = null;
      if (hasDescTrack) textAlt = 'Has description track';
      else if (hasSubtitleTrack) textAlt = 'Has subtitles track';
      else if (ariaLabel) textAlt = ariaLabel;
      else if (hasAriaDescribedby) textAlt = 'Has aria-describedby reference';
      tag(el, {
        elementType: 'audio',
        html: truncHtml(el.outerHTML),
        selector: getSelector(el),
        textAlternative: textAlt,
        isDecorative: false,
        auditStatus: 'not-reviewed',
      });
    });

    // 2. Muted <video> elements — likely video-only, need a text alternative (WCAG 1.2.1)
    document.querySelectorAll('video').forEach(el => {
      const isMuted = (el as HTMLVideoElement).muted || el.hasAttribute('muted');
      if (!isMuted) return;
      const hasDescTrack = el.querySelector('track[kind="descriptions"]') !== null;
      const ariaLabel = resolveAriaLabelledby(el)
        || el.getAttribute('aria-label')?.trim()
        || el.getAttribute('title')?.trim()
        || null;
      let textAlt: string | null = null;
      if (hasDescTrack) textAlt = 'Has description track';
      else if (ariaLabel) textAlt = ariaLabel;
      tag(el, {
        elementType: 'video-only',
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
