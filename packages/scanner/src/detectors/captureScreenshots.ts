import { DetectedElement } from '@accessibility-scanner/shared';

/**
 * Captures element-level and context (annotated viewport) screenshots for an array
 * of detected elements.  Elements are located in the page via a data attribute that
 * was stamped on them during extraction.
 *
 * @param page            Puppeteer Page handle
 * @param elements        Detected elements (mutated in-place to add screenshotDataUrl / contextScreenshotDataUrl)
 * @param attrPrefix      Attribute prefix used when tagging elements, e.g. "a11y" or "a11y-media"
 *                        → derives data attribute `data-{attrPrefix}-scan-id`
 * @param getLabelText    Returns the annotation string for a given element
 * @param viewportWidth   Current viewport width (pixels)
 * @param viewportHeight  Current viewport height (pixels)
 * @param cap             Maximum number of elements to screenshot (default 30)
 */
export async function captureElementScreenshots(
  page: any,
  elements: DetectedElement[],
  attrPrefix: string,
  getLabelText: (el: DetectedElement) => string,
  viewportWidth: number,
  viewportHeight: number,
  cap = 30,
): Promise<void> {
  const dataAttr = `data-${attrPrefix}-scan-id`;

  for (let i = 0; i < Math.min(elements.length, cap); i++) {
    const el = elements[i];
    const scanAttr = `${attrPrefix}-${i}`;

    try {
      const visible = await page.evaluate(
        (attr: string, idx: string) => {
          const node = document.querySelector(`[${attr}="${idx}"]`) as HTMLElement | null;
          if (!node) return false;
          node.scrollIntoView({ behavior: 'instant', block: 'center' });
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        },
        dataAttr,
        scanAttr,
      );

      if (!visible) continue;

      const handle = await page.$(`[${dataAttr}="${scanAttr}"]`);
      if (!handle) continue;

      const box = await handle.boundingBox();
      if (!box || box.width === 0 || box.height === 0) {
        await handle.dispose();
        continue;
      }

      const pad = 8;
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(box.width + pad * 2, viewportWidth),
        height: Math.min(box.height + pad * 2, viewportHeight),
      };

      // Element-level crop screenshot
      const elBuf = await page.screenshot({ clip, type: 'jpeg', quality: 80 });
      el.screenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(elBuf as Uint8Array).toString('base64')}`;

      // Context screenshot: yellow outline, dimmed surroundings, floating label
      const labelText = getLabelText(el);
      await handle.evaluate(
        (node: Element, lbl: string) => {
          node.setAttribute('data-a11y-highlight', 'true');
          const rect = node.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const label = document.createElement('div');
          label.setAttribute('data-a11y-label', 'true');
          label.textContent = lbl;
          document.body.appendChild(label);
          const approxLabelH = 36;
          const top =
            rect.top > approxLabelH + 8
              ? rect.top - approxLabelH - 6
              : Math.min(rect.bottom + 6, vh - approxLabelH - 4);
          label.style.top = `${Math.max(4, top)}px`;
          label.style.left = `${Math.max(4, Math.min(rect.left, vw - 324))}px`;
        },
        labelText,
      );

      const ctxBuf = await page.screenshot({ type: 'jpeg', quality: 75 });
      el.contextScreenshotDataUrl = `data:image/jpeg;base64,${Buffer.from(ctxBuf as Uint8Array).toString('base64')}`;

      await handle.evaluate((node: Element) => {
        node.removeAttribute('data-a11y-highlight');
        document.querySelector('[data-a11y-label]')?.remove();
      });
      await handle.dispose();
    } catch {
      // skip — element hidden, detached, or viewport issue
    }
  }
}
