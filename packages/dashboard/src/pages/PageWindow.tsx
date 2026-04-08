import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useReportPage } from '@/hooks/useReportPage';
import { useReport } from '@/hooks/useReport';
import { useManualAudit } from '@/hooks/useManualAudit';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FailureInstanceItem, type FailureInstanceCheckContext, type FailureUpdateData, ManualAuditTab } from '@/components/ManualAuditTab';
import { useLayoutBreadcrumbs } from '@/context/LayoutBreadcrumbContext';
import { ExternalLink } from '@/components/ExternalLink';
import { ExportModal } from '@/components/ExportModal';
import type { AxeRuleResult, ManualFailureInstance } from '@accessibility-scanner/shared';
import { ViewLayoutToggle, type ViewLayout } from '@/components/ViewLayoutToggle';

type AutomatedRuleSource = 'pass' | 'incomplete';

type PromoteDraft = {
  target: string;
  failure: ManualFailureInstance;
};

function Icon({ name, className = '', filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      aria-hidden="true"
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
    >
      {name}
    </span>
  );
}

function createPromoteDraft(source: AutomatedRuleSource, rule: AxeRuleResult): PromoteDraft {
  const createdAt = new Date().toISOString();

  return {
    target: '',
    failure: {
      id: `promote-${source}-${rule.id}`,
      createdAt,
      status: 'fail',
      scope: 'page-specific',
      impact: rule.impact ?? 'moderate',
      title: rule.help,
      notes: '',
      codeSnippet: '',
      remediationRecommendation: '',
    },
  };
}

export function PageWindow() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const { page, loading, error, rescanning, updateViolationOverride, updateViolationNode, rescanPage, promoteRuleToViolation } = useReportPage(id, pageId);
  const { report: reportSummary } = useReport(id);
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = (location.state as { tab?: string } | null)?.tab ?? 'automated';

  const { audit, detectedElements, updateCheck, updateNotes, updateQuestionStatuses, addCustomCheck, deleteCustomCheck, updateAuditorNotes, toggleComplete, addFailure, updateFailure, deleteFailure, updateDetectedElement, addElementFailure, updateElementFailure, deleteElementFailure, generateFocusOrderScreenshot, detectFocusTriggers, generateElementScreenshot } =
    useManualAudit(id ?? '', pageId ?? '', page?.manualAudit, page?.detectedElements);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [automatedView, setAutomatedView] = useState<'violations' | 'passes' | 'incomplete'>('violations');
  const [automatedLayout, setAutomatedLayout] = useState<ViewLayout>('cards');
  const [impactFilter, setImpactFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set());
  const [overrideNotesInput, setOverrideNotesInput] = useState<Record<string, string>>({});
  const [promoteDrafts, setPromoteDrafts] = useState<Record<string, PromoteDraft>>({});
  const [promoteDialogKey, setPromoteDialogKey] = useState<string | null>(null);
  const [promotingRuleKey, setPromotingRuleKey] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingNode, setPendingNode] = useState<{ violationId: string; nodeIndex: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promoteDetailRef = useRef<HTMLDivElement>(null);

  function openFilePicker(violationId: string, nodeIndex: number) {
    setPendingNode({ violationId, nodeIndex });
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingNode || !pageId) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        updateViolationNode(pageId, pendingNode.violationId, pendingNode.nodeIndex, { screenshotDataUrl: ev.target.result });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setPendingNode(null);
  }

  async function handleNodePaste(violationId: string, nodeIndex: number) {
    if (!pageId) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = ev => {
            if (typeof ev.target?.result === 'string') {
              updateViolationNode(pageId, violationId, nodeIndex, { screenshotDataUrl: ev.target.result });
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    } catch { /* clipboard unavailable */ }
  }

  function toggleViolation(id: string) {
    setExpandedViolations(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getPromoteDraftKey(source: AutomatedRuleSource, ruleId: string) {
    return `${source}:${ruleId}`;
  }

  function getPromoteDraft(source: AutomatedRuleSource, rule: AxeRuleResult): PromoteDraft {
    return promoteDrafts[getPromoteDraftKey(source, rule.id)] ?? createPromoteDraft(source, rule);
  }

  function updatePromoteDraft(source: AutomatedRuleSource, rule: AxeRuleResult, patch: Partial<PromoteDraft>) {
    const key = getPromoteDraftKey(source, rule.id);
    setPromoteDrafts((current) => ({
      ...current,
      [key]: {
        ...getPromoteDraft(source, rule),
        ...patch,
      },
    }));
  }

  function updatePromoteFailureDraft(source: AutomatedRuleSource, rule: AxeRuleResult, patch: FailureUpdateData) {
    const key = getPromoteDraftKey(source, rule.id);
    setPromoteDrafts((current) => {
      const base = current[key] ?? createPromoteDraft(source, rule);
      return {
        ...current,
        [key]: {
          ...base,
          failure: {
            ...base.failure,
            ...patch,
            status: patch.status ?? base.failure.status ?? 'fail',
            impact: patch.impact ?? base.failure.impact ?? rule.impact ?? 'moderate',
          },
        },
      };
    });
  }

  async function handlePromoteRule(source: AutomatedRuleSource, rule: AxeRuleResult, includeCustomNode: boolean) {
    const draft = getPromoteDraft(source, rule);
    const key = getPromoteDraftKey(source, rule.id);

    setPromotingRuleKey(key);
    const nextPage = await promoteRuleToViolation(source, rule.id, {
      impact: draft.failure.impact,
      customNode: includeCustomNode
        ? {
            failureSummary: draft.failure.notes?.trim() || draft.failure.title?.trim() || undefined,
            target: draft.target
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean),
            html: draft.failure.codeSnippet ?? '',
            status: draft.failure.status,
            scope: draft.failure.scope,
            impact: draft.failure.impact,
            title: draft.failure.title,
            notes: draft.failure.notes,
            codeSnippet: draft.failure.codeSnippet,
            screenshotDataUrl: draft.failure.screenshotDataUrl,
            remediationRecommendation: draft.failure.remediationRecommendation,
            assignedTo: draft.failure.assignedTo,
            relatedCriteria: draft.failure.relatedCriteria,
            relatedCriteriaNotes: draft.failure.relatedCriteriaNotes,
          }
        : undefined,
    });
    setPromotingRuleKey(null);

    if (nextPage) {
      setAutomatedView('violations');
      setExpandedViolations((current) => new Set(current).add(rule.id));
      setPromoteDialogKey(null);
      setPromoteDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function renderAutomatedRules(source: AutomatedRuleSource, rules: AxeRuleResult[], emptyMessage: string) {
    if (rules.length === 0) {
      return <p className="text-sm text-on-surface-variant py-8 text-center">{emptyMessage}</p>;
    }

    return (
      <div className={cn(automatedLayout === 'cards' ? 'space-y-3' : 'overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-lowest')}>
        {rules.map((rule, index) => {
          const criteria = wcagCriteria(rule.tags);
          const isOpen = expandedViolations.has(rule.id);
          const nodeCount = rule.nodes.length;
          const promoteKey = getPromoteDraftKey(source, rule.id);
          const promoting = promotingRuleKey === promoteKey;

          return (
            <div
              key={rule.id}
              className={cn(
                automatedLayout === 'cards'
                  ? 'overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-lowest shadow-[0px_4px_12px_rgba(24,28,32,0.04)]'
                  : 'overflow-hidden bg-surface-container-lowest',
                automatedLayout === 'list' && index > 0 && 'border-t border-surface-container',
              )}
            >
              <div className={cn('flex w-full items-start justify-between gap-4', automatedLayout === 'cards' ? 'px-6 py-4' : 'px-5 py-3')}>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-semibold text-sm text-on-surface leading-snug">{rule.help}</p>
                  <p className="text-xs text-on-surface-variant leading-5">{rule.description}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {rule.level && (
                      <button
                        type="button"
                        onClick={() => setLevelFilter((current) => current === rule.level ? '' : (rule.level ?? ''))}
                        aria-label={`Filter by level: ${rule.level === 'best-practice' ? 'Best Practice' : `WCAG ${rule.level}`}`}
                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="inline-flex items-center rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary transition-opacity hover:opacity-75">
                          {rule.level === 'best-practice' ? 'Best Practice' : `WCAG ${rule.level}`}
                        </span>
                      </button>
                    )}
                    {criteria.map((criterion) => (
                      <span key={`${rule.id}-${criterion}`} className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-mono font-bold text-on-surface-variant">
                        {criterion}
                      </span>
                    ))}
                    <a
                      href={rule.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                    >
                      Learn more
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-outline-variant/30 text-xs"
                      onClick={() => { void handlePromoteRule(source, rule, false); }}
                      disabled={promoting}
                    >
                      <Icon name={promoting ? 'progress_activity' : 'error'} className={cn('text-[16px]', promoting && 'animate-spin')} />
                      {promoting ? 'Promoting…' : 'Mark as failure'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-outline-variant/30 text-xs"
                      onClick={() => setPromoteDialogKey(promoteKey)}
                      aria-haspopup="dialog"
                    >
                      <Icon name="playlist_add" className="text-[16px]" />
                      Add failure instance
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleViolation(rule.id)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} details for ${rule.help}`}
                  className="flex shrink-0 items-center gap-2 pt-0.5 text-on-surface-variant transition-colors hover:text-on-surface rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="text-xs font-medium">{nodeCount} {nodeCount === 1 ? 'instance' : 'instances'}</span>
                  <Icon name="expand_more" className={cn('text-[20px] transition-transform', isOpen && 'rotate-180')} />
                </button>
              </div>

              {isOpen && (
                <div className="divide-y divide-surface-container border-t border-outline-variant/10">
                  {rule.nodes.map((node, index) => (
                    <div key={`${rule.id}-${index}`} className={cn('space-y-3', automatedLayout === 'cards' ? 'px-6 py-4' : 'px-5 py-3')}>
                      <span className="text-xs font-semibold text-on-surface-variant">Instance {index + 1}</span>
                      {node.failureSummary && (
                        <p className="text-sm text-on-surface">{node.failureSummary}</p>
                      )}
                      {node.target.length > 0 && (
                        <p className="text-xs font-mono text-on-surface-variant break-all">{node.target.join(' > ')}</p>
                      )}
                      {node.html && (
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-surface-container-high p-4 font-mono text-xs leading-relaxed text-on-surface">
                          {node.html}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  async function handleGenerateFocusOrderScreenshot(elementId: string, colorScheme: 'light' | 'dark') {
    const focusElements = detectedElements?.['2.4.3'] ?? [];
    const el = focusElements.find(e => e.id === elementId);
    const viewportLabel = el?.textAlternative?.split(' ')[0] ?? 'Desktop';
    await generateFocusOrderScreenshot(elementId, colorScheme, viewportLabel);
  }

  useEffect(() => {
    if (page) {
      try {
        const label = new URL(page.url).pathname || page.url;
        document.title = `${label} — Page Detail`;
      } catch {
        document.title = `${page.url} — Page Detail`;
      }
    }
    return () => { document.title = 'Seymour'; };
  }, [page]);

  const breadcrumbs = useMemo(() => ([
    { label: 'Dashboard', to: '/' },
    { label: 'Reports', to: '/' },
    { label: reportSummary?.pageTitle || reportSummary?.sitemap || 'Report', to: `/reports/${id}?tab=pages` },
    { label: page?.title || page?.url || 'Page detail' },
  ]), [id, page?.title, page?.url, reportSummary?.pageTitle, reportSummary?.sitemap]);

  useLayoutBreadcrumbs(breadcrumbs);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-on-surface-variant">
      <Icon name="hourglass_empty" className="animate-spin mr-2" />
      Loading page…
    </div>
  );
  if (error)   return <div className="p-8 text-error">Error: {error}</div>;
  if (!page)   return <div className="p-8 text-on-surface-variant">Page not found in this report.</div>;

  const impactBadgeStyle: Record<string, string> = {
    critical: 'bg-error-container text-on-error-container',
    serious:  'bg-error-container/60 text-on-error-container',
    moderate: 'bg-amber-100 text-amber-800',
    minor:    'bg-surface-container-high text-on-surface-variant',
  };

  function wcagCriteria(tags: string[]): string[] {
    return tags
      .filter(t => /^wcag\d{3,}$/.test(t))
      .map(t => {
        const d = t.replace('wcag', '');
        return `${d[0]}.${d[1]}.${d.slice(2)}`;
      });
  }

  const manualFailCount = audit.checks.filter(c => c.status === 'fail').length;
  const manualNotTestedCount = audit.checks.filter(c => c.status === 'not-tested').length;
  const isAuditComplete = audit.completed === true;

  const manualTabLabel =
    isAuditComplete
      ? 'Manual Audit ✓'
      : manualFailCount > 0
        ? `Manual Audit (${manualFailCount} fail / ${manualNotTestedCount} not tested)`
        : `Manual Audit (${audit.checks.length - manualNotTestedCount} checked)`;

  const visiblePassRules = (page.passRules ?? []).filter((rule) => !levelFilter || (rule.level ?? 'best-practice') === levelFilter);
  const visibleIncompleteRules = (page.incompleteRules ?? []).filter((rule) => !levelFilter || (rule.level ?? 'best-practice') === levelFilter);
  const promoteDialogSourceRule = promoteDialogKey
    ? ([...(page.passRules ?? []).map((rule) => ({ source: 'pass' as const, rule })), ...(page.incompleteRules ?? []).map((rule) => ({ source: 'incomplete' as const, rule }))]
      .find((entry) => getPromoteDraftKey(entry.source, entry.rule.id) === promoteDialogKey) ?? null)
    : null;
  const promoteDialogDraft = promoteDialogSourceRule ? getPromoteDraft(promoteDialogSourceRule.source, promoteDialogSourceRule.rule) : null;
  const promoteDialogPromoting = promoteDialogKey !== null && promotingRuleKey === promoteDialogKey;
  const promoteDialogCheckContext: FailureInstanceCheckContext | undefined = promoteDialogSourceRule
    ? {
        id: promoteDialogSourceRule.rule.id,
        title: promoteDialogSourceRule.rule.help,
        criterion: wcagCriteria(promoteDialogSourceRule.rule.tags)[0],
        description: promoteDialogSourceRule.rule.description,
        level: promoteDialogSourceRule.rule.level === 'best-practice' ? undefined : promoteDialogSourceRule.rule.level,
      }
    : undefined;

  return (
    <div className="p-8 space-y-6 text-base">
      {/* Lightbox modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot preview"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close screenshot preview"
            className="absolute top-4 right-4 text-white hover:text-white/70 transition-colors"
          >
            <Icon name="close" className="text-2xl" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full-size screenshot"
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <Dialog
        open={!!promoteDialogSourceRule}
        onOpenChange={(open) => {
          if (!open) setPromoteDialogKey(null);
        }}
      >
        {promoteDialogSourceRule && promoteDialogDraft && (
          <DialogContent
            aria-describedby="automated-failure-dialog-description"
            className="left-auto right-0 top-0 h-screen w-full max-w-[920px] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 border-l border-slate-200 bg-slate-50 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.18)] data-[state=closed]:slide-out-to-right data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-right data-[state=open]:slide-in-from-top-0 sm:max-w-[920px] sm:rounded-none"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              promoteDetailRef.current?.focus();
            }}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{promoteDialogSourceRule.rule.help}</DialogTitle>
              <DialogDescription id="automated-failure-dialog-description">
                Review the automated rule, add a failure instance, and promote it into the page violations list.
              </DialogDescription>
            </DialogHeader>

            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-slate-200 bg-white px-8 py-4">
                <div className="pr-10">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-700/80">Automated Rule</div>
                  <p className="mt-2 text-sm text-slate-500">Use the same review drawer pattern as manual audit checks, then save to create a failure instance and move this rule into violations.</p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden p-6">
                <div
                  ref={promoteDetailRef}
                  tabIndex={-1}
                  className="flex h-full flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-inset"
                >
                  <div className="border-b border-slate-200/70 px-7 py-7 lg:px-8">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
                        Add Failure Instance
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                        {promoteDialogSourceRule.source === 'pass' ? 'Passed rule' : 'Incomplete rule'}
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-2xl font-extrabold tracking-tight text-slate-950">
                          {promoteDialogSourceRule.rule.help}
                        </h3>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                          {promoteDialogSourceRule.rule.description}
                        </p>
                      </div>
                      <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', impactBadgeStyle[promoteDialogDraft.failure.impact ?? 'minor'] ?? impactBadgeStyle.minor)}>
                        {promoteDialogDraft.failure.impact}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {promoteDialogSourceRule.rule.level && (
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-700">
                          {promoteDialogSourceRule.rule.level === 'best-practice' ? 'Best Practice' : `WCAG ${promoteDialogSourceRule.rule.level}`}
                        </span>
                      )}
                      {wcagCriteria(promoteDialogSourceRule.rule.tags).map((criterion) => (
                        <span key={`dialog-${promoteDialogSourceRule.rule.id}-${criterion}`} className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-slate-600">
                          {criterion}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-6 overflow-y-auto px-7 py-7 lg:px-8">
                    <section className="space-y-3 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5">
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Failure Tracking</h4>
                        <p className="mt-1 text-sm text-slate-500">Capture the same failure instance details here before promoting this automated rule.</p>
                      </div>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Selector targets</span>
                        <textarea
                          value={promoteDialogDraft.target}
                          onChange={(event) => updatePromoteDraft(promoteDialogSourceRule.source, promoteDialogSourceRule.rule, { target: event.target.value })}
                          rows={4}
                          className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                        />
                        <p className="text-xs text-slate-500">One selector per line. Leave blank to promote the rule without adding a custom located instance.</p>
                      </label>

                      <FailureInstanceItem
                        index={1}
                        failure={promoteDialogDraft.failure}
                        checkContext={promoteDialogCheckContext}
                        pageUrl={page.url}
                        showDelete={false}
                        showExport={false}
                        showSaveButton={false}
                        onUpdate={(data) => updatePromoteFailureDraft(promoteDialogSourceRule.source, promoteDialogSourceRule.rule, data)}
                        onDraftChange={(data) => updatePromoteFailureDraft(promoteDialogSourceRule.source, promoteDialogSourceRule.rule, data)}
                        onDelete={() => undefined}
                      />
                    </section>
                  </div>

                  <div className="border-t border-slate-200/70 bg-white px-7 py-4 lg:px-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-500">This creates the failure instance and moves the automated rule into the active violations list.</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-full px-5"
                          onClick={() => setPromoteDialogKey(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          className="h-10 rounded-full px-5"
                          onClick={() => { void handlePromoteRule(promoteDialogSourceRule.source, promoteDialogSourceRule.rule, true); }}
                          disabled={promoteDialogPromoting}
                        >
                          <Icon name={promoteDialogPromoting ? 'progress_activity' : 'add_task'} className={cn('mr-2 text-[16px]', promoteDialogPromoting && 'animate-spin')} />
                          {promoteDialogPromoting ? 'Saving…' : 'Create failure and promote'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Nav row */}
      <div className="flex items-center justify-between">
        <div aria-hidden="true" />
        <button
          type="button"
          aria-label="Close page detail"
          onClick={() => navigate('/')}
          className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      {/* Page header */}
      <div className="space-y-3">
        <h1 className="text-xl font-extrabold text-on-surface break-all tracking-tight">
          <ExternalLink href={page.url}>{page.url}</ExternalLink>
        </h1>

        <div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Scanned</p>
            <p className="text-sm text-on-surface">{new Date(page.timestamp).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="inline-flex h-auto w-auto items-center gap-1 rounded-[20px] border border-surface-container-high bg-surface-container-lowest p-1 shadow-[0px_12px_32px_rgba(24,28,32,0.04)]">
          <TabsTrigger
            value="automated"
            className="rounded-[16px] px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors data-[state=active]:bg-cyan-900 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            {(() => {
              const active = page.violations.filter(v => !v.overrideStatus).length;
              const total = page.violations.length;
              const overridden = total - active;
              if (overridden > 0) return `Automated Issues (${active} active / ${total} total)`;
              return `Automated Issues (${total})`;
            })()}
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="rounded-[16px] px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors data-[state=active]:bg-cyan-900 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            {manualTabLabel}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automated" className="mt-6">
          {/* Hidden file input for node screenshots */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden="true"
          />

          {(() => {
            const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const;
            const LEVEL_ORDER = ['A', 'AA', 'AAA', 'best-practice'] as const;
            const activeRulesForLevelCounts = automatedView === 'violations'
              ? page.violations
              : automatedView === 'passes'
                ? (page.passRules ?? [])
                : (page.incompleteRules ?? []);

            const impactCounts = page.violations.reduce((acc, v) => {
              acc[v.impact] = (acc[v.impact] ?? 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            const levelCounts = activeRulesForLevelCounts.reduce((acc, item) => {
              const key = item.level ?? 'best-practice';
              acc[key] = (acc[key] ?? 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            const filteredViolations = page.violations.filter(v => {
              if (impactFilter && v.impact !== impactFilter) return false;
              if (levelFilter && (v.level ?? 'best-practice') !== levelFilter) return false;
              return true;
            });

            const segBtn = (active: boolean) => cn(
              'px-3 py-1 text-xs rounded-lg font-semibold transition-colors',
              active
                ? 'bg-surface-container-lowest shadow-sm text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface cursor-pointer',
            );

            return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-xl bg-surface-container-high p-1 gap-0.5" role="group" aria-label="Automated result type">
                      <button type="button" onClick={() => setAutomatedView('violations')} aria-pressed={automatedView === 'violations'} className={segBtn(automatedView === 'violations')}>
                      Violations ({page.violations.length})
                      </button>
                      <button type="button" onClick={() => setAutomatedView('passes')} aria-pressed={automatedView === 'passes'} className={segBtn(automatedView === 'passes')}>
                      Passed ({page.passes})
                      </button>
                      <button type="button" onClick={() => setAutomatedView('incomplete')} aria-pressed={automatedView === 'incomplete'} className={segBtn(automatedView === 'incomplete')}>
                      Incomplete ({page.incomplete})
                      </button>
                    </div>

                    <ViewLayoutToggle value={automatedLayout} onChange={setAutomatedLayout} ariaLabel="Automated results layout" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-xl border-outline-variant/30"
                    onClick={() => { void rescanPage(); }}
                    disabled={rescanning}
                  >
                    <Icon name={rescanning ? 'progress_activity' : 'refresh'} className={cn('text-[16px]', rescanning && 'animate-spin')} />
                    {rescanning ? 'Rescanning…' : 'Rescan page'}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {automatedView === 'violations' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant font-semibold shrink-0">Impact</span>
                      <div className="inline-flex items-center rounded-xl bg-surface-container-high p-1 gap-0.5" role="group" aria-label="Filter by impact">
                        <button type="button" onClick={() => setImpactFilter('')} aria-pressed={impactFilter === ''} className={segBtn(impactFilter === '')}>
                          All ({page.violations.length})
                        </button>
                        {IMPACT_ORDER.filter(i => impactCounts[i]).map(i => (
                          <button key={i} type="button" onClick={() => setImpactFilter(f => f === i ? '' : i)} aria-pressed={impactFilter === i} className={segBtn(impactFilter === i)}>
                            {i.charAt(0).toUpperCase() + i.slice(1)} ({impactCounts[i]})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-on-surface-variant font-semibold shrink-0">Level</span>
                    <div className="inline-flex items-center rounded-xl bg-surface-container-high p-1 gap-0.5" role="group" aria-label="Filter by WCAG level">
                      <button type="button" onClick={() => setLevelFilter('')} aria-pressed={levelFilter === ''} className={segBtn(levelFilter === '')}>
                        All
                      </button>
                      {LEVEL_ORDER.filter(l => levelCounts[l]).map(l => (
                        <button key={l} type="button" onClick={() => setLevelFilter(f => f === l ? '' : l)} aria-pressed={levelFilter === l} className={segBtn(levelFilter === l)}>
                          {l === 'best-practice' ? 'Best Practice' : `WCAG ${l}`} ({levelCounts[l]})
                        </button>
                      ))}
                    </div>
                  </div>

                  {(impactFilter || levelFilter) && (
                    <span className="text-xs text-on-surface-variant">
                      Showing {
                        automatedView === 'violations'
                          ? filteredViolations.length
                          : automatedView === 'passes'
                            ? visiblePassRules.length
                            : visibleIncompleteRules.length
                      } of {
                        automatedView === 'violations'
                          ? page.violations.length
                          : automatedView === 'passes'
                            ? page.passes
                            : page.incomplete
                      }
                    </span>
                  )}
                </div>

                {automatedView === 'violations' ? (
                  filteredViolations.length > 0 ? (
                  <div className={cn(automatedLayout === 'cards' ? 'space-y-3' : 'overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-lowest')}>
                    {filteredViolations.map((v, index) => {
                      const criteria = wcagCriteria(v.tags);
                      const isOpen = expandedViolations.has(v.id);
                      const nodeCount = v.nodes.length;
                      const isOverridden = !!v.overrideStatus;
                      const impactStyle = impactBadgeStyle[v.impact] ?? impactBadgeStyle.minor;
                      return (
                        <div
                          key={v.id}
                          className={cn(
                            automatedLayout === 'cards'
                              ? 'bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-[0px_4px_12px_rgba(24,28,32,0.04)] overflow-hidden'
                              : 'bg-surface-container-lowest overflow-hidden',
                            automatedLayout === 'list' && index > 0 && 'border-t border-surface-container',
                            isOverridden && 'opacity-60'
                          )}
                        >
                          {/* Header row */}
                          <div className={cn('w-full flex items-start justify-between gap-4', automatedLayout === 'cards' ? 'px-6 py-4' : 'px-5 py-3')}>
                            <div className="flex-1 min-w-0 space-y-2">
                              <p className={cn('font-semibold text-sm text-on-surface leading-snug', isOverridden && 'line-through text-on-surface-variant')}>
                                {v.help}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                {!isOverridden && (
                                  <button
                                    type="button"
                                    onClick={() => setImpactFilter(f => f === v.impact ? '' : v.impact)}
                                    aria-label={`Filter by impact: ${v.impact}`}
                                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                                  >
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:opacity-75 transition-opacity ${impactStyle}`}>
                                      {v.impact}
                                    </span>
                                  </button>
                                )}
                                {isOverridden && (
                                  <span className={cn(
                                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                                    v.overrideStatus === 'pass'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-surface-container-high text-on-surface-variant'
                                  )}>
                                    {v.overrideStatus === 'pass' ? 'Marked pass' : 'Marked N/A'}
                                  </span>
                                )}
                                {v.level && (
                                  <button
                                    type="button"
                                    onClick={() => setLevelFilter(f => f === v.level ? '' : (v.level ?? ''))}
                                    aria-label={`Filter by level: ${v.level === 'best-practice' ? 'Best Practice' : `WCAG ${v.level}`}`}
                                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                                  >
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary-fixed text-primary cursor-pointer hover:opacity-75 transition-opacity">
                                      {v.level === 'best-practice' ? 'Best Practice' : `WCAG ${v.level}`}
                                    </span>
                                  </button>
                                )}
                                {criteria.map(c => (
                                  <span key={c} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-surface-container-high text-on-surface-variant">
                                    {c}
                                  </span>
                                ))}
                                <a
                                  href={v.helpUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                                >
                                  Learn more
                                  <span className="sr-only"> (opens in a new tab)</span>
                                </a>
                                <span className="text-on-surface-variant/30 select-none" aria-hidden="true">|</span>
                                {([
                                  { status: 'fail' as const, label: 'Fail' },
                                  { status: 'pass' as const, label: 'Pass' },
                                  { status: 'na' as const, label: 'N/A' },
                                ]).map(({ status, label }) => {
                                  const active = status === 'fail' ? !v.overrideStatus : v.overrideStatus === status;
                                  return (
                                    <button
                                      key={status}
                                      type="button"
                                      onClick={() => {
                                        if (status === 'fail') {
                                          if (v.overrideStatus) updateViolationOverride(pageId!, v.id, null);
                                        } else {
                                          updateViolationOverride(pageId!, v.id, active ? null : status);
                                        }
                                      }}
                                      aria-pressed={active}
                                      className={cn(
                                        'inline-flex items-center rounded-full border text-[10px] h-5 px-2 font-bold uppercase tracking-wide transition-colors',
                                        active
                                          ? status === 'fail'
                                            ? 'bg-error-container/60 text-on-error-container border-error/30'
                                            : status === 'pass'
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30'
                                          : 'bg-transparent text-on-surface-variant border-dashed border-outline-variant/40 hover:border-outline-variant',
                                      )}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleViolation(v.id)}
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? 'Collapse' : 'Expand'} details for ${v.help}`}
                              className="flex items-center gap-2 shrink-0 pt-0.5 text-on-surface-variant hover:text-on-surface transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <span className="text-xs font-medium">{nodeCount} {nodeCount === 1 ? 'instance' : 'instances'}</span>
                              <Icon
                                name="expand_more"
                                className={cn('text-[20px] transition-transform', isOpen && 'rotate-180')}
                              />
                            </button>
                          </div>

                          {/* Override notes */}
                          {isOverridden && (
                            <div className={cn('border-t border-dashed border-outline-variant/20 bg-surface-container-low/50', automatedLayout === 'cards' ? 'px-6 py-3' : 'px-5 py-3')}>
                              <input
                                type="text"
                                value={overrideNotesInput[v.id] ?? v.overrideNotes ?? ''}
                                onChange={e => setOverrideNotesInput(prev => ({ ...prev, [v.id]: e.target.value }))}
                                onBlur={e => updateViolationOverride(pageId!, v.id, v.overrideStatus!, e.target.value || undefined)}
                                className="w-full text-xs border-0 border-b border-dashed border-outline-variant/40 bg-transparent px-0 py-0.5 focus:outline-none focus:border-on-surface-variant text-on-surface-variant"
                                aria-label="Override note"
                              />
                            </div>
                          )}

                          {/* Expanded node list */}
                          {isOpen && (
                            <div className="border-t border-outline-variant/10 divide-y divide-surface-container">
                              {v.nodes.map((n, i) => {
                                const nodeIsPass = n.overrideStatus === 'pass';
                                return (
                                  <div key={i} className={cn(automatedLayout === 'cards' ? 'px-6 py-4' : 'px-5 py-3', 'space-y-3', nodeIsPass && 'opacity-60')}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-on-surface-variant">Instance {i + 1}</span>
                                      {n.scope && (
                                        <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                                          {n.scope}
                                        </span>
                                      )}
                                      {n.impact && (
                                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', impactBadgeStyle[n.impact] ?? impactBadgeStyle.minor)}>
                                          {n.impact}
                                        </span>
                                      )}
                                      {(['fail', 'pass'] as const).map(status => {
                                        const active = status === 'fail' ? !n.overrideStatus || n.overrideStatus === 'fail' : n.overrideStatus === 'pass';
                                        return (
                                          <button
                                            key={status}
                                            type="button"
                                            onClick={() => updateViolationNode(pageId!, v.id, i, { overrideStatus: status === 'fail' ? null : 'pass' })}
                                            aria-pressed={active}
                                            className={cn(
                                              'inline-flex items-center rounded-full border text-[10px] h-5 px-2 font-bold uppercase tracking-wide transition-colors',
                                              active
                                                ? status === 'fail'
                                                  ? 'bg-error-container/60 text-on-error-container border-error/30'
                                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-transparent text-on-surface-variant border-dashed border-outline-variant/40 hover:border-outline-variant',
                                            )}
                                          >
                                            {status === 'fail' ? 'Fail' : 'Pass'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {n.title && (
                                      <p className="text-sm font-semibold text-on-surface">{n.title}</p>
                                    )}
                                    {(n.notes || n.failureSummary) && (
                                      <p className="text-sm text-on-surface whitespace-pre-wrap">{n.notes || n.failureSummary}</p>
                                    )}
                                    {n.relatedCriteria && n.relatedCriteria.length > 0 && (
                                      <div className="flex flex-wrap gap-2">
                                        {n.relatedCriteria.map((criterion) => (
                                          <span key={`${v.id}-${i}-${criterion}`} className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-mono font-bold text-on-surface-variant">
                                            {criterion}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {n.relatedCriteriaNotes && Object.keys(n.relatedCriteriaNotes).length > 0 && (
                                      <div className="space-y-2 rounded-xl bg-surface-container-high p-4">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Related issue notes</p>
                                        {Object.entries(n.relatedCriteriaNotes).map(([criterion, note]) => (
                                          <div key={`${v.id}-${i}-${criterion}-note`} className="space-y-1">
                                            <p className="text-xs font-mono text-on-surface-variant">{criterion}</p>
                                            <p className="text-sm whitespace-pre-wrap text-on-surface">{note}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {n.target.length > 0 && (
                                      <p className="text-xs font-mono text-on-surface-variant break-all">{n.target.join(' > ')}</p>
                                    )}
                                    {(n.codeSnippet || n.html) && (
                                      <pre className="text-xs leading-relaxed font-mono bg-surface-container-high text-on-surface rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
                                        {n.codeSnippet || n.html}
                                      </pre>
                                    )}
                                    {n.assignedTo && n.assignedTo.length > 0 && (
                                      <p className="text-xs text-on-surface-variant">Assigned to {n.assignedTo.join(', ')}</p>
                                    )}
                                    {n.remediationRecommendation && (
                                      <div className="rounded-xl bg-surface-container-high p-4">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Remediation recommendation</p>
                                        <p className="mt-2 text-sm whitespace-pre-wrap text-on-surface">{n.remediationRecommendation}</p>
                                      </div>
                                    )}
                                    {/* Screenshot */}
                                    {n.screenshotDataUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setLightboxUrl(n.screenshotDataUrl!)}
                                        aria-haspopup="dialog"
                                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-w-0"
                                      >
                                        <Icon name="image" className="text-[16px] shrink-0" />
                                        <span className="truncate">View element screenshot</span>
                                        <Icon name="open_in_new" className="text-[14px] shrink-0" />
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs gap-1 rounded-lg border-outline-variant/30"
                                          onClick={() => openFilePicker(v.id, i)}
                                        >
                                          <Icon name="upload" className="text-[16px]" />
                                          Upload
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs gap-1 rounded-lg border-outline-variant/30"
                                          onClick={() => handleNodePaste(v.id, i)}
                                        >
                                          <Icon name="content_paste" className="text-[16px]" />
                                          Paste
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant py-8 text-center">No violations match the current filters.</p>
                  )
                ) : automatedView === 'passes' ? (
                  (page.passRules ?? []).length > 0
                    ? renderAutomatedRules('pass', visiblePassRules, 'No passed rules match the current filters.')
                    : page.passes > 0
                      ? <p className="text-sm text-on-surface-variant py-8 text-center">Detailed passed results are available after rescanning this page.</p>
                      : <p className="text-sm text-on-surface-variant py-8 text-center">No passed rules were recorded for this page.</p>
                ) : (
                  (page.incompleteRules ?? []).length > 0
                    ? renderAutomatedRules('incomplete', visibleIncompleteRules, 'No incomplete rules match the current filters.')
                    : page.incomplete > 0
                      ? <p className="text-sm text-on-surface-variant py-8 text-center">Detailed incomplete results are available after rescanning this page.</p>
                      : <p className="text-sm text-on-surface-variant py-8 text-center">No incomplete rules were recorded for this page.</p>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="manual" className="mt-6">
          <ManualAuditTab
            audit={audit}
            detectedElements={detectedElements}
            pageUrl={page.url}
            onStatusChange={updateCheck}
            onUpdateQuestionStatuses={updateQuestionStatuses}
            onNotesChange={updateNotes}
            onAddCustomCheck={addCustomCheck}
            onDeleteCustomCheck={deleteCustomCheck}
            onAuditorNotesChange={updateAuditorNotes}
            onToggleComplete={toggleComplete}
            onAddFailure={addFailure}
            onUpdateFailure={updateFailure}
            onDeleteFailure={deleteFailure}
            onUpdateDetectedElement={updateDetectedElement}
            onAddElementFailure={addElementFailure}
            onUpdateElementFailure={updateElementFailure}
            onDeleteElementFailure={deleteElementFailure}
            onGenerateFocusOrderScreenshot={handleGenerateFocusOrderScreenshot}
            onDetectElements={detectFocusTriggers}
            onGenerateElementScreenshot={generateElementScreenshot}
          />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant/10 pt-4">
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-1.5 rounded-xl"
          onClick={() => setExportOpen(true)}
          disabled={!reportSummary}
        >
          <Icon name="download" className="text-[16px]" />
          Export report
        </Button>
        {activeTab === 'automated' && (
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-1.5 rounded-xl"
            onClick={() => { void rescanPage(); }}
            disabled={rescanning}
          >
            <Icon name={rescanning ? 'progress_activity' : 'refresh'} className={cn('text-[16px]', rescanning && 'animate-spin')} />
            {rescanning ? 'Rescanning…' : 'Rescan page'}
          </Button>
        )}
      </div>

      <ExportModal report={exportOpen ? reportSummary : null} onClose={() => setExportOpen(false)} />
    </div>
  );
}
