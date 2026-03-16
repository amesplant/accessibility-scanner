export type AuditType = 'rapid' | 'mid-level' | 'all-inclusive';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export type ManualAuditStatus = 'pass' | 'fail' | 'na' | 'not-tested';

export type FailureScope = 'global' | 'common' | 'page-specific';

export interface ManualFailureInstance {
  id: string;
  scope?: FailureScope;
  notes?: string;
  codeSnippet?: string;
  screenshotDataUrl?: string;
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
  failures?: ManualFailureInstance[];
  updatedAt: string;         // ISO date
}

export interface ManualAudit {
  lastUpdated: string;
  auditorNotes?: string;
  checks: ManualCheckResult[];
  completed?: boolean;
  completedAt?: string;
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
}

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
}

export interface ScanReport {
  id: string;
  sitemap: string;
  pageTitle?: string;
  startTime: Date;
  endTime: Date;
  auditType?: AuditType;
  projectId?: string;
  results: ScanResult[];
  summary: {
    totalPages: number;
    totalViolations: number;
    violationsByImpact: Record<string, number>;
    violationsByType: Record<string, number>;
    /** aggregated counts by WCAG level (A/AA/AAA) */
    violationsByLevel: Record<string, number>;
  };
}

