import { DetectedElement } from '@accessibility-scanner/shared';
import { BROWSER_UTILS_SCRIPT } from './browserUtils.js';

/** WCAG 2.1.1 — Keyboard (on-demand detection only, not part of the scan pipeline) */

const NON_INTERACTIVE_TAGS = new Set([
  'div', 'span', 'li', 'td', 'tr', 'th', 'p',
  'section', 'article', 'header', 'footer', 'main',
  'nav', 'aside', 'figure', 'blockquote',
]);

const MOUSE_EVENTS = ['click', 'dblclick', 'mousedown', 'dragstart', 'drop'];

const INLINE_MOUSE_ATTRS = ['onclick', 'ondblclick', 'onmousedown', 'ondragstart', 'ondrop'];

/**
 * Detects non-interactive elements with mouse-only interactions.
 * Intercepts addEventListener for mouse event types via evaluateOnNewDocument,
 * then collects inline attribute handlers and cursor:pointer elements.
 */
export async function detectKeyboard(url: string): Promise<Omit<DetectedElement, 'id'>[]> {
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Stamp non-interactive elements that receive mouse/drag JS listeners before any page script runs
    await page.evaluateOnNewDocument((nonInteractiveTags: string[], mouseEvents: string[]) => {
      const _orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (mouseEvents.includes(type) && this instanceof Element) {
          const tag = (this as HTMLElement).tagName.toLowerCase();
          if (nonInteractiveTags.includes(tag)) {
            const existing = (this as HTMLElement).getAttribute('data-a11y-kb-risk');
            if (!existing) {
              (this as HTMLElement).setAttribute('data-a11y-kb-risk', type);
            }
          }
        }
        return _orig.call(this, type, listener, options);
      };
    }, [...NON_INTERACTIVE_TAGS], MOUSE_EVENTS);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 500)));

    await page.addScriptTag({ content: BROWSER_UTILS_SCRIPT });

    type RawElement = {
      html: string;
      selector: string;
      textAlternative: string | null;
      screenReaderText: string;
      reason: string;
    };

    const rawElements = await page.evaluate((nonInteractiveTags: string[], inlineAttrs: string[]): RawElement[] => {
      const { truncHtml, getSelector, getTextAlt } = window.__a11yScanUtils;
      const seen = new Set<Element>();
      const results: RawElement[] = [];

      function isVisible(el: HTMLElement): boolean {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      }

      function isFocusable(el: HTMLElement): boolean {
        const tabIndex = el.getAttribute('tabindex');
        if (tabIndex !== null && parseInt(tabIndex, 10) >= 0) return true;
        const role = el.getAttribute('role');
        const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'menuitem', 'option', 'tab', 'switch', 'treeitem', 'gridcell', 'combobox', 'listbox', 'slider', 'spinbutton', 'textbox'];
        return role !== null && interactiveRoles.includes(role);
      }

      function addElement(el: HTMLElement, reason: string) {
        if (seen.has(el)) return;
        if (!isVisible(el)) return;
        if (isFocusable(el)) return;
        seen.add(el);
        const tag = el.tagName.toLowerCase();
        const textAlt = getTextAlt(el);
        results.push({
          html: truncHtml(el.outerHTML),
          selector: getSelector(el),
          textAlternative: textAlt ?? `${tag} — ${reason}`,
          screenReaderText: `${tag} element with mouse-only interaction: ${reason}`,
          reason,
        });
      }

      // Category 1: JS listener-stamped elements
      document.querySelectorAll<HTMLElement>('[data-a11y-kb-risk]').forEach(el => {
        const eventType = el.getAttribute('data-a11y-kb-risk') ?? 'click';
        addElement(el, `JS ${eventType} handler (no tabindex/role)`);
      });

      // Category 2: Inline mouse event attributes on non-interactive elements
      const attrSelector = inlineAttrs.map(a => `[${a}]`).join(',');
      document.querySelectorAll<HTMLElement>(attrSelector).forEach(el => {
        const tag = el.tagName.toLowerCase();
        if (!nonInteractiveTags.includes(tag)) return;
        const foundAttr = inlineAttrs.find(a => el.hasAttribute(a)) ?? 'onclick';
        addElement(el, `${foundAttr} attribute`);
      });

      // Category 3: cursor:pointer on non-interactive, non-focusable elements
      const allEls = document.querySelectorAll<HTMLElement>(nonInteractiveTags.join(','));
      allEls.forEach(el => {
        if (!isVisible(el)) return;
        if (isFocusable(el)) return;
        const style = window.getComputedStyle(el);
        if (style.cursor === 'pointer') {
          addElement(el, 'cursor:pointer, not keyboard-accessible');
        }
      });

      // Category 4: CSS :hover rules that show/hide content (no keyboard equivalent)
      const VISIBILITY_PROPS = ['display', 'visibility', 'opacity', 'maxHeight', 'overflow'] as const;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules ?? [])) {
            if (!(rule instanceof CSSStyleRule)) continue;
            if (!rule.selectorText.includes(':hover')) continue;
            const decl = rule.style;
            const changesVisibility = VISIBILITY_PROPS.some(p => decl[p as keyof typeof decl]);
            if (!changesVisibility) continue;
            // Strip ':hover' variants to get the controlling element selector
            const baseSelector = rule.selectorText
              .split(',')
              .map(s => s.replace(/:hover\b/g, '').trim())
              .filter(Boolean)
              .join(',');
            if (!baseSelector) continue;
            try {
              document.querySelectorAll<HTMLElement>(baseSelector).forEach(el => {
                addElement(el, 'CSS :hover-only reveal (no keyboard equivalent)');
              });
            } catch { /* invalid selector after stripping — skip */ }
          }
        } catch { /* cross-origin stylesheet — skip */ }
      }

      return results;
    }, [...NON_INTERACTIVE_TAGS], INLINE_MOUSE_ATTRS);

    // Take a per-element screenshot
    const results: Omit<DetectedElement, 'id'>[] = [];

    for (const raw of rawElements) {
      let screenshotDataUrl: string | undefined;
      try {
        const handle = await page.$(raw.selector);
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

      results.push({
        elementType: 'mouse-only' as const,
        html: raw.html,
        selector: raw.selector,
        textAlternative: raw.textAlternative,
        isDecorative: false,
        auditStatus: 'not-reviewed' as const,
        screenReaderText: raw.screenReaderText,
        screenshotDataUrl,
      });
    }

    return results;
  } finally {
    await browser.close();
  }
}
