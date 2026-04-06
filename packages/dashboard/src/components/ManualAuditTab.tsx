import React, { useCallback, useRef, useState } from 'react';
import {
  ManualAudit,
  ManualAuditStatus,
  ManualCheckResult,
  ManualFailureInstance,
  FailureScope,
  DetectedElement,
  DetectedCriteriaElements,
  PREDEFINED_CHECKS,
  CATEGORY_ORDER,
  CATEGORY_DESCRIPTIONS,
  RAPID_AUDIT_CHECK_IDS,
  MID_LEVEL_AUDIT_CHECK_IDS,
} from '@accessibility-scanner/shared';
import { cn } from '@/lib/utils';
import { ExportModal } from '@/components/ExportModal';
import { useCurrentReport } from '@/context/CurrentReportContext';
import { useAIProviders } from '@/hooks/useAIProviders';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Trash2,
  Keyboard,
  Image as ImageIcon,
  Palette,
  FormInput,
  Link,
  AlignLeft,
  Video,
  ChevronDown,
  Code2,
  Upload,
  Clipboard,
  X,
  CheckCircle2,
  RotateCcw,
  Copy,
  Check,
  Wand2,
  Loader2,
  Save,
  Lightbulb,
  Download,
  Info,
  Sun,
  Moon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Lookup map: check id → predefined metadata (category, priority, level)
// ---------------------------------------------------------------------------

const PREDEFINED_MAP = Object.fromEntries(PREDEFINED_CHECKS.map(c => [c.id, c]));

// ---------------------------------------------------------------------------
// Pill colors
// ---------------------------------------------------------------------------

// 800 text on 100 background clears WCAG AA (4.5:1) for text-xs across all hues.
// (700 on 100 fails for several — e.g. blue-700/blue-100 ≈ 3.8:1.)
const CATEGORY_COLORS: Record<string, string> = {
  'Keyboard & Focus':    'bg-blue-100   text-blue-800   border-blue-200',
  'Images & Media':      'bg-orange-100 text-orange-800 border-orange-200',
  'Color & Visual':      'bg-purple-100 text-purple-800 border-purple-200',
  'Forms & Input':       'bg-green-100  text-green-800  border-green-200',
  'Links & Navigation':  'bg-cyan-100   text-cyan-800   border-cyan-200',
  'Content & Structure': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Video & Audio':       'bg-rose-100   text-rose-800   border-rose-200',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Keyboard & Focus':    Keyboard,
  'Images & Media':      ImageIcon,
  'Color & Visual':      Palette,
  'Forms & Input':       FormInput,
  'Links & Navigation':  Link,
  'Content & Structure': AlignLeft,
  'Video & Audio':       Video,
};

const LEVEL_COLORS: Record<string, string> = {
  A:   'bg-indigo-100  text-indigo-800  border-indigo-200',
  AA:  'bg-violet-100  text-violet-800  border-violet-200',
  AAA: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
};

// ---------------------------------------------------------------------------
// Failure scope
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS: { value: FailureScope; label: string }[] = [
  { value: 'global',        label: 'Global' },
  { value: 'common',        label: 'Common' },
  { value: 'page-specific', label: 'Page Specific' },
];

const SCOPE_COLORS: Record<FailureScope, string> = {
  'global':        'bg-red-100   text-red-800   border-red-200',
  'common':        'bg-amber-100 text-amber-800 border-amber-200',
  'page-specific': 'bg-sky-100   text-sky-800   border-sky-200',
};

const INSTANCE_STATUS_OPTIONS: { value: 'fail' | 'pass'; label: string }[] = [
  { value: 'fail', label: 'Fail' },
  { value: 'pass', label: 'Pass' },
];

const INSTANCE_STATUS_COLORS: Record<'fail' | 'pass', string> = {
  'fail': 'bg-red-100   text-red-800   border-red-200',
  'pass': 'bg-green-100 text-green-800 border-green-200',
};

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

type ViewMode = 'wcag' | 'category' | 'priority' | 'status';

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'wcag',     label: 'WCAG Level' },
  { value: 'category', label: 'Category' },
  { value: 'priority', label: 'Priority' },
  { value: 'status',   label: 'Status' },
];

interface CheckGroup {
  id: string;
  label: string;
  description?: string;
  checks: ManualCheckResult[];
  /** render custom check cards instead of check rows (status mode mixes types) */
  mixed?: boolean;
}

function buildGroups(audit: ManualAudit, mode: ViewMode): CheckGroup[] {
  const wcagChecks = audit.checks.filter(c => c.type === 'wcag');

  switch (mode) {
    case 'wcag':
      return [
        { id: 'level-a',   label: 'WCAG Level A',   checks: wcagChecks.filter(c => c.level === 'A') },
        { id: 'level-aa',  label: 'WCAG Level AA',  checks: wcagChecks.filter(c => c.level === 'AA') },
        { id: 'level-aaa', label: 'WCAG Level AAA', checks: wcagChecks.filter(c => c.level === 'AAA') },
      ].filter(g => g.checks.length > 0);

    case 'category':
      return CATEGORY_ORDER.map(cat => ({
        id: `cat-${cat}`,
        label: cat,
        description: CATEGORY_DESCRIPTIONS[cat],
        checks: wcagChecks.filter(c => PREDEFINED_MAP[c.id]?.category === cat),
      })).filter(g => g.checks.length > 0);

    case 'priority':
      return [
        {
          id: 'priority-high',
          label: 'High Impact',
          description: 'Core issues that affect most users on most pages — test these first.',
          checks: wcagChecks.filter(c => PREDEFINED_MAP[c.id]?.priority === 'high'),
        },
        {
          id: 'priority-medium',
          label: 'Medium Impact',
          description: 'Important criteria that depend on specific conditions or content types.',
          checks: wcagChecks.filter(c => PREDEFINED_MAP[c.id]?.priority === 'medium'),
        },
        {
          id: 'priority-low',
          label: 'Low / Situational',
          description: 'Only applicable when specific media or interaction patterns are present on this page.',
          checks: wcagChecks.filter(c => PREDEFINED_MAP[c.id]?.priority === 'low'),
        },
      ].filter(g => g.checks.length > 0);

    case 'status': {
      // All checks (predefined + custom) sorted by status
      const ORDER: ManualAuditStatus[] = ['fail', 'not-tested', 'pass', 'na'];
      const STATUS_GROUP_LABELS: Record<ManualAuditStatus, string> = {
        fail:         '✗ Fail',
        'not-tested': '? Not Tested',
        pass:         '✓ Pass',
        na:           '— N/A',
      };
      return ORDER.map(s => ({
        id: `status-${s}`,
        label: STATUS_GROUP_LABELS[s],
        checks: audit.checks.filter(c => c.status === s),
        mixed: true,
      })).filter(g => g.checks.length > 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ManualAuditStatus, string> = {
  pass:         '✓ Pass',
  fail:         '✗ Fail',
  na:           '— N/A',
  'not-tested': '? Not Tested',
};

const STATUS_COLORS: Record<ManualAuditStatus, string> = {
  pass:         'text-green-700 dark:text-green-400',
  fail:         'text-red-700 dark:text-red-400',
  na:           'text-muted-foreground',
  'not-tested': 'text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Level filter
// ---------------------------------------------------------------------------

type LevelFilter = 'all' | 'A' | 'AA' | 'AAA';

const LEVEL_FILTER_OPTIONS: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'A',   label: 'A' },
  { value: 'AA',  label: 'AA' },
  { value: 'AAA', label: 'AAA' },
];

function LevelFilterSelector({
  value,
  onChange,
}: {
  value: LevelFilter;
  onChange: (v: LevelFilter) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-muted-foreground mr-2 shrink-0">Level</span>
      <div
        className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5"
        role="group"
        aria-label="Filter by WCAG level"
      >
        {LEVEL_FILTER_OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              'px-2.5 py-1 text-xs rounded font-medium transition-colors',
              value === o.value
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground cursor-pointer',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TierFilterSelector
// ---------------------------------------------------------------------------

type TierFilter = 'all' | 'rapid' | 'mid-level';

const TIER_FILTER_OPTIONS: { value: TierFilter; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'rapid',     label: 'Rapid' },
  { value: 'mid-level', label: 'Mid-level' },
];

function TierFilterSelector({
  value,
  onChange,
}: {
  value: TierFilter;
  onChange: (v: TierFilter) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-muted-foreground mr-2 shrink-0">Tier</span>
      <div
        className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5"
        role="group"
        aria-label="Filter by audit tier"
      >
        {TIER_FILTER_OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              'px-2.5 py-1 text-xs rounded font-medium transition-colors',
              value === o.value
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground cursor-pointer',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViewModeSelector
// ---------------------------------------------------------------------------

function ViewModeSelector({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-muted-foreground mr-2 shrink-0">Group by</span>
      <div
        className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5"
        role="group"
        aria-label="Group checks by"
      >
        {VIEW_MODES.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            aria-pressed={value === m.value}
            className={cn(
              'px-2.5 py-1 text-xs rounded font-medium transition-colors',
              value === m.value
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground cursor-pointer',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusSelect — compact inline dropdown for a single check
// ---------------------------------------------------------------------------

function StatusSelect({
  value,
  onChange,
}: {
  value: ManualAuditStatus;
  onChange: (s: ManualAuditStatus) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Select ref={ref} value={value} onValueChange={v => onChange(v as ManualAuditStatus)}>
      <SelectTrigger className="w-36 h-7 text-xs px-2">
        <span className={STATUS_COLORS[value]}>{STATUS_LABELS[value]}</span>
      </SelectTrigger>
      <SelectContent>
        {(['pass', 'fail', 'na', 'not-tested'] as ManualAuditStatus[]).map(s => (
          <SelectItem key={s} value={s} className="text-xs">
            <span className={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// FailureInstanceItem — one recorded failure for a check
// ---------------------------------------------------------------------------

function FailureInstanceItem({
  index,
  failure,
  checkContext,
  onUpdate,
  onDelete,
}: {
  index: number;
  failure: ManualFailureInstance;
  checkContext?: { id: string; title: string; criterion?: string; description?: string };
  onUpdate: (data: FailureUpdateData) => void;
  onDelete: () => void;
}) {
  const [localNotes, setLocalNotes] = useState(failure.notes ?? '');
  const [localCode, setLocalCode] = useState(failure.codeSnippet ?? '');
  const [localRemediation, setLocalRemediation] = useState(failure.remediationRecommendation ?? '');
  const [screenshot, setScreenshot] = useState<string | undefined>(failure.screenshotDataUrl);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [generatingRemediation, setGeneratingRemediation] = useState(false);
  const [remediationError, setRemediationError] = useState<string | null>(null);
  const aiProviders = useAIProviders();
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesId = `failure-notes-${failure.id}`;
  const codeId = `failure-code-${failure.id}`;
  const remediationId = `failure-remediation-${failure.id}`;
  const statusRegionId = `failure-status-${failure.id}`;

  function markDirty() {
    setDirty(true);
    setJustSaved(false);
  }

  function handleSave() {
    onUpdate({
      notes: localNotes || undefined,
      codeSnippet: localCode || undefined,
      screenshotDataUrl: screenshot,
      remediationRecommendation: localRemediation || undefined,
    });
    setDirty(false);
    setJustSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 2500);
  }

  function applyScreenshot(dataUrl: string) {
    setScreenshot(dataUrl);
    onUpdate({ screenshotDataUrl: dataUrl });
  }

  function removeScreenshot() {
    setScreenshot(undefined);
    onUpdate({ screenshotDataUrl: undefined });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') applyScreenshot(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handlePaste() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = ev => {
            if (typeof ev.target?.result === 'string') applyScreenshot(ev.target.result);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    } catch { /* clipboard unavailable */ }
  }

  async function handleGenerateRemediation(provider: string) {
    setGeneratingRemediation(true);
    setRemediationError(null);
    try {
      const res = await fetch('/api/ai/remediation-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criterion: checkContext?.criterion,
          checkTitle: checkContext?.title,
          checkDescription: checkContext?.description,
          notes: localNotes || undefined,
          codeSnippet: localCode || undefined,
          provider,
        }),
      });
      // Parse JSON safely — a stale/unbuilt server may return HTML
      let json: { recommendation?: string; error?: string } = {};
      try { json = await res.json(); } catch { /* non-JSON body */ }

      if (json.recommendation) {
        setLocalRemediation(json.recommendation);
        markDirty();
      } else {
        setRemediationError(
          json.error
            ?? (!res.ok && res.status === 404
              ? 'Endpoint not found — rebuild the scanner server and restart it.'
              : 'Generation failed. Please try again.')
        );
      }
    } catch {
      setRemediationError('Could not reach the scanner server on port 3003. Make sure it is running.');
    } finally {
      setGeneratingRemediation(false);
    }
  }

  return (
    <div className="rounded border border-dashed border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">Instance {index}</span>
          {INSTANCE_STATUS_OPTIONS.map(opt => {
            const active = failure.status === opt.value || (opt.value === 'fail' && !failure.status);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdate({ status: opt.value })}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center rounded border text-xs h-5 px-1.5 py-0 font-medium transition-opacity',
                  active
                    ? INSTANCE_STATUS_COLORS[opt.value]
                    : 'bg-transparent text-muted-foreground border-dashed border-muted-foreground/30 hover:border-muted-foreground/60',
                )}
              >
                {opt.label}
              </button>
            );
          })}
          <span className="text-muted-foreground/30 select-none px-0.5" aria-hidden="true">|</span>
          {SCOPE_OPTIONS.map(opt => {
            const active = failure.scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdate({ scope: active ? undefined : opt.value })}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center rounded border text-xs h-5 px-1.5 py-0 font-medium transition-opacity',
                  active
                    ? SCOPE_COLORS[opt.value]
                    : 'bg-transparent text-muted-foreground border-dashed border-muted-foreground/30 hover:border-muted-foreground/60',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete failure instance ${index}`}
          className="text-muted-foreground hover:text-destructive transition-colors rounded shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Issue description */}
      <div className="space-y-1">
        <Label htmlFor={notesId} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <AlignLeft className="h-3 w-3" aria-hidden="true" /> Describe the issue
        </Label>
        <Textarea
          id={notesId}
          value={localNotes}
          onChange={e => { setLocalNotes(e.target.value); markDirty(); }}
          rows={3}
          className="text-base resize-y"
        />
      </div>

      {/* Code snippet */}
      <div className="space-y-1">
        <Label htmlFor={codeId} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Code2 className="h-3 w-3" aria-hidden="true" /> Code snippet
        </Label>
        <textarea
          id={codeId}
          value={localCode}
          onChange={e => { setLocalCode(e.target.value); markDirty(); }}
          rows={3}
          spellCheck={false}
          className="w-full font-mono text-xs rounded border border-border bg-muted/40 px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Screenshot */}
      <div className="space-y-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <ImageIcon className="h-3 w-3" aria-hidden="true" /> Screenshot
        </span>
        {screenshot ? (
          <div className="relative inline-block">
            {lightboxOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                onClick={() => setLightboxOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Screenshot preview"
              >
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close screenshot preview"
                  className="absolute top-4 right-4 text-white hover:text-white/70 transition-colors"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
                <img
                  src={screenshot}
                  alt="Full-size screenshot"
                  className="max-w-full max-h-full rounded shadow-2xl object-contain"
                  onClick={e => e.stopPropagation()}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="View full-size screenshot"
              className="block rounded border border-border hover:opacity-80 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <img src={screenshot} alt="Screenshot of failure" className="max-w-full max-h-48 rounded object-contain" />
            </button>
            <button type="button" onClick={removeScreenshot} aria-label="Remove screenshot" className="absolute -top-1.5 -right-1.5 h-6 w-6 flex items-center justify-center rounded-full bg-transparent">
              <span aria-hidden="true" className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80">
                <X className="h-3 w-3" aria-hidden="true" />
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3 w-3" aria-hidden="true" /> Upload
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handlePaste}>
              <Clipboard className="h-3 w-3" aria-hidden="true" /> Paste
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" aria-hidden="true" tabIndex={-1} onChange={handleFileChange} />
          </div>
        )}
      </div>

      {/* Remediation recommendation */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={remediationId} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Lightbulb className="h-3 w-3" aria-hidden="true" /> Remediation recommendation
          </Label>
          {aiProviders.length > 0 && (
            <Select
              value=""
              onValueChange={provider => { if (!generatingRemediation) handleGenerateRemediation(provider); }}
            >
              <SelectTrigger className="h-6 text-xs px-2 w-auto gap-1 border-0 shadow-none bg-transparent text-muted-foreground hover:text-foreground focus:ring-0" aria-label="Generate remediation recommendation with AI">
                {generatingRemediation
                  ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /><span>Generating…</span></>
                  : <><Wand2 className="h-3 w-3" aria-hidden="true" /><span>Generate with AI</span></>
                }
              </SelectTrigger>
              <SelectContent>
                {aiProviders.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {remediationError && (
          <p role="alert" className="text-xs text-destructive mt-0.5">{remediationError}</p>
        )}
        <Textarea
          id={remediationId}
          value={localRemediation}
          onChange={e => { setLocalRemediation(e.target.value); markDirty(); }}
          rows={3}
          className="text-base resize-y"
        />
      </div>

      {/* Save + Export buttons */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {/* Polite live region — announces save confirmation to screen readers */}
        <div
          id={statusRegionId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {justSaved ? 'Changes saved.' : ''}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export issue
        </Button>
        {exportOpen && (
          <ExportModal
            report={null}
            singleIssue={{
              kind: 'failure',
              data: {
                notes: localNotes || undefined,
                codeSnippet: localCode || undefined,
                remediationRecommendation: localRemediation || undefined,
                checkContext: checkContext
                  ? { criterion: checkContext.criterion, title: checkContext.title, description: checkContext.description }
                  : undefined,
              },
            }}
            onClose={() => setExportOpen(false)}
          />
        )}
        <Button
          type="button"
          size="sm"
          className={cn(
            'h-7 text-xs gap-1.5 transition-colors',
            justSaved && 'text-green-700 dark:text-green-400',
          )}
          onClick={handleSave}
          disabled={!dirty}
          aria-describedby={statusRegionId}
        >
          {justSaved
            ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Saved</>
            : <><Save className="h-3.5 w-3.5" aria-hidden="true" /> Save</>
          }
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NonTextElementsPanel — smart element list for WCAG 1.1.1
// ---------------------------------------------------------------------------

const ELEMENT_TYPE_LABELS: Record<DetectedElement['elementType'], string> = {
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
  'focus-order-map': 'Focus Order',
  'focus-trigger': 'Focus Trigger',
  'mouse-only': 'Mouse-Only Interaction',
  'no-focus-style': 'No Focus Style',
  'keyboard-trap': 'Keyboard Trap Risk',
  'low-contrast': 'Low Contrast Text',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied to clipboard' : 'Copy code'}
      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {copied ? <Check className="h-3 w-3 text-green-700 dark:text-green-400" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FocusOrderRow — compact row with light/dark modal for WCAG 2.4.3
// ---------------------------------------------------------------------------

function FocusOrderRow({
  element,
  elementTitle,
  criterionId,
  showFailures,
  toggleStatus,
  onAddFailure,
  onUpdateFailure,
  onDeleteFailure,
  onGenerateScreenshot,
}: {
  element: DetectedElement;
  elementTitle: string;
  criterionId?: string;
  showFailures: boolean;
  toggleStatus: (s: 'pass' | 'fail') => void;
  onAddFailure?: () => void;
  onUpdateFailure?: (failureId: string, data: FailureUpdateData) => void;
  onDeleteFailure?: (failureId: string) => void;
  onGenerateScreenshot?: (colorScheme: 'light' | 'dark') => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [generating, setGenerating] = useState<'light' | 'dark' | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const lightUrl = element.screenshotDataUrl;
  const darkUrl  = element.darkScreenshotDataUrl;
  const activeUrl = isDark && darkUrl ? darkUrl : lightUrl;

  async function handleGenerate(colorScheme: 'light' | 'dark') {
    if (!onGenerateScreenshot) return;
    setGenerating(colorScheme);
    try {
      await onGenerateScreenshot(colorScheme);
    } finally {
      setGenerating(null);
    }
  }

  async function handleViewMap() {
    // Generate light mode first if we don't have it yet
    if (!lightUrl && onGenerateScreenshot) {
      await handleGenerate('light');
    }
    setOpen(true);
  }

  return (
    <div className="px-3 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">{element.textAlternative}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={handleViewMap}
            disabled={generating !== null}
            aria-label={`View focus order map for ${element.textAlternative}`}
            className="flex items-center gap-1.5 px-2 py-0.5 text-xs rounded border border-input text-muted-foreground hover:text-foreground hover:border-foreground font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {generating === 'light' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            View map
          </button>
          <Dialog open={open} onOpenChange={(o) => {
            setOpen(o);
            if (!o) { setIsDark(false); setTimeout(() => triggerRef.current?.focus(), 0); }
          }}>
            <DialogContent className="max-w-5xl flex flex-col" style={{ maxHeight: '90vh' }}>
              <DialogHeader>
                <DialogTitle>Focus Order — {element.textAlternative}</DialogTitle>
                <DialogDescription>
                  Tab-order sequence annotated with numbered badges. Review that the visual order matches a logical reading sequence.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-3">
                {(lightUrl || darkUrl) && (
                  <div
                    className="flex items-center rounded-md bg-muted p-0.5 gap-0.5"
                    role="group"
                    aria-label="Color scheme"
                  >
                    <button
                      type="button"
                      onClick={() => setIsDark(false)}
                      aria-pressed={!isDark}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                        !isDark
                          ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                      Light
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!darkUrl) await handleGenerate('dark');
                        setIsDark(true);
                      }}
                      disabled={generating !== null}
                      aria-pressed={isDark}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed',
                        isDark
                          ? 'bg-foreground text-background shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {generating === 'dark'
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                      {darkUrl ? 'Dark' : 'Generate dark'}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => toggleStatus('pass')}
                    aria-pressed={element.auditStatus === 'pass'}
                    aria-label="Mark focus order as pass"
                    className={cn(
                      'px-2 py-0.5 text-xs rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      element.auditStatus === 'pass'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'border-input text-muted-foreground hover:text-green-700 hover:border-green-700',
                    )}
                  >
                    Pass
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleStatus('fail')}
                    aria-pressed={element.auditStatus === 'fail'}
                    aria-label="Mark focus order as fail"
                    className={cn(
                      'px-2 py-0.5 text-xs rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      element.auditStatus === 'fail'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-input text-muted-foreground hover:text-red-700 hover:border-red-700',
                    )}
                  >
                    Fail
                  </button>
                </div>
              </div>
              <div className={cn('flex-1 overflow-auto rounded border min-h-0', isDark ? 'bg-zinc-950' : 'bg-white')}>
                {activeUrl ? (
                  <img
                    src={activeUrl}
                    alt={`Focus order map — ${element.textAlternative}${isDark ? ' (dark mode)' : ' (light mode)'}`}
                    className="w-full"
                  />
                ) : (
                  <div className="flex items-center justify-center h-40 text-base text-muted-foreground">
                    No screenshot available.
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {showFailures && onAddFailure && (
        <FailureInstancesSection
          failures={element.failures}
          checkContext={{ id: element.id, title: elementTitle, criterion: criterionId }}
          onAdd={onAddFailure}
          onUpdate={(fid, data) => onUpdateFailure?.(fid, data)}
          onDelete={fid => onDeleteFailure?.(fid)}
          className="pt-1"
        />
      )}
    </div>
  );
}

function NonTextElementRow({
  element,
  criterionId,
  onUpdate,
  onAddFailure,
  onUpdateFailure,
  onDeleteFailure,
  onGenerateFocusOrderScreenshot,
  onCaptureScreenshot,
}: {
  element: DetectedElement;
  criterionId?: string;
  onUpdate: (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
  onAddFailure?: () => void;
  onUpdateFailure?: (failureId: string, data: FailureUpdateData) => void;
  onDeleteFailure?: (failureId: string) => void;
  onGenerateFocusOrderScreenshot?: (elementId: string, colorScheme: 'light' | 'dark') => Promise<void>;
  onCaptureScreenshot?: () => Promise<void>;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const [isDarkScreenshot, setIsDarkScreenshot] = useState(false);
  const screenshotTriggerRef = useRef<HTMLButtonElement>(null);

  const isDiagnosticElement = element.elementType === 'focus-trigger' || element.elementType === 'mouse-only' || element.elementType === 'focus-order-map' || element.elementType === 'no-focus-style' || element.elementType === 'keyboard-trap' || element.elementType === 'low-contrast';
  const elementLabel = ELEMENT_TYPE_LABELS[element.elementType];
  const elementTitle = element.textAlternative
    ? `${elementLabel}: "${element.textAlternative}"`
    : element.isDecorative
    ? `${elementLabel}: (decorative)`
    : elementLabel;

  function toggleStatus(toggled: 'pass' | 'fail') {
    const next = element.auditStatus === toggled ? 'not-reviewed' : toggled;
    onUpdate(element.id, next);
  }

  const showFailures = element.auditStatus === 'fail' || (element.failures ?? []).length > 0;

  const hasScreenshot = !!(element.screenshotDataUrl || element.contextScreenshotDataUrl);

  // Focus order maps are full-page annotated screenshots — compact row with modal viewer
  if (element.elementType === 'focus-order-map') {
    return (
      <FocusOrderRow
        element={element}
        elementTitle={elementTitle}
        criterionId={criterionId}
        showFailures={showFailures}
        toggleStatus={toggleStatus}
        onAddFailure={onAddFailure}
        onUpdateFailure={onUpdateFailure}
        onDeleteFailure={onDeleteFailure}
        onGenerateScreenshot={onGenerateFocusOrderScreenshot
          ? (colorScheme) => onGenerateFocusOrderScreenshot(element.id, colorScheme)
          : undefined}
      />
    );
  }

  return (
    <>
      {/* Screenshot modal — always rendered; focus manually returned to trigger on close */}
      <Dialog open={contextOpen} onOpenChange={(open) => {
        setContextOpen(open);
        if (!open) { setIsDarkScreenshot(false); setTimeout(() => screenshotTriggerRef.current?.focus(), 0); }
      }}>
        <DialogContent className="max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base font-medium">
              {ELEMENT_TYPE_LABELS[element.elementType]} screenshot
            </DialogTitle>
            <DialogDescription className="sr-only">
              Screenshots captured for this {ELEMENT_TYPE_LABELS[element.elementType].toLowerCase()} element during the accessibility scan.
            </DialogDescription>
          </DialogHeader>
          {/* Light / Dark toggle — shown only when both screenshots are available */}
          {element.screenshotDataUrl && element.darkScreenshotDataUrl && (
            <div className="shrink-0 flex justify-end">
              <div
                className="inline-flex items-center rounded-md bg-muted p-0.5 gap-0.5"
                role="group"
                aria-label="Color scheme"
              >
                <button
                  type="button"
                  onClick={() => setIsDarkScreenshot(false)}
                  aria-pressed={!isDarkScreenshot}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    !isDarkScreenshot
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setIsDarkScreenshot(true)}
                  aria-pressed={isDarkScreenshot}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    isDarkScreenshot
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                  Dark
                </button>
              </div>
            </div>
          )}
          <div className="overflow-y-auto space-y-4 min-h-0">
            {element.contextScreenshotDataUrl && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Page context (element highlighted)</p>
                <img
                  src={element.contextScreenshotDataUrl}
                  alt={`Page context with ${ELEMENT_TYPE_LABELS[element.elementType].toLowerCase()} element highlighted in yellow`}
                  className="w-full rounded border"
                />
              </div>
            )}
            {(element.screenshotDataUrl || element.darkScreenshotDataUrl) && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Element crop</p>
                <img
                  src={(isDarkScreenshot && element.darkScreenshotDataUrl) ? element.darkScreenshotDataUrl : element.screenshotDataUrl}
                  alt={element.textAlternative ?? `${ELEMENT_TYPE_LABELS[element.elementType]} element`}
                  className="max-w-full rounded border"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    <div className="px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* HTML code block with copy button */}
          <div className="relative">
            <pre className="text-sm leading-relaxed font-mono bg-muted text-foreground rounded p-2 pr-8 overflow-x-auto whitespace-pre-wrap break-all border border-border">
              {element.html}
            </pre>
            <div className="absolute top-1.5 right-1.5">
              <CopyButton text={element.html} />
            </div>
          </div>
          {/* Element type + text alternative — shown only when there is no screenshot button */}
          {!hasScreenshot && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{ELEMENT_TYPE_LABELS[element.elementType]}</span>
              {onCaptureScreenshot && element.elementType !== 'focus-trigger' && (
                <CaptureScreenshotButton onCapture={onCaptureScreenshot} />
              )}
              {element.isDecorative ? (
                <Badge variant="outline" className="text-xs h-4 px-1.5 py-0 text-muted-foreground">
                  Decorative
                </Badge>
              ) : element.textAlternative ? (
                <span className="text-xs text-foreground font-mono">
                  &ldquo;{element.textAlternative}&rdquo;
                </span>
              ) : (
                <Badge variant="outline" className="text-xs h-4 px-1.5 py-0 bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800">
                  No text alternative
                </Badge>
              )}
            </div>
          )}
          {/* Screenshot button + screen reader announcement */}
          {(hasScreenshot || element.screenReaderText !== undefined) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {hasScreenshot && (
                <button
                  ref={screenshotTriggerRef}
                  type="button"
                  onClick={() => setContextOpen(true)}
                  aria-haspopup="dialog"
                  className="inline-flex items-center gap-1 text-xs text-link hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded min-w-0"
                >
                  <ImageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {ELEMENT_TYPE_LABELS[element.elementType]}
                    {element.textAlternative
                      ? `: \u201c${element.textAlternative}\u201d`
                      : element.isDecorative
                      ? ': (decorative)'
                      : ': (no text alternative)'}
                  </span>
                  <span aria-hidden="true" className="shrink-0">↗</span>
                </button>
              )}
              {element.screenReaderText !== undefined && (
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                  <span className="text-muted-foreground shrink-0 font-medium">{isDiagnosticElement ? 'Note:' : 'Screen reader:'}</span>
                  {element.screenReaderText ? (
                    isDiagnosticElement
                      ? <span className="text-foreground truncate">{element.screenReaderText}</span>
                      : <span className="font-mono text-foreground truncate">&ldquo;{element.screenReaderText}&rdquo;</span>
                  ) : (
                    <Badge variant="outline" className="text-xs h-5 px-1.5 py-0 bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-300 dark:border-red-700 shrink-0">
                      Silent — not announced
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => toggleStatus('pass')}
            aria-pressed={element.auditStatus === 'pass'}
            aria-label="Mark as pass"
            className={cn(
              'px-2 py-0.5 text-xs rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              element.auditStatus === 'pass'
                ? 'bg-green-600 text-white border-green-600'
                : 'border-input text-muted-foreground hover:text-green-700 hover:border-green-700',
            )}
          >
            Pass
          </button>
          <button
            type="button"
            onClick={() => toggleStatus('fail')}
            aria-pressed={element.auditStatus === 'fail'}
            aria-label="Mark as fail"
            className={cn(
              'px-2 py-0.5 text-xs rounded border font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              element.auditStatus === 'fail'
                ? 'bg-red-600 text-white border-red-600'
                : 'border-input text-muted-foreground hover:text-red-700 hover:border-red-700',
            )}
          >
            Fail
          </button>
        </div>
      </div>
      {showFailures && onAddFailure && (
        <FailureInstancesSection
          failures={element.failures}
          checkContext={{ id: element.id, title: elementTitle, criterion: criterionId, description: undefined }}
          onAdd={onAddFailure}
          onUpdate={(fid, data) => onUpdateFailure?.(fid, data)}
          onDelete={fid => onDeleteFailure?.(fid)}
          className="pt-1"
        />
      )}
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// OnDemandDetectionPanel — shown when elements haven't been detected yet
// ---------------------------------------------------------------------------

type DetectionProgressHandler = (event:
  | { type: 'status'; message: string }
  | { type: 'element'; element: DetectedElement }
) => void;

function CaptureScreenshotButton({ onCapture }: { onCapture: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  async function handleCapture() {
    setRunning(true);
    try { await onCapture(); } finally { setRunning(false); }
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
      onClick={handleCapture}
      disabled={running}
    >
      {running
        ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        : <ImageIcon className="h-3 w-3" aria-hidden="true" />
      }
      {running ? 'Capturing…' : 'Capture screenshot'}
    </Button>
  );
}

function OnDemandDetectionPanel({
  criterionId,
  onDetect,
}: {
  criterionId: string;
  onDetect: (onProgress: DetectionProgressHandler) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [previewElements, setPreviewElements] = useState<DetectedElement[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  async function handleDetect() {
    setRunning(true);
    setStatusMessage('');
    setPreviewElements([]);
    setOpen(true);
    try {
      await onDetect((event) => {
        if (event.type === 'status') {
          setStatusMessage(event.message);
          setLiveAnnouncement(event.message);
        } else if (event.type === 'element') {
          setPreviewElements(prev => [...prev, event.element]);
        }
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-3 mb-3 border rounded overflow-hidden">
      {/* Polite live region: announces status messages and completion to screen readers */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement}
      </div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-base font-medium flex items-center gap-2">
          Detected Elements
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
          {previewElements.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              — {previewElements.length} found{running ? '…' : ''}
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="px-3 py-3 flex flex-col gap-3">
          {statusMessage && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />}
              {statusMessage}
            </p>
          )}
          {!running && !previewElements.length && (
            <p className="text-base text-muted-foreground flex items-start gap-1.5">
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              Detection runs on demand — click below to scan this page ({criterionId}).
            </p>
          )}
          {previewElements.length > 0 && (
            <ul
              className="flex flex-col divide-y text-sm"
              aria-label={`${previewElements.length} element${previewElements.length !== 1 ? 's' : ''} found so far`}
            >
              {previewElements.map((el) => (
                <li key={el.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0 text-muted-foreground">
                    {ELEMENT_TYPE_LABELS[el.elementType]}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {el.textAlternative ?? el.screenReaderText ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button
            size="sm"
            variant="outline"
            className="self-start h-8"
            onClick={handleDetect}
            disabled={running}
            aria-busy={running}
          >
            {running
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden="true" />Detecting…</>
              : 'Detect elements on page'
            }
          </Button>
        </div>
      )}
    </div>
  );
}

function NonTextElementsPanel({
  elements,
  criterionId,
  onUpdate,
  onAddElementFailure,
  onUpdateElementFailure,
  onDeleteElementFailure,
  onAutoPass,
  onAddCriterionFailure,
  emptyLabel = 'No non-text elements detected on this page — nothing to audit for 1.1.1.',
  onGenerateFocusOrderScreenshot,
  onGenerateElementScreenshot,
}: {
  elements: DetectedElement[];
  criterionId?: string;
  onUpdate?: (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
  onAddElementFailure?: (elementId: string) => void;
  onUpdateElementFailure?: (elementId: string, failureId: string, data: FailureUpdateData) => void;
  onDeleteElementFailure?: (elementId: string, failureId: string) => void;
  onAutoPass?: () => void;
  onAddCriterionFailure?: () => void;
  emptyLabel?: string;
  onGenerateFocusOrderScreenshot?: (elementId: string, colorScheme: 'light' | 'dark') => Promise<void>;
  onGenerateElementScreenshot?: (elementId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const reviewed = elements.filter(e => e.auditStatus !== 'not-reviewed').length;
  const failed = elements.filter(e => e.auditStatus === 'fail').length;

  if (elements.length === 0) {
    return (
      <div className="mt-3 mb-3 border rounded overflow-hidden">
        <div className="px-3 py-3 bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base text-muted-foreground">
            <span className="text-green-600">✓</span>
            <span>{emptyLabel}</span>
          </div>
          {onAutoPass && (
            <Button size="sm" variant="outline" onClick={onAutoPass}
              className="border-green-600/50 text-green-700 hover:bg-green-600/10 hover:text-green-700 dark:text-green-400 shrink-0 h-6 text-base px-2">
              Mark Pass
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 mb-3 border rounded overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-base font-medium">
          Detected Elements ({elements.length})
        </span>
        <div className="flex items-center gap-3">
          <span className="text-base text-muted-foreground">
            {reviewed}/{elements.length} reviewed
            {failed > 0 && (
              <span className="text-red-700 dark:text-red-400 ml-2">· {failed} failed</span>
            )}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </div>
      </button>
      {open && (
        <>
          <div className="px-3 py-3 bg-muted/20 border-b flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <p className="text-base text-muted-foreground leading-snug">
              Detection is automated — also review the live page directly for issues not captured below.{' '}
              {onAddCriterionFailure && (
                <button
                  type="button"
                  onClick={onAddCriterionFailure}
                  className="font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                >
                  Add a failure instance
                </button>
              )}{' '}
              for anything found manually.
            </p>
          </div>
          <div className="divide-y">
            {elements.map(el => (
              <NonTextElementRow
                key={el.id}
                element={el}
                criterionId={criterionId}
                onUpdate={onUpdate!}
                onAddFailure={onAddElementFailure ? () => onAddElementFailure(el.id) : undefined}
                onUpdateFailure={onUpdateElementFailure ? (fid, data) => onUpdateElementFailure(el.id, fid, data) : undefined}
                onDeleteFailure={onDeleteElementFailure ? (fid) => onDeleteElementFailure(el.id, fid) : undefined}
                onGenerateFocusOrderScreenshot={onGenerateFocusOrderScreenshot}
                onCaptureScreenshot={onGenerateElementScreenshot ? () => onGenerateElementScreenshot(el.id) : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FailureUpdateData — shared type for failure instance patch payloads
// ---------------------------------------------------------------------------

type FailureUpdateData = Partial<Pick<ManualFailureInstance, 'status' | 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl' | 'remediationRecommendation'>>;

// ---------------------------------------------------------------------------
// FailureInstancesSection — reused in CheckRow, CustomCheckItem, NonTextElementRow
// ---------------------------------------------------------------------------

function FailureInstancesSection({
  failures,
  checkContext,
  onAdd,
  onUpdate,
  onDelete,
  className,
}: {
  failures?: ManualFailureInstance[];
  checkContext: { id: string; title: string; criterion?: string; description?: string };
  onAdd: () => void;
  onUpdate: (failureId: string, data: FailureUpdateData) => void;
  onDelete: (failureId: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      {(failures ?? []).length > 0 && (
        <div className="space-y-2 mb-2">
          {failures!.map((failure, i) => (
            <FailureInstanceItem
              key={failure.id}
              index={i + 1}
              failure={failure}
              checkContext={checkContext}
              onUpdate={data => onUpdate(failure.id, data)}
              onDelete={() => onDelete(failure.id)}
            />
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="h-7 text-xs gap-1.5 border-dashed"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add failure instance
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckRow — a single predefined WCAG check row
// ---------------------------------------------------------------------------

function CheckRow({
  check,
  showMeta,
  onStatusChange,
  onAddFailure,
  onUpdateFailure,
  onDeleteFailure,
  smartElements,
  onUpdateSmartElement,
  onAddElementFailure,
  onUpdateElementFailure,
  onDeleteElementFailure,
  onGenerateFocusOrderScreenshot,
  onDetectElements,
  onGenerateElementScreenshot,
}: {
  check: ManualCheckResult;
  /** show level + category badges (used when the group doesn't already convey this) */
  showMeta?: boolean;
  onStatusChange: (status: ManualAuditStatus) => void;
  onAddFailure: () => void;
  onUpdateFailure: (failureId: string, data: FailureUpdateData) => void;
  onDeleteFailure: (failureId: string) => void;
  smartElements?: DetectedElement[];
  onUpdateSmartElement?: (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
  onAddElementFailure?: (elementId: string) => void;
  onUpdateElementFailure?: (elementId: string, failureId: string, data: FailureUpdateData) => void;
  onDeleteElementFailure?: (elementId: string, failureId: string) => void;
  onGenerateFocusOrderScreenshot?: (elementId: string, colorScheme: 'light' | 'dark') => Promise<void>;
  onDetectElements?: (criterionId: string, onProgress?: DetectionProgressHandler) => Promise<void>;
  onGenerateElementScreenshot?: (criterionId: string, elementId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const meta = check.wcagCriterion ? PREDEFINED_MAP[check.wcagCriterion] : undefined;
  const bodyId = `check-body-${check.id}`;
  const questions = meta?.questions ?? [];
  const [questionStatuses, setQuestionStatuses] = useState<ManualAuditStatus[]>(() => questions.map(() => 'not-tested'));

  const QUESTION_STATUS_OPTIONS: { value: ManualAuditStatus; label: string }[] = [
    { value: 'pass', label: 'Pass' },
    { value: 'fail', label: 'Fail' },
    { value: 'na', label: 'N/A' },
    { value: 'not-tested', label: 'Not tested' },
  ];

  const failCount = (check.failures ?? []).length;
  const elementFailCount = smartElements?.filter(e => e.auditStatus === 'fail').length ?? 0;

  // Wrap element updates to auto-derive criterion status when all elements are reviewed
  const handleSmartElementUpdate = useCallback(
    (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => {
      onUpdateSmartElement?.(elementId, status, comment);
      if (smartElements && smartElements.length > 0) {
        const projected = smartElements.map(e => e.id === elementId ? { ...e, auditStatus: status } : e);
        const allReviewed = projected.every(e => e.auditStatus !== 'not-reviewed');
        if (allReviewed) {
          const anyFailed = projected.some(e => e.auditStatus === 'fail' || (e.failures ?? []).length > 0);
          onStatusChange(anyFailed ? 'fail' : 'pass');
        }
      }
    },
    [onUpdateSmartElement, smartElements, onStatusChange],
  );

  return (
    <div className="border-b last:border-b-0">
      {/* Always-visible header: toggle button (left) + actions (right, outside the button) */}
      <div className="flex items-center pr-3 hover:bg-muted/30 transition-colors group">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="flex-1 min-w-0 flex items-center gap-2 py-2.5 pl-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            {check.wcagCriterion && (
              <span className="font-mono text-base text-muted-foreground shrink-0">{check.wcagCriterion}</span>
            )}
            <span className="text-base font-medium">{check.title}</span>
            {showMeta && (
              <>
                {check.level && (
                  <Badge variant="outline" className={cn('text-xs h-5 px-1.5 py-0', LEVEL_COLORS[check.level])}>
                    {check.level}
                  </Badge>
                )}
                {meta?.category && (() => {
                  const Icon = CATEGORY_ICONS[meta.category];
                  return (
                    <Badge variant="outline" className={cn('text-xs h-5 px-1.5 py-0 font-normal gap-1', CATEGORY_COLORS[meta.category])}>
                      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      {meta.category}
                    </Badge>
                  );
                })()}
                {meta?.auditTags?.map(tag => (
                  <Badge key={tag} variant="outline" className={cn(
                    'text-xs h-5 px-1.5 py-0 font-normal',
                    tag === 'rapid'     && 'bg-teal-50   text-teal-700   border-teal-200',
                    tag === 'mid-level' && 'bg-amber-50  text-amber-700  border-amber-200',
                  )}>
                    {tag === 'rapid' ? 'Rapid' : 'Mid-level'}
                  </Badge>
                ))}
              </>
            )}
            {/* Summary badges shown when collapsed */}
            {!expanded && (
              <>
                {check.status === 'fail' && (
                  <span className="text-xs text-red-700 dark:text-red-400 font-medium">✗ Fail</span>
                )}
                {check.status === 'pass' && (
                  <span className="text-xs text-green-700 dark:text-green-400 font-medium">✓ Pass</span>
                )}
                {check.status === 'na' && (
                  <span className="text-xs text-muted-foreground">— N/A</span>
                )}
                {(failCount > 0 || elementFailCount > 0) && (
                  <span className="text-xs text-red-700 dark:text-red-400">
                    {failCount + elementFailCount} issue{failCount + elementFailCount !== 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
          </div>
        </button>
        {/* Actions sit outside the toggle button — no nested <button> */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setExportOpen(true); }}
            aria-label={`Export "${check.title}"`}
            className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/30 text-xs h-5 px-1.5 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            Export
          </button>
          {exportOpen && (
            <ExportModal
              report={null}
              singleIssue={{ kind: 'check', check }}
              onClose={() => setExportOpen(false)}
            />
          )}
          <StatusSelect value={check.status} onChange={onStatusChange} />
        </div>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div id={bodyId} className="px-4 pb-3 pt-1">
          {check.description && (
            <p className="text-base text-muted-foreground mb-3">{check.description}</p>
          )}

          {/* How to test */}
          {questions.length > 0 && (
            <div className="mb-3 rounded-md bg-muted/40 border border-border px-3 pt-3 pb-2">
              <p className="text-base font-bold text-foreground mb-2.5">How to test</p>
              <ol className="space-y-3">
                {questions.map((q, i) => (
                  <li key={i}>
                    <p className="text-base text-foreground leading-snug mb-1.5">{q}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {QUESTION_STATUS_OPTIONS.map(({ value, label }) => {
                        const selected = questionStatuses[i] === value;
                        const colorClass =
                          value === 'pass' ? selected ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700' : 'text-muted-foreground hover:text-green-700 dark:hover:text-green-400'
                          : value === 'fail' ? selected ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-700' : 'text-muted-foreground hover:text-red-700 dark:hover:text-red-400'
                          : selected ? 'bg-muted text-foreground border-border' : 'text-muted-foreground hover:text-foreground';
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setQuestionStatuses(prev => prev.map((s, idx) => idx === i ? value : s))}
                            className={cn(
                              'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                              selected ? colorClass : cn('border-transparent', colorClass),
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Smart element panel */}
          {smartElements !== undefined ? (
            <NonTextElementsPanel
              elements={smartElements}
              criterionId={check.wcagCriterion}
              onUpdate={handleSmartElementUpdate}
              onAddElementFailure={onAddElementFailure}
              onUpdateElementFailure={onUpdateElementFailure}
              onDeleteElementFailure={onDeleteElementFailure}
              onAutoPass={smartElements.length === 0 ? () => onStatusChange('pass') : undefined}
              onAddCriterionFailure={() => { onAddFailure(); if (check.status !== 'fail') onStatusChange('fail'); }}
              onGenerateFocusOrderScreenshot={onGenerateFocusOrderScreenshot}
              onGenerateElementScreenshot={onGenerateElementScreenshot && check.wcagCriterion
                ? (eid) => onGenerateElementScreenshot(check.wcagCriterion!, eid)
                : undefined}
              emptyLabel={
                check.wcagCriterion === '1.2.1'
                  ? 'No audio or video-only elements detected on this page — nothing to audit for 1.2.1.'
                  : check.wcagCriterion === '1.2.2'
                  ? 'No video elements with audio detected on this page — nothing to audit for 1.2.2.'
                  : check.wcagCriterion === '2.4.4'
                  ? 'No ambiguous links detected on this page — nothing to audit for 2.4.4.'
                  : check.wcagCriterion === '1.3.1'
                  ? 'No form fields, tables, or headings detected on this page — nothing to audit for 1.3.1.'
                  : check.wcagCriterion === '2.4.3'
                  ? 'No focus order data found — click "Detect elements" to scan this page.'
                  : check.wcagCriterion === '3.2.1'
                  ? 'No focus-triggered elements detected on this page — manually tab through all interactive elements to verify none cause a context change.'
                  : check.wcagCriterion === '2.1.1'
                  ? 'No mouse-only interactions detected — manually tab through all functionality to verify keyboard accessibility.'
                  : check.wcagCriterion === '2.4.7'
                  ? 'No focus-style issues detected — tab through the page to visually confirm every element has a visible focus indicator.'
                  : check.wcagCriterion === '2.1.2'
                  ? 'No keyboard trap risks detected — tab through all interactive elements and verify focus is never permanently stuck.'
                  : check.wcagCriterion === '1.1.1'
                  ? 'No non-text elements detected — manually review the page for images, icons, and controls that may lack a text alternative.'
                  : check.wcagCriterion === '1.4.3'
                  ? 'No contrast failures detected — manually verify text against gradient or image backgrounds where computed colors may not reflect the true contrast.'
                  : undefined
              }
            />
          ) : onDetectElements && (
              check.wcagCriterion === '3.2.1' ||
              check.wcagCriterion === '2.4.3' ||
              check.wcagCriterion === '2.1.1' ||
              check.wcagCriterion === '2.4.7' ||
              check.wcagCriterion === '2.1.2' ||
              check.wcagCriterion === '2.4.4' ||
              check.wcagCriterion === '1.1.1' ||
              check.wcagCriterion === '1.3.1' ||
              check.wcagCriterion === '1.4.3'
            ) ? (
            <OnDemandDetectionPanel
              criterionId={check.wcagCriterion}
              onDetect={(onProgress) => onDetectElements(check.wcagCriterion!, onProgress)}
            />
          ) : null}

          {/* Failure instances — only shown when check is marked fail or has existing failures */}
          {(check.status === 'fail' || (check.failures ?? []).length > 0) && (
            <FailureInstancesSection
              failures={check.failures}
              checkContext={{ id: check.id, title: check.title, criterion: check.wcagCriterion, description: check.description }}
              onAdd={onAddFailure}
              onUpdate={(fid, data) => onUpdateFailure(fid, data)}
              onDelete={onDeleteFailure}
              className="mt-2 pt-0"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomCheckItem — a single custom issue card
// ---------------------------------------------------------------------------

function CustomCheckItem({
  check,
  showMeta,
  onStatusChange,
  onNotesChange,
  onDelete,
  onAddFailure,
  onUpdateFailure,
  onDeleteFailure,
}: {
  check: ManualCheckResult;
  showMeta?: boolean;
  onStatusChange: (status: ManualAuditStatus) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onAddFailure?: () => void;
  onUpdateFailure?: (failureId: string, data: FailureUpdateData) => void;
  onDeleteFailure?: (failureId: string) => void;
}) {
  const [localNotes, setLocalNotes] = useState(check.notes ?? '');
  const [exportOpen, setExportOpen] = useState(false);

  const showFailures = check.status === 'fail' || (check.failures ?? []).length > 0;

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-medium">{check.title}</p>
            {showMeta && (
              <Badge variant="outline" className="text-xs h-4 px-1 py-0 font-normal bg-slate-100 text-slate-700 border-slate-200">
                Custom
              </Badge>
            )}
          </div>
          {check.description && (
            <p className="text-xs text-muted-foreground">{check.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            aria-label={`Export "${check.title}"`}
            className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/30 text-xs h-5 px-1.5 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            Export
          </button>
          {exportOpen && (
            <ExportModal
              report={null}
              singleIssue={{ kind: 'check', check }}
              onClose={() => setExportOpen(false)}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label={`Delete custom issue: ${check.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {check.impact && (
          <Badge variant="outline" className="text-xs capitalize">
            {check.impact}
          </Badge>
        )}
        <StatusSelect value={check.status} onChange={onStatusChange} />
      </div>
      <input
        type="text"
        placeholder="Add notes…"
        value={localNotes}
        onChange={e => setLocalNotes(e.target.value)}
        onBlur={() => {
          if (localNotes !== (check.notes ?? '')) {
            onNotesChange(localNotes);
          }
        }}
        className="w-full text-xs border-0 border-b border-dashed border-muted-foreground/30 bg-transparent px-0 py-0.5 focus:outline-none focus:border-muted-foreground placeholder:text-muted-foreground/50"
      />
      {showFailures && onAddFailure && (
        <FailureInstancesSection
          failures={check.failures}
          checkContext={{ id: check.id, title: check.title, criterion: check.wcagCriterion, description: check.description }}
          onAdd={onAddFailure}
          onUpdate={(fid, data) => onUpdateFailure?.(fid, data)}
          onDelete={fid => onDeleteFailure?.(fid)}
          className="pt-1"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckGroupSection — renders one group of checks
// ---------------------------------------------------------------------------

function CheckGroupSection({
  group,
  onStatusChange,
  onNotesChange,
  onDeleteCustomCheck,
  onAddFailure,
  onUpdateFailure,
  onDeleteFailure,
  detectedElements,
  onUpdateDetectedElement,
  onAddElementFailure,
  onUpdateElementFailure,
  onDeleteElementFailure,
  onGenerateFocusOrderScreenshot,
  onDetectElements,
  onGenerateElementScreenshot,
}: {
  group: CheckGroup;
  onStatusChange: (checkId: string, status: ManualAuditStatus) => void;
  onNotesChange: (checkId: string, notes: string) => void;
  onDeleteCustomCheck: (checkId: string) => void;
  onAddFailure: (checkId: string) => void;
  onUpdateFailure: (checkId: string, failureId: string, data: FailureUpdateData) => void;
  onDeleteFailure: (checkId: string, failureId: string) => void;
  detectedElements?: DetectedCriteriaElements;
  onUpdateDetectedElement?: (criterionId: string, elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
  onAddElementFailure?: (criterionId: string, elementId: string) => void;
  onUpdateElementFailure?: (criterionId: string, elementId: string, failureId: string, data: FailureUpdateData) => void;
  onDeleteElementFailure?: (criterionId: string, elementId: string, failureId: string) => void;
  onGenerateFocusOrderScreenshot?: (elementId: string, colorScheme: 'light' | 'dark') => Promise<void>;
  onDetectElements?: (criterionId: string, onProgress?: DetectionProgressHandler) => Promise<void>;
  onGenerateElementScreenshot?: (criterionId: string, elementId: string) => Promise<void>;
}) {
  const headingId = `group-${group.id}`;
  const contentId = `group-${group.id}-content`;
  const [collapsed, setCollapsed] = useState(true);

  const failCount       = group.checks.filter(c => c.status === 'fail').length;
  const passCount       = group.checks.filter(c => c.status === 'pass').length;
  const naCount         = group.checks.filter(c => c.status === 'na').length;
  const notTestedCount  = group.checks.filter(c => c.status === 'not-tested').length;

  return (
    <section aria-labelledby={headingId}>
      {/* WCAG 2.4.6 / 2.4.10 — button inside h3 so the group has a semantic heading */}
      <h3 id={headingId} className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="w-full flex items-center justify-between gap-3 group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground', !collapsed && 'rotate-180')}
            aria-hidden="true"
          />
          <span className="text-base font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground">
            {group.label}
          </span>
          <span className="text-xs font-normal normal-case text-muted-foreground">
            ({group.checks.length})
          </span>
        </div>
        {collapsed && (
          <div className="flex items-center gap-3 text-xs shrink-0">
            {failCount > 0      && <span className="text-red-700 dark:text-red-400 font-medium">{failCount} fail</span>}
            {passCount > 0      && <span className="text-green-700 dark:text-green-400">{passCount} pass</span>}
            {naCount > 0        && <span className="text-muted-foreground">{naCount} n/a</span>}
            {notTestedCount > 0 && <span className="text-muted-foreground">{notTestedCount} not tested</span>}
          </div>
        )}
      </button>
      </h3>
      {!collapsed && (
        <div id={contentId}>
          {group.description && (
            <p className="text-xs text-muted-foreground mb-2 pl-6">{group.description}</p>
          )}
          {group.mixed ? (
            // Status view — mixed predefined + custom, use appropriate row type
            <div className="space-y-2">
              {group.checks.map(check =>
                check.type === 'custom' ? (
                  <CustomCheckItem
                    key={check.id}
                    check={check}
                    showMeta
                    onStatusChange={status => onStatusChange(check.id, status)}
                    onNotesChange={notes => onNotesChange(check.id, notes)}
                    onDelete={() => onDeleteCustomCheck(check.id)}
                    onAddFailure={() => onAddFailure(check.id)}
                    onUpdateFailure={(fid, data) => onUpdateFailure(check.id, fid, data)}
                    onDeleteFailure={fid => onDeleteFailure(check.id, fid)}
                  />
                ) : (
                  <div key={check.id} className="border rounded">
                    <CheckRow
                      check={check}
                      showMeta
                      onStatusChange={status => onStatusChange(check.id, status)}
                      onAddFailure={() => onAddFailure(check.id)}
                      onUpdateFailure={(fid, data) => onUpdateFailure(check.id, fid, data)}
                      onDeleteFailure={fid => onDeleteFailure(check.id, fid)}
                      smartElements={check.wcagCriterion ? detectedElements?.[check.wcagCriterion] : undefined}
                      onUpdateSmartElement={check.wcagCriterion && onUpdateDetectedElement
                        ? (eid, status, comment) => onUpdateDetectedElement!(check.wcagCriterion!, eid, status, comment)
                        : undefined}
                      onAddElementFailure={check.wcagCriterion && onAddElementFailure
                        ? (eid) => onAddElementFailure!(check.wcagCriterion!, eid)
                        : undefined}
                      onUpdateElementFailure={check.wcagCriterion && onUpdateElementFailure
                        ? (eid, fid, data) => onUpdateElementFailure!(check.wcagCriterion!, eid, fid, data)
                        : undefined}
                      onDeleteElementFailure={check.wcagCriterion && onDeleteElementFailure
                        ? (eid, fid) => onDeleteElementFailure!(check.wcagCriterion!, eid, fid)
                        : undefined}
                      onGenerateFocusOrderScreenshot={onGenerateFocusOrderScreenshot}
                      onDetectElements={onDetectElements}
                      onGenerateElementScreenshot={onGenerateElementScreenshot}
                    />
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="border rounded">
              {group.checks.map(check => (
                <CheckRow
                  key={check.id}
                  check={check}
                  showMeta
                  onStatusChange={status => onStatusChange(check.id, status)}
                  onAddFailure={() => onAddFailure(check.id)}
                  onUpdateFailure={(fid, data) => onUpdateFailure(check.id, fid, data)}
                  onDeleteFailure={fid => onDeleteFailure(check.id, fid)}
                  smartElements={check.wcagCriterion ? detectedElements?.[check.wcagCriterion] : undefined}
                  onUpdateSmartElement={check.wcagCriterion && onUpdateDetectedElement
                    ? (eid, status, comment) => onUpdateDetectedElement!(check.wcagCriterion!, eid, status, comment)
                    : undefined}
                  onAddElementFailure={check.wcagCriterion && onAddElementFailure
                    ? (eid) => onAddElementFailure!(check.wcagCriterion!, eid)
                    : undefined}
                  onUpdateElementFailure={check.wcagCriterion && onUpdateElementFailure
                    ? (eid, fid, data) => onUpdateElementFailure!(check.wcagCriterion!, eid, fid, data)
                    : undefined}
                  onDeleteElementFailure={check.wcagCriterion && onDeleteElementFailure
                    ? (eid, fid) => onDeleteElementFailure!(check.wcagCriterion!, eid, fid)
                    : undefined}
                  onGenerateFocusOrderScreenshot={onGenerateFocusOrderScreenshot}
                  onDetectElements={onDetectElements}
                  onGenerateElementScreenshot={onGenerateElementScreenshot}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AddCustomCheckDialog
// ---------------------------------------------------------------------------

type ImpactLevel = 'minor' | 'moderate' | 'serious' | 'critical';

interface CustomCheckFormData {
  title: string;
  description: string;
  impact: ImpactLevel | '';
  status: ManualAuditStatus;
  notes: string;
}

function AddCustomCheckDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: Omit<CustomCheckFormData, 'impact'> & { impact?: ImpactLevel }) => void;
}) {
  const impactRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<CustomCheckFormData>({
    title: '',
    description: '',
    impact: '',
    status: 'not-tested',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onAdd({
      ...form,
      title: form.title.trim(),
      impact: form.impact || undefined,
    });
    setForm({ title: '', description: '', impact: '', status: 'not-tested', notes: '' });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Issue</DialogTitle>
          <DialogDescription className="sr-only">
            Add a custom accessibility issue to this page's manual audit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custom-title">Title <span aria-hidden="true">*</span></Label>
            <Input
              id="custom-title"
              required
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Videos autoplay with sound"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-desc">Description</Label>
            <Textarea
              id="custom-desc"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Describe the issue…"
              className="min-h-[60px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Impact</Label>
              <Select
                ref={impactRef}
                value={form.impact}
                onValueChange={v => setForm(p => ({ ...p, impact: v as ImpactLevel }))}
              >
                <SelectTrigger className="text-base">
                  {form.impact
                    ? <span className="capitalize">{form.impact}</span>
                    : <span className="text-muted-foreground">Select…</span>}
                </SelectTrigger>
                <SelectContent>
                  {(['minor', 'moderate', 'serious', 'critical'] as const).map(i => (
                    <SelectItem key={i} value={i} className="capitalize text-base">{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                ref={statusRef}
                value={form.status}
                onValueChange={v => setForm(p => ({ ...p, status: v as ManualAuditStatus }))}
              >
                <SelectTrigger className="text-base">
                  <span className={STATUS_COLORS[form.status]}>{STATUS_LABELS[form.status]}</span>
                </SelectTrigger>
                <SelectContent>
                  {(['pass', 'fail', 'na', 'not-tested'] as ManualAuditStatus[]).map(s => (
                    <SelectItem key={s} value={s} className="text-base">
                      <span className={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-notes">Notes</Label>
            <Textarea
              id="custom-notes"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Additional context…"
              className="min-h-[60px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim()}>
              Add Issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ManualAuditTab — main exported component
// ---------------------------------------------------------------------------

interface ManualAuditTabProps {
  audit: ManualAudit;
  detectedElements?: DetectedCriteriaElements;
  onStatusChange: (checkId: string, status: ManualAuditStatus) => void;
  onNotesChange: (checkId: string, notes: string) => void;
  onAddCustomCheck: (data: {
    title: string;
    description?: string;
    impact?: ImpactLevel;
    status: ManualAuditStatus;
    notes?: string;
  }) => void;
  onDeleteCustomCheck: (checkId: string) => void;
  onAuditorNotesChange: (notes: string) => void;
  onToggleComplete?: (completed: boolean) => void;
  onAddFailure: (checkId: string) => void;
  onUpdateFailure: (checkId: string, failureId: string, data: FailureUpdateData) => void;
  onDeleteFailure: (checkId: string, failureId: string) => void;
  onUpdateDetectedElement?: (criterionId: string, elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
  onAddElementFailure?: (criterionId: string, elementId: string) => void;
  onUpdateElementFailure?: (criterionId: string, elementId: string, failureId: string, data: FailureUpdateData) => void;
  onDeleteElementFailure?: (criterionId: string, elementId: string, failureId: string) => void;
  onGenerateFocusOrderScreenshot?: (elementId: string, colorScheme: 'light' | 'dark') => Promise<void>;
  onDetectElements?: (criterionId: string, onProgress?: DetectionProgressHandler) => Promise<void>;
  onGenerateElementScreenshot?: (criterionId: string, elementId: string) => Promise<void>;
}

export function ManualAuditTab({
  audit,
  detectedElements,
  onStatusChange,
  onNotesChange,
  onAddCustomCheck,
  onDeleteCustomCheck,
  onAuditorNotesChange,
  onToggleComplete,
  onAddFailure,
  onUpdateFailure,
  onDeleteFailure,
  onUpdateDetectedElement,
  onAddElementFailure,
  onUpdateElementFailure,
  onDeleteElementFailure,
  onGenerateFocusOrderScreenshot,
  onDetectElements,
  onGenerateElementScreenshot,
}: ManualAuditTabProps) {
  const { auditType } = useCurrentReport();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('wcag');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [auditorNotes, setAuditorNotes] = useState(audit.auditorNotes ?? '');
  const markCompleteRef = useRef<HTMLButtonElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);

  // Apply level, tier, and category filters — custom checks always visible
  const visibleChecks = audit.checks.filter(c => {
    if (c.type === 'custom') return true;
    if (levelFilter !== 'all' && c.level !== levelFilter) return false;
    if (tierFilter !== 'all' && !PREDEFINED_MAP[c.id]?.auditTags.includes(tierFilter)) return false;
    if (categoryFilter && PREDEFINED_MAP[c.id]?.category !== categoryFilter) return false;
    return true;
  });
  const filteredAudit = { ...audit, checks: visibleChecks };

  const customChecks = visibleChecks.filter(c => c.type === 'custom');
  const groups = buildGroups(filteredAudit, viewMode);

  // Progress stats scoped to the current level filter
  const total = visibleChecks.length;
  const counts = {
    pass:         visibleChecks.filter(c => c.status === 'pass').length,
    fail:         visibleChecks.filter(c => c.status === 'fail').length,
    na:           visibleChecks.filter(c => c.status === 'na').length,
    'not-tested': visibleChecks.filter(c => c.status === 'not-tested').length,
  };
  const checked = total - counts['not-tested'];
  const progressPct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const isCompleted = audit.completed === true;

  const auditTypeNote = auditType === 'rapid'
    ? `Showing ${RAPID_AUDIT_CHECK_IDS.length} of ${PREDEFINED_CHECKS.length} criteria (Quick Assess)`
    : auditType === 'mid-level'
    ? `Showing ${MID_LEVEL_AUDIT_CHECK_IDS.length} of ${PREDEFINED_CHECKS.length} criteria (Mid-Level)`
    : null;

  return (
    <div className="space-y-6">
      {/* Audit type info note */}
      {auditTypeNote && (
        <p className="text-xs text-muted-foreground border border-border rounded px-3 py-2 bg-muted/30">
          {auditTypeNote}
        </p>
      )}
      {/* Completion banner */}
      {isCompleted && (
        <div className="flex items-center justify-between gap-3 rounded border border-green-600/40 bg-green-600/10 px-4 py-3">
          <div className="flex items-center gap-2 text-base text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Audit marked complete
              {audit.completedAt && (
                <span className="text-xs text-muted-foreground ml-2">
                  {new Date(audit.completedAt).toLocaleString()}
                </span>
              )}
            </span>
          </div>
          {onToggleComplete && (
            <button
              ref={reopenRef}
              type="button"
              onClick={() => { onToggleComplete(false); setTimeout(() => markCompleteRef.current?.focus(), 0); }}
              className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Re-open
            </button>
          )}
        </div>
      )}

      {/* Progress panel */}
      <div className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between text-base">
          <span className="font-medium text-muted-foreground uppercase tracking-wide text-xs">
            Audit Progress
          </span>
          <span className="text-base text-muted-foreground">
            {checked}/{total} checked
          </span>
        </div>
        <Progress value={progressPct} aria-label={`${progressPct}% of checks completed`} />
        <div className="flex flex-wrap gap-3 text-xs" aria-label="Audit progress breakdown">
          <span className="text-green-700 dark:text-green-400">● {counts.pass} Pass</span>
          <span className="text-red-700 dark:text-red-400">● {counts.fail} Fail</span>
          <span className="text-muted-foreground">● {counts.na} N/A</span>
          <span className="text-muted-foreground">● {counts['not-tested']} Not Tested</span>
        </div>
        {onToggleComplete && !isCompleted && (
          <div className="pt-1">
            <Button
              ref={markCompleteRef}
              size="sm"
              variant="outline"
              onClick={() => { onToggleComplete(true); setTimeout(() => reopenRef.current?.focus(), 0); }}
              className="border-green-600/50 text-green-700 hover:bg-green-600/10 hover:text-green-700 dark:text-green-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Mark Audit Complete
            </Button>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="auditor-notes" className="text-xs font-medium text-muted-foreground">
            Auditor Notes
          </label>
          <Textarea
            id="auditor-notes"
            placeholder="Overall notes for this page…"
            value={auditorNotes}
            onChange={e => setAuditorNotes(e.target.value)}
            onBlur={() => {
              if (auditorNotes !== (audit.auditorNotes ?? '')) {
                onAuditorNotesChange(auditorNotes);
              }
            }}
            className="min-h-[60px] text-base"
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <ViewModeSelector value={viewMode} onChange={setViewMode} />
          <div className="flex items-center gap-3 flex-wrap">
            <TierFilterSelector value={tierFilter} onChange={setTierFilter} />
            <LevelFilterSelector value={levelFilter} onChange={setLevelFilter} />
          </div>
        </div>
        {categoryFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtered by:</span>
            {(() => {
              const Icon = CATEGORY_ICONS[categoryFilter];
              return (
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  aria-label={`Remove filter: ${categoryFilter}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded border text-xs px-2 py-0.5 font-normal transition-opacity hover:opacity-75',
                    CATEGORY_COLORS[categoryFilter],
                  )}
                >
                  {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  {categoryFilter}
                  <X className="h-3 w-3 ml-0.5" aria-hidden="true" />
                </button>
              );
            })()}
          </div>
        )}
      </div>

      {/* Check groups */}
      {groups.map(group => (
        <CheckGroupSection
          key={group.id}
          group={group}
          onStatusChange={onStatusChange}
          onNotesChange={onNotesChange}
          onDeleteCustomCheck={onDeleteCustomCheck}
          onAddFailure={onAddFailure}
          onUpdateFailure={onUpdateFailure}
          onDeleteFailure={onDeleteFailure}
          detectedElements={detectedElements}
          onUpdateDetectedElement={onUpdateDetectedElement}
          onAddElementFailure={onAddElementFailure}
          onUpdateElementFailure={onUpdateElementFailure}
          onDeleteElementFailure={onDeleteElementFailure}
          onGenerateFocusOrderScreenshot={onGenerateFocusOrderScreenshot}
          onDetectElements={onDetectElements}
          onGenerateElementScreenshot={onGenerateElementScreenshot}
        />
      ))}

      {/* Custom Issues — shown separately for all modes except status (which already includes them) */}
      {viewMode !== 'status' && (
        <section aria-labelledby="custom-issues-heading">
          <div className="flex items-center justify-between mb-2">
            <h2
              id="custom-issues-heading"
              className="text-base font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Custom Issues
              <span className="ml-1.5 normal-case font-normal">({customChecks.length})</span>
            </h2>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Issue
            </Button>
          </div>
          {customChecks.length === 0 ? (
            <p className="text-base text-muted-foreground border rounded p-4 text-center">
              No custom issues added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {customChecks.map(check => (
                <CustomCheckItem
                  key={check.id}
                  check={check}
                  onStatusChange={status => onStatusChange(check.id, status)}
                  onNotesChange={notes => onNotesChange(check.id, notes)}
                  onDelete={() => onDeleteCustomCheck(check.id)}
                  onAddFailure={() => onAddFailure(check.id)}
                  onUpdateFailure={(fid, data) => onUpdateFailure(check.id, fid, data)}
                  onDeleteFailure={fid => onDeleteFailure(check.id, fid)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* In status mode, show the Add Issue button separately since custom checks are in the groups */}
      {viewMode === 'status' && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Custom Issue
          </Button>
        </div>
      )}

      <AddCustomCheckDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={onAddCustomCheck}
      />
    </div>
  );
}
