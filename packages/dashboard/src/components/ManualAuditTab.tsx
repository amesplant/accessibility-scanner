import React, { useEffect, useRef, useState } from 'react';
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
import { useCurrentReport } from '@/context/CurrentReportContext';
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
        { id: 'level-a',  label: 'WCAG Level A',  checks: wcagChecks.filter(c => c.level === 'A') },
        { id: 'level-aa', label: 'WCAG Level AA', checks: wcagChecks.filter(c => c.level === 'AA') },
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
  onUpdate,
  onDelete,
}: {
  index: number;
  failure: ManualFailureInstance;
  onUpdate: (data: Partial<Pick<ManualFailureInstance, 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl'>>) => void;
  onDelete: () => void;
}) {
  const [localNotes, setLocalNotes] = useState(failure.notes ?? '');
  const [localCode, setLocalCode] = useState(failure.codeSnippet ?? '');
  const [screenshot, setScreenshot] = useState<string | undefined>(failure.screenshotDataUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function commitNotes(value: string) {
    if (value !== (failure.notes ?? '')) onUpdate({ notes: value || undefined });
  }

  function commitCode(value: string) {
    if (value !== (failure.codeSnippet ?? '')) onUpdate({ codeSnippet: value || undefined, screenshotDataUrl: screenshot });
  }

  function applyScreenshot(dataUrl: string) {
    setScreenshot(dataUrl);
    onUpdate({ codeSnippet: localCode || undefined, screenshotDataUrl: dataUrl });
  }

  function removeScreenshot() {
    setScreenshot(undefined);
    onUpdate({ codeSnippet: localCode || undefined, screenshotDataUrl: undefined });
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

  return (
    <div className="rounded border border-dashed border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground mr-1">Instance {index}</span>
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

      <input
        type="text"
        placeholder="Describe what failed…"
        value={localNotes}
        onChange={e => setLocalNotes(e.target.value)}
        onBlur={() => commitNotes(localNotes)}
        className="w-full text-sm border-0 border-b border-dashed border-muted-foreground/30 bg-transparent px-0 py-0.5 focus:outline-none focus:border-muted-foreground placeholder:text-muted-foreground/50"
      />

      <div className="space-y-3 pl-1">
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Code2 className="h-3 w-3" aria-hidden="true" /> Code snippet
          </label>
          <textarea
            value={localCode}
            onChange={e => setLocalCode(e.target.value)}
            onBlur={() => commitCode(localCode)}
            placeholder="Paste relevant HTML or code here…"
            rows={3}
            spellCheck={false}
            className="w-full font-mono text-xs rounded border border-border bg-muted/40 px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="space-y-1.5">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <ImageIcon className="h-3 w-3" aria-hidden="true" /> Screenshot
          </span>
          {screenshot ? (
            <div className="relative inline-block">
              <img src={screenshot} alt="Screenshot of failure" className="max-w-full max-h-48 rounded border border-border object-contain" />
              <button type="button" onClick={removeScreenshot} aria-label="Remove screenshot" className="absolute -top-1.5 -right-1.5 h-6 w-6 flex items-center justify-center rounded-full bg-transparent">
                <span aria-hidden="true" className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80">
                  <X className="h-3 w-3" aria-hidden="true" />
                </span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3" /> Upload
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handlePaste}>
                <Clipboard className="h-3 w-3" /> Paste
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" aria-hidden="true" tabIndex={-1} onChange={handleFileChange} />
            </div>
          )}
        </div>
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
      className="p-0.5 rounded text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {copied ? <Check className="h-3 w-3 text-green-700 dark:text-green-400" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function NonTextElementRow({
  element,
  onUpdate,
}: {
  element: DetectedElement;
  onUpdate: (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
}) {
  const [comment, setComment] = useState(element.auditComment ?? '');
  const [contextOpen, setContextOpen] = useState(false);
  const screenshotTriggerRef = useRef<HTMLButtonElement>(null);

  function toggleStatus(toggled: 'pass' | 'fail') {
    const next = element.auditStatus === toggled ? 'not-reviewed' : toggled;
    onUpdate(element.id, next, comment || undefined);
  }

  function commitComment() {
    if (comment !== (element.auditComment ?? '')) {
      onUpdate(element.id, element.auditStatus, comment || undefined);
    }
  }

  const hasScreenshot = !!(element.screenshotDataUrl || element.contextScreenshotDataUrl);

  return (
    <>
      {/* Screenshot modal — always rendered; focus manually returned to trigger on close */}
      <Dialog open={contextOpen} onOpenChange={(open) => {
        setContextOpen(open);
        if (!open) setTimeout(() => screenshotTriggerRef.current?.focus(), 0);
      }}>
        <DialogContent className="max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm font-medium">
              {ELEMENT_TYPE_LABELS[element.elementType]} screenshot
            </DialogTitle>
            <DialogDescription className="sr-only">
              Screenshots captured for this {ELEMENT_TYPE_LABELS[element.elementType].toLowerCase()} element during the accessibility scan.
            </DialogDescription>
          </DialogHeader>
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
            {element.screenshotDataUrl && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Element crop</p>
                <img
                  src={element.screenshotDataUrl}
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
            <pre className="text-[12px] leading-relaxed font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded p-2 pr-8 overflow-x-auto whitespace-pre-wrap break-all border border-zinc-200 dark:border-zinc-700">
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
                  <span className="text-zinc-500 dark:text-zinc-400 shrink-0 font-medium">Screen reader:</span>
                  {element.screenReaderText ? (
                    <span className="font-mono text-foreground truncate">&ldquo;{element.screenReaderText}&rdquo;</span>
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
      {element.auditStatus === 'fail' && (
        <Textarea
          aria-label="Comment on this failure"
          placeholder="Comment on this failure…"
          value={comment}
          onChange={e => setComment(e.target.value)}
          onBlur={commitComment}
          className="text-xs min-h-[48px]"
        />
      )}
    </div>
    </>
  );
}

function NonTextElementsPanel({
  elements,
  onUpdate,
  onAutoPass,
  emptyLabel = 'No non-text elements detected on this page — nothing to audit for 1.1.1.',
}: {
  elements: DetectedElement[];
  onUpdate?: (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
  onAutoPass?: () => void;
  emptyLabel?: string;
}) {
  const reviewed = elements.filter(e => e.auditStatus !== 'not-reviewed').length;
  const failed = elements.filter(e => e.auditStatus === 'fail').length;

  if (elements.length === 0) {
    return (
      <div className="mt-3 mb-3 border rounded overflow-hidden">
        <div className="px-3 py-3 bg-muted/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-green-600">✓</span>
            <span>{emptyLabel}</span>
          </div>
          {onAutoPass && (
            <Button size="sm" variant="outline" onClick={onAutoPass}
              className="border-green-600/50 text-green-700 hover:bg-green-600/10 hover:text-green-700 dark:text-green-400 shrink-0 h-6 text-xs px-2">
              Mark Pass
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 mb-3 border rounded overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <span className="text-xs font-medium">
          Detected Elements on Page ({elements.length})
        </span>
        <span className="text-xs text-muted-foreground">
          {reviewed}/{elements.length} reviewed
          {failed > 0 && (
            <span className="text-red-700 dark:text-red-400 ml-2">· {failed} failed</span>
          )}
        </span>
      </div>
      <div className="divide-y">
        {elements.map(el => (
          <NonTextElementRow key={el.id} element={el} onUpdate={onUpdate!} />
        ))}
      </div>
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
}: {
  check: ManualCheckResult;
  /** show level + category badges (used when the group doesn't already convey this) */
  showMeta?: boolean;
  onStatusChange: (status: ManualAuditStatus) => void;
  onAddFailure: () => void;
  onUpdateFailure: (failureId: string, data: Partial<Pick<ManualFailureInstance, 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl'>>) => void;
  onDeleteFailure: (failureId: string) => void;
  smartElements?: DetectedElement[];
  onUpdateSmartElement?: (elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const meta = check.wcagCriterion ? PREDEFINED_MAP[check.wcagCriterion] : undefined;
  const bodyId = `check-body-${check.id}`;
  const howToTestId = `check-howtotest-${check.id}`;
  const questions = meta?.questions ?? [];

  // Auto-expand the row when detected elements arrive (data loads asynchronously)
  useEffect(() => {
    if (smartElements?.length && !autoExpanded) {
      setExpanded(true);
      setAutoExpanded(true);
    }
  }, [smartElements]);

  const failCount = (check.failures ?? []).length;
  const elementFailCount = smartElements?.filter(e => e.auditStatus === 'fail').length ?? 0;

  return (
    <div className="border-b last:border-b-0">
      {/* Always-visible header: chevron + criterion + title + badges + status */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="w-full flex items-center gap-2 py-2.5 px-4 text-left hover:bg-muted/30 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {check.wcagCriterion && (
            <span className="font-mono text-sm text-muted-foreground shrink-0">{check.wcagCriterion}</span>
          )}
          <span className="text-sm font-medium">{check.title}</span>
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
        {/* Status select — stop propagation so clicking it doesn't toggle collapse */}
        <div
          className="shrink-0"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <StatusSelect value={check.status} onChange={onStatusChange} />
        </div>
      </button>

      {/* Expandable body */}
      {expanded && (
        <div id={bodyId} className="px-4 pb-3 pt-1">
          {check.description && (
            <p className="text-sm text-muted-foreground mb-2">{check.description}</p>
          )}

          {/* How to test */}
          {questions.length > 0 && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowQuestions(v => !v)}
                aria-expanded={showQuestions}
                aria-controls={howToTestId}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', showQuestions && 'rotate-180')}
                  aria-hidden="true"
                />
                How to test
              </button>
              {showQuestions && (
                <ul id={howToTestId} className="mt-1.5 space-y-1 pl-3 border-l-2 border-muted">
                  {questions.map((q, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-snug">{q}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Smart element panel */}
          {smartElements !== undefined && (
            <NonTextElementsPanel
              elements={smartElements}
              onUpdate={onUpdateSmartElement}
              onAutoPass={smartElements.length === 0 ? () => onStatusChange('pass') : undefined}
              emptyLabel={
                check.wcagCriterion === '1.2.1'
                  ? 'No audio or video-only elements detected on this page — nothing to audit for 1.2.1.'
                  : undefined
              }
            />
          )}

          {/* Failure instances */}
          {(check.failures ?? []).length > 0 && (
            <div className="mt-3 space-y-2">
              {check.failures!.map((failure, i) => (
                <FailureInstanceItem
                  key={failure.id}
                  index={i + 1}
                  failure={failure}
                  onUpdate={data => onUpdateFailure(failure.id, data)}
                  onDelete={() => onDeleteFailure(failure.id)}
                />
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddFailure}
            className="mt-2 h-7 text-xs gap-1.5 border-dashed"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add failure instance
          </Button>
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
}: {
  check: ManualCheckResult;
  showMeta?: boolean;
  onStatusChange: (status: ManualAuditStatus) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
}) {
  const [localNotes, setLocalNotes] = useState(check.notes ?? '');

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{check.title}</p>
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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onDelete}
          aria-label={`Delete custom issue: ${check.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
}: {
  group: CheckGroup;
  onStatusChange: (checkId: string, status: ManualAuditStatus) => void;
  onNotesChange: (checkId: string, notes: string) => void;
  onDeleteCustomCheck: (checkId: string) => void;
  onAddFailure: (checkId: string) => void;
  onUpdateFailure: (checkId: string, failureId: string, data: Partial<Pick<ManualFailureInstance, 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl'>>) => void;
  onDeleteFailure: (checkId: string, failureId: string) => void;
  detectedElements?: DetectedCriteriaElements;
  onUpdateDetectedElement?: (criterionId: string, elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
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
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground">
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
                <SelectTrigger className="text-sm">
                  {form.impact
                    ? <span className="capitalize">{form.impact}</span>
                    : <span className="text-muted-foreground">Select…</span>}
                </SelectTrigger>
                <SelectContent>
                  {(['minor', 'moderate', 'serious', 'critical'] as const).map(i => (
                    <SelectItem key={i} value={i} className="capitalize text-sm">{i}</SelectItem>
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
                <SelectTrigger className="text-sm">
                  <span className={STATUS_COLORS[form.status]}>{STATUS_LABELS[form.status]}</span>
                </SelectTrigger>
                <SelectContent>
                  {(['pass', 'fail', 'na', 'not-tested'] as ManualAuditStatus[]).map(s => (
                    <SelectItem key={s} value={s} className="text-sm">
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
  onUpdateFailure: (checkId: string, failureId: string, data: Partial<Pick<ManualFailureInstance, 'scope' | 'notes' | 'codeSnippet' | 'screenshotDataUrl'>>) => void;
  onDeleteFailure: (checkId: string, failureId: string) => void;
  onUpdateDetectedElement?: (criterionId: string, elementId: string, status: 'pass' | 'fail' | 'not-reviewed', comment?: string) => void;
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
}: ManualAuditTabProps) {
  const { auditType } = useCurrentReport();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('wcag');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [auditorNotes, setAuditorNotes] = useState(audit.auditorNotes ?? '');
  const markCompleteRef = useRef<HTMLButtonElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);

  // Apply level + category filters — custom checks always visible
  const visibleChecks = audit.checks.filter(c => {
    if (c.type === 'custom') return true;
    if (levelFilter !== 'all' && c.level !== levelFilter) return false;
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
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
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
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground uppercase tracking-wide text-xs">
            Audit Progress
          </span>
          <span className="text-sm text-muted-foreground">
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
            className="min-h-[60px] text-sm"
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <ViewModeSelector value={viewMode} onChange={setViewMode} />
          <LevelFilterSelector value={levelFilter} onChange={setLevelFilter} />
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
        />
      ))}

      {/* Custom Issues — shown separately for all modes except status (which already includes them) */}
      {viewMode !== 'status' && (
        <section aria-labelledby="custom-issues-heading">
          <div className="flex items-center justify-between mb-2">
            <h2
              id="custom-issues-heading"
              className="text-sm font-semibold text-muted-foreground uppercase tracking-wide"
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
            <p className="text-sm text-muted-foreground border rounded p-4 text-center">
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
