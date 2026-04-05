import { DetectedElement } from '@accessibility-scanner/shared';

export interface DetectorModule {
  CRITERION_ID: string;
  /** Attribute prefix used for element tagging, e.g. "a11y" → data-a11y-scan-id */
  ATTR_PREFIX: string;
  /** When true, criterion is always added to detectedElementsMap even if no elements found */
  ALWAYS_INCLUDE: boolean;
  getLabelText: (el: DetectedElement) => string;
  processElements: (raw: Omit<DetectedElement, 'id'>[]) => DetectedElement[];
  extract: (page: any) => Promise<Omit<DetectedElement, 'id'>[]>;
}

export { captureElementScreenshots } from './captureScreenshots.js';

import * as nonTextElements from './nonTextElements.js';
import * as mediaElements from './mediaElements.js';
import * as captionsElements from './captionsElements.js';
import * as linkPurpose from './linkPurpose.js';
import * as infoRelationships from './infoRelationships.js';

/**
 * All element detectors in execution order.
 * To add a new WCAG criterion: create a new detector module and append it here.
 */
export const DETECTORS: DetectorModule[] = [
  nonTextElements,
  mediaElements,
  captionsElements,
  linkPurpose,
  infoRelationships,
  // focusOrder — fully on-demand, not part of the scan pipeline
];
