declare global {
  interface Window {
    __a11yScanUtils: {
      truncHtml(html: string): string;
      getSelector(el: Element): string;
      resolveAriaLabelledby(el: Element): string | null;
      getTextAlt(el: Element): string | null;
      checkDecorative(el: Element): boolean;
      getFormLabel(el: Element): string | null;
    };
  }
}

/**
 * Browser-side utility functions shared across all detectors.
 *
 * Because detector code runs inside Puppeteer's page.evaluate() (browser context),
 * it cannot import Node.js modules.  Instead, this script is injected once per page
 * via page.addScriptTag() before any detectors run, making the helpers available on
 * window.__a11yScanUtils for every subsequent evaluate() call.
 */
export const BROWSER_UTILS_SCRIPT = `
  window.__a11yScanUtils = {

    truncHtml(html) {
      return html.length > 500 ? html.slice(0, 500) + '\u2026' : html;
    },

    getSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id) {
          seg = '#' + CSS.escape(cur.id);
          parts.unshift(seg);
          break;
        }
        const parent = cur.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
          if (sameTag.length > 1) seg += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
        }
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    },

    resolveAriaLabelledby(el) {
      const ids = el.getAttribute('aria-labelledby');
      if (!ids) return null;
      const text = ids.split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      return text || null;
    },

    getTextAlt(el) {
      const labelledby = window.__a11yScanUtils.resolveAriaLabelledby(el);
      if (labelledby) return labelledby;
      const ariaLabel = el.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const alt = el.getAttribute('alt');
      if (alt !== null) return alt;
      const title = el.getAttribute('title')?.trim();
      if (title) return title;
      return null;
    },

    checkDecorative(el) {
      const alt = el.getAttribute('alt');
      const role = el.getAttribute('role');
      return alt === '' || role === 'presentation' || role === 'none';
    },

    getFormLabel(el) {
      const labelledby = window.__a11yScanUtils.resolveAriaLabelledby(el);
      if (labelledby) return labelledby;
      const ariaLabel = el.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const id = el.id;
      if (id) {
        const label = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (label) return label.textContent?.trim() || null;
      }
      const wrappingLabel = el.closest('label');
      if (wrappingLabel) {
        const clone = wrappingLabel.cloneNode(true);
        clone.querySelectorAll('input, select, textarea').forEach(n => n.remove());
        const text = clone.textContent?.trim();
        if (text) return text;
      }
      const title = el.getAttribute('title')?.trim();
      if (title) return title;
      return null;
    },

  };
`;
