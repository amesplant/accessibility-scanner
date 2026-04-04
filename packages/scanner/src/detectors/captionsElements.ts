import { v4 as uuidv4 } from 'uuid';
import { DetectedElement } from '@accessibility-scanner/shared';

/** WCAG 1.2.2 — Captions (Prerecorded) */
export const CRITERION_ID = '1.2.2';
export const ATTR_PREFIX = 'a11y-captions';
export const ALWAYS_INCLUDE = false;

export function getLabelText(el: DetectedElement): string {
  return el.textAlternative
    ? `Video: \u201c${el.textAlternative}\u201d`
    : `Video: No captions track`;
}

export function processElements(raw: Omit<DetectedElement, 'id'>[]): DetectedElement[] {
  return raw.map(el => ({
    ...el,
    id: uuidv4(),
    auditStatus: el.textAlternative !== null ? 'pass' as const : 'fail' as const,
    auditComment: el.textAlternative !== null
      ? 'Captions track detected.'
      : 'No captions track detected — videos with speech or meaningful audio require synchronized captions.',
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

    const elements: any[] = [];

    function tag(el: Element, data: any) {
      const scanId = `a11y-captions-${elements.length}`;
      el.setAttribute('data-a11y-captions-scan-id', scanId);
      elements.push(data);
    }

    // Non-muted <video> elements — likely have audio/speech, need synchronized captions (WCAG 1.2.2)
    document.querySelectorAll('video').forEach(el => {
      const isMuted = (el as HTMLVideoElement).muted || el.hasAttribute('muted');
      if (isMuted) return; // muted videos are video-only, covered by 1.2.1

      const hasCaptionsTrack  = el.querySelector('track[kind="captions"]')  !== null;
      const hasSubtitlesTrack = el.querySelector('track[kind="subtitles"]') !== null;

      let textAlt: string | null = null;
      if (hasCaptionsTrack)       textAlt = 'Has captions track';
      else if (hasSubtitlesTrack) textAlt = 'Has subtitles track';

      tag(el, {
        elementType: 'video',
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
