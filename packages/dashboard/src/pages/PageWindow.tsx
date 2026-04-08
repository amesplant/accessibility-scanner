import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useReportPage } from '@/hooks/useReportPage';
import { useManualAudit } from '@/hooks/useManualAudit';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ManualAuditTab } from '@/components/ManualAuditTab';
import { ExternalLink } from '@/components/ExternalLink';

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

export function PageWindow() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const { page, loading, error, updateViolationOverride, updateViolationNode } = useReportPage(id, pageId);
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = (location.state as { tab?: string } | null)?.tab ?? 'automated';

  const { audit, detectedElements, updateCheck, updateNotes, updateQuestionStatuses, addCustomCheck, deleteCustomCheck, updateAuditorNotes, toggleComplete, addFailure, updateFailure, deleteFailure, updateDetectedElement, addElementFailure, updateElementFailure, deleteElementFailure, generateFocusOrderScreenshot, detectFocusTriggers, generateElementScreenshot } =
    useManualAudit(id ?? '', pageId ?? '', page?.manualAudit, page?.detectedElements);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [impactFilter, setImpactFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set());
  const [overrideNotesInput, setOverrideNotesInput] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingNode, setPendingNode] = useState<{ violationId: string; nodeIndex: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      {/* Nav row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(`/reports/${id}?tab=pages`)}
          className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Back to report
        </button>
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

        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Scanned</p>
            <p className="text-sm text-on-surface">{new Date(page.timestamp).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Results</p>
            <div className="flex flex-wrap gap-2">
              <span className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide',
                page.violations.length > 0
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-secondary-container text-on-secondary-container'
              )}>
                {page.violations.length} violations
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-surface-container-high text-on-surface-variant">
                {page.passes} passes
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-surface-container-high text-on-surface-variant">
                {page.incomplete} incomplete
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-surface-container-high rounded-xl p-1 w-full justify-start">
          <TabsTrigger
            value="automated"
            className="rounded-lg px-5 py-2 text-sm font-semibold data-[state=active]:bg-surface-container-lowest data-[state=active]:text-on-surface data-[state=active]:shadow-sm text-on-surface-variant"
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
            className="rounded-lg px-5 py-2 text-sm font-semibold data-[state=active]:bg-surface-container-lowest data-[state=active]:text-on-surface data-[state=active]:shadow-sm text-on-surface-variant"
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

          {page.violations.length > 0 ? (() => {
            const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const;
            const LEVEL_ORDER = ['A', 'AA', 'AAA', 'best-practice'] as const;

            const impactCounts = page.violations.reduce((acc, v) => {
              acc[v.impact] = (acc[v.impact] ?? 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            const levelCounts = page.violations.reduce((acc, v) => {
              const key = v.level ?? 'best-practice';
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
                {/* Filter controls */}
                <div className="flex flex-wrap items-center gap-4">
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
                      Showing {filteredViolations.length} of {page.violations.length}
                    </span>
                  )}
                </div>

                {/* Violation accordion */}
                {filteredViolations.length > 0 ? (
                  <div className="space-y-3">
                    {filteredViolations.map(v => {
                      const criteria = wcagCriteria(v.tags);
                      const isOpen = expandedViolations.has(v.id);
                      const nodeCount = v.nodes.length;
                      const isOverridden = !!v.overrideStatus;
                      const impactStyle = impactBadgeStyle[v.impact] ?? impactBadgeStyle.minor;
                      return (
                        <div
                          key={v.id}
                          className={cn(
                            'bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-[0px_4px_12px_rgba(24,28,32,0.04)] overflow-hidden',
                            isOverridden && 'opacity-60'
                          )}
                        >
                          {/* Header row */}
                          <div className="w-full flex items-start justify-between gap-4 px-6 py-4">
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
                            <div className="px-6 py-3 border-t border-dashed border-outline-variant/20 bg-surface-container-low/50">
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
                                  <div key={i} className={cn('px-6 py-4 space-y-3', nodeIsPass && 'opacity-60')}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-on-surface-variant">Instance {i + 1}</span>
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
                                    {n.failureSummary && (
                                      <p className="text-sm text-on-surface">{n.failureSummary}</p>
                                    )}
                                    {n.target.length > 0 && (
                                      <p className="text-xs font-mono text-on-surface-variant break-all">{n.target.join(' > ')}</p>
                                    )}
                                    {n.html && (
                                      <pre className="text-xs leading-relaxed font-mono bg-surface-container-high text-on-surface rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
                                        {n.html}
                                      </pre>
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
                )}
              </div>
            );
          })() : (
            <div className="text-center py-16 bg-surface-container-lowest rounded-2xl border border-outline-variant/10">
              <Icon name="check_circle" filled className="text-5xl text-secondary opacity-60 mb-3" />
              <p className="text-sm text-on-surface-variant">No violations found on this page.</p>
            </div>
          )}
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
    </div>
  );
}
