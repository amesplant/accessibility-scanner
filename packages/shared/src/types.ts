export type AuditType = 'rapid' | 'mid-level' | 'all-inclusive';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export type ManualAuditStatus = 'pass' | 'fail' | 'na' | 'not-tested';

export type FailureScope = 'global' | 'common' | 'page-specific';

export type RemediationAssignee = 'content' | 'editor' | 'engineer';

export type RemediationAssignment = RemediationAssignee | RemediationAssignee[];

export function normalizeRemediationAssignees(assignedTo?: RemediationAssignment): RemediationAssignee[] {
  if (!assignedTo) return [];
  return Array.isArray(assignedTo) ? assignedTo : [assignedTo];
}

export interface ManualFailureInstance {
  id: string;
  status?: 'pass' | 'fail';
  scope?: FailureScope;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  assignedTo?: RemediationAssignee[];
  /** Additional WCAG criteria IDs related to this instance (e.g. ["1.3.1", "4.1.2"]). */
  relatedCriteria?: string[];
  /** Optional notes keyed by related WCAG criterion ID. */
  relatedCriteriaNotes?: Record<string, string>;
  title?: string;
  notes?: string;
  codeSnippet?: string;
  screenshotDataUrl?: string;
  remediationRecommendation?: string;
  createdAt: string;
}

export interface ManualCheckResult {
  id: string;                // wcagCriterion for predefined (e.g. "1.1.1"), UUID for custom
  type: 'wcag' | 'custom';
  wcagCriterion?: string;    // e.g. "1.1.1"
  level?: 'A' | 'AA' | 'AAA';
  title: string;
  description?: string;
  status: ManualAuditStatus;
  notes?: string;
  codeSnippet?: string;      // relevant HTML/code fragment
  screenshotDataUrl?: string; // base64 data URL of screenshot
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  remediationRecommendation?: string;
  assignedTo?: RemediationAssignee[];
  failures?: ManualFailureInstance[];
  questionStatuses?: ManualAuditStatus[];
  updatedAt: string;         // ISO date
}

export interface ManualAudit {
  lastUpdated: string;
  auditorNotes?: string;
  checks: ManualCheckResult[];
  completed?: boolean;
  completedAt?: string;
}

export type DetectedElementType =
  | 'img'
  | 'input-image'
  | 'svg'
  | 'canvas'
  | 'video'
  | 'button-icon'
  | 'role-img'
  | 'area'
  | 'object'
  | 'audio'
  | 'video-only'
  | 'link'
  | 'form-field'
  | 'data-table'
  | 'heading'
  | 'focus-order-map'
  | 'focus-trigger'
  | 'mouse-only'
  | 'no-focus-style'
  | 'keyboard-trap'
  | 'low-contrast';

export interface DetectedElement {
  id: string;
  elementType: DetectedElementType;
  /** Truncated outerHTML (≤ 500 chars) */
  html: string;
  /** CSS selector path to the element */
  selector: string;
  /** Resolved text alternative (aria-labelledby > aria-label > alt > title), or null if missing */
  textAlternative: string | null;
  /** True when the element has empty alt="" or role="presentation/none" */
  isDecorative: boolean;
  auditStatus: 'pass' | 'fail' | 'not-reviewed';
  auditComment?: string;
  failures?: ManualFailureInstance[];
  /** Base64 data URL screenshot of the element (cropped to element bounds) */
  screenshotDataUrl?: string;
  /** Base64 data URL of the viewport with the element highlighted in red */
  contextScreenshotDataUrl?: string;
  /** Dark-mode variant of screenshotDataUrl (used for focus-order-map dark/light toggle) */
  darkScreenshotDataUrl?: string;
  /** What a screen reader would announce for this element (computed accessible name) */
  screenReaderText?: string;
}

/** Keyed by WCAG criterion ID, e.g. "1.1.1" */
export interface DetectedCriteriaElements {
  [criterionId: string]: DetectedElement[];
}

export interface ScanResult {
  id: string;
  url: string;
  title?: string;
  timestamp: Date;
  violations: AxeViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  manualAudit?: ManualAudit;
  detectedElements?: DetectedCriteriaElements;
}

export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  /**
   * Convenience field derived from `tags` that normalizes the
   * WCAG level (A / AA / AAA) for display and summarization.
   * May be undefined if the scanner didn't compute it.
   */
  level?: 'A' | 'AA' | 'AAA' | 'best-practice';
  nodes: ViolationNode[];
  overrideStatus?: 'pass' | 'na';
  overrideNotes?: string;
}

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
  screenshotDataUrl?: string;
  overrideStatus?: 'pass' | 'fail';
}

export interface ScanReport {
  id: string;
  sitemap: string;
  pageTitle?: string;
  startTime: Date;
  endTime: Date;
  auditType?: AuditType;
  wcagLevel?: 'A' | 'AA' | 'AAA';
  includeBestPractices?: boolean;
  projectId?: string;
  results: ScanResult[];
  summary: {
    totalPages: number;
    totalViolations: number;
    violationsByImpact: Record<string, number>;
    violationsByType: Record<string, number>;
    /** aggregated counts by WCAG level (A/AA/AAA) */
    violationsByLevel: Record<string, number>;
    manualFailCount?: number;
    auditedPages?: number;
  };
}


