import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useReport } from '@/hooks/useReport';
import { useManualAudit } from '@/hooks/useManualAudit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ManualAuditTab } from '@/components/ManualAuditTab';
import { ExternalLink } from '@/components/ExternalLink';
import { X, ArrowLeft, ChevronDown, Image as ImageIcon, Upload, Clipboard } from 'lucide-react';

export function PageWindow() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const { report, loading, error, updateViolationOverride, updateViolationNode } = useReport(id);
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = (location.state as { tab?: string } | null)?.tab ?? 'automated';

  const page = report?.results.find(r => r.id === pageId) ?? null;

  const { audit, detectedElements, updateCheck, updateNotes, addCustomCheck, deleteCustomCheck, updateAuditorNotes, toggleComplete, addFailure, updateFailure, deleteFailure, updateDetectedElement } =
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

  if (loading) return <div className="p-6">Loading…</div>;
  if (error)   return <div className="p-6">Error: {error}</div>;
  if (!report) return <div className="p-6">Report not found.</div>;
  if (!page)   return <div className="p-6">Page not found in this report.</div>;

  const impactColors = {
    critical: 'destructive',
    serious: 'destructive',
    moderate: 'secondary',
    minor: 'outline',
  } as const;

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
      ? `Manual Audit ✓`
      : manualFailCount > 0
        ? `Manual Audit (${manualFailCount} fail / ${manualNotTestedCount} not tested)`
        : `Manual Audit (${audit.checks.length - manualNotTestedCount} checked)`;

  return (
    <div className="container mx-auto p-6 space-y-6 text-base">
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
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full-size screenshot"
            className="max-w-full max-h-full rounded shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/reports/${id}?tab=pages`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to report
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close page detail" onClick={() => navigate('/')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <h1 className="text-xl font-bold break-all">
        <ExternalLink href={page.url}>{page.url}</ExternalLink>
      </h1>

      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Scanned</p>
          <p>{new Date(page.timestamp).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Results</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={page.violations.length > 0 ? 'destructive' : 'secondary'}>
              {page.violations.length} violations
            </Badge>
            <Badge variant="default">{page.passes} passes</Badge>
            <Badge variant="default">{page.incomplete} incomplete</Badge>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start rounded-none pb-0 mb-4">
          <TabsTrigger value="automated">
            {(() => {
              const active = page.violations.filter(v => !v.overrideStatus).length;
              const total = page.violations.length;
              const overridden = total - active;
              if (overridden > 0) return `Automated Issues (${active} active / ${total} total)`;
              return `Automated Issues (${total})`;
            })()}
          </TabsTrigger>
          <TabsTrigger value="manual">
            {manualTabLabel}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automated">
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
              'px-2.5 py-1 text-xs rounded font-medium transition-colors',
              active
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground cursor-pointer',
            );

            return (
              <div className="space-y-3">
                {/* Filter controls */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-muted-foreground mr-2 shrink-0">Impact</span>
                    <div className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5" role="group" aria-label="Filter by impact">
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

                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-muted-foreground mr-2 shrink-0">Level</span>
                    <div className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5" role="group" aria-label="Filter by WCAG level">
                      <button type="button" onClick={() => setLevelFilter('')} aria-pressed={levelFilter === ''} className={segBtn(levelFilter === '')}>
                        All
                      </button>
                      {LEVEL_ORDER.filter(l => levelCounts[l]).map(l => (
                        <button key={l} type="button" onClick={() => setLevelFilter(f => f === l ? '' : l)} aria-pressed={levelFilter === l} className={segBtn(levelFilter === l)}>
                          {l === 'best-practice' ? 'Best Practice' : l} ({levelCounts[l]})
                        </button>
                      ))}
                    </div>
                  </div>

                  {(impactFilter || levelFilter) && (
                    <span className="text-xs text-muted-foreground">
                      Showing {filteredViolations.length} of {page.violations.length}
                    </span>
                  )}
                </div>

                {/* Violation accordion */}
                {filteredViolations.length > 0 ? (
                  <div className="space-y-2">
                    {filteredViolations.map(v => {
                      const criteria = wcagCriteria(v.tags);
                      const isOpen = expandedViolations.has(v.id);
                      const nodeCount = v.nodes.length;
                      const isOverridden = !!v.overrideStatus;
                      return (
                        <div key={v.id} className={cn('border rounded', isOverridden && 'opacity-60')}>
                          {/* Header row — always visible */}
                          <div className="w-full flex items-start justify-between gap-4 px-4 py-3">
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <p className={cn('font-medium leading-snug', isOverridden && 'line-through text-muted-foreground')}>{v.help}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                {!isOverridden && (
                                  <button
                                    type="button"
                                    onClick={() => setImpactFilter(f => f === v.impact ? '' : v.impact)}
                                    aria-label={`Filter by impact: ${v.impact}`}
                                    className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                                  >
                                    <Badge variant={impactColors[v.impact]} className="cursor-pointer hover:opacity-75 transition-opacity">{v.impact}</Badge>
                                  </button>
                                )}
                                {isOverridden && (
                                  <Badge variant="outline" className={cn('text-xs', v.overrideStatus === 'pass' ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400' : '')}>
                                    {v.overrideStatus === 'pass' ? 'Marked pass' : 'Marked N/A'}
                                  </Badge>
                                )}
                                {v.level && (
                                  <button
                                    type="button"
                                    onClick={() => setLevelFilter(f => f === v.level ? '' : (v.level ?? ''))}
                                    aria-label={`Filter by level: ${v.level}`}
                                    className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                                  >
                                    <Badge variant="outline" className="cursor-pointer hover:opacity-75 transition-opacity">{v.level}</Badge>
                                  </button>
                                )}
                                {criteria.map(c => (
                                  <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                                ))}
                                <a
                                  href={v.helpUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                                >
                                  Learn more
                                </a>
                                <span className="text-muted-foreground/30 select-none" aria-hidden="true">|</span>
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
                                        'inline-flex items-center rounded border text-xs h-5 px-1.5 font-medium transition-colors',
                                        active
                                          ? status === 'fail'
                                            ? 'bg-destructive/15 text-red-400 border-destructive/30'
                                            : status === 'pass'
                                              ? 'bg-green-500/15 text-green-400 border-green-500/30'
                                              : 'bg-muted text-muted-foreground border-muted-foreground/30'
                                          : 'bg-transparent text-muted-foreground border-dashed border-muted-foreground/30 hover:border-muted-foreground/60',
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
                              className="flex items-center gap-3 shrink-0 pt-0.5 text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <span className="text-xs">{nodeCount} {nodeCount === 1 ? 'instance' : 'instances'}</span>
                              <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                            </button>
                          </div>

                          {/* Override notes — shown outside the toggle button */}
                          {isOverridden && (
                            <div className="px-4 py-2 border-t border-dashed border-border bg-muted/20">
                              <input
                                type="text"
                                placeholder="Add a note about this override…"
                                value={overrideNotesInput[v.id] ?? v.overrideNotes ?? ''}
                                onChange={e => setOverrideNotesInput(prev => ({ ...prev, [v.id]: e.target.value }))}
                                onBlur={e => updateViolationOverride(pageId!, v.id, v.overrideStatus!, e.target.value || undefined)}
                                className="w-full text-xs border-0 border-b border-dashed border-muted-foreground/30 bg-transparent px-0 py-0.5 focus:outline-none focus:border-muted-foreground placeholder:text-muted-foreground/50"
                              />
                            </div>
                          )}

                          {/* Expanded node list */}
                          {isOpen && (
                            <div className="border-t divide-y">
                              {v.nodes.map((n, i) => {
                                const nodeIsPass = n.overrideStatus === 'pass';
                                return (
                                <div key={i} className={cn('px-4 py-3 space-y-2', nodeIsPass && 'opacity-60')}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">Instance {i + 1}</span>
                                    {(['fail', 'pass'] as const).map(status => {
                                      const active = status === 'fail' ? !n.overrideStatus || n.overrideStatus === 'fail' : n.overrideStatus === 'pass';
                                      return (
                                        <button
                                          key={status}
                                          type="button"
                                          onClick={() => updateViolationNode(pageId!, v.id, i, { overrideStatus: status === 'fail' ? null : 'pass' })}
                                          aria-pressed={active}
                                          className={cn(
                                            'inline-flex items-center rounded border text-xs h-5 px-1.5 font-medium transition-colors',
                                            active
                                              ? status === 'fail'
                                                ? 'bg-destructive/15 text-red-400 border-destructive/30'
                                                : 'bg-green-500/15 text-green-400 border-green-500/30'
                                              : 'bg-transparent text-muted-foreground border-dashed border-muted-foreground/30 hover:border-muted-foreground/60',
                                          )}
                                        >
                                          {status === 'fail' ? 'Fail' : 'Pass'}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {n.failureSummary && (
                                    <p className="text-sm">{n.failureSummary}</p>
                                  )}
                                  {n.target.length > 0 && (
                                    <p className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400 break-all">{n.target.join(' > ')}</p>
                                  )}
                                  {n.html && (
                                    <pre className="text-[12px] leading-relaxed font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all border border-zinc-200 dark:border-zinc-700">{n.html}</pre>
                                  )}
                                  {/* Screenshot */}
                                  {n.screenshotDataUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => setLightboxUrl(n.screenshotDataUrl!)}
                                      aria-haspopup="dialog"
                                      className="inline-flex items-center gap-1 text-xs text-link hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded min-w-0"
                                    >
                                      <ImageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                                      <span className="truncate">View element screenshot</span>
                                      <span aria-hidden="true" className="shrink-0">↗</span>
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openFilePicker(v.id, i)}>
                                        <Upload className="h-3 w-3" /> Upload
                                      </Button>
                                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleNodePaste(v.id, i)}>
                                        <Clipboard className="h-3 w-3" /> Paste
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
                  <p className="text-muted-foreground">No violations match the current filters.</p>
                )}
              </div>
            );
          })() : (
            <p className="text-muted-foreground">No violations found on this page.</p>
          )}
        </TabsContent>

        <TabsContent value="manual">
          <ManualAuditTab
            audit={audit}
            detectedElements={detectedElements}
            onStatusChange={updateCheck}
            onNotesChange={updateNotes}
            onAddCustomCheck={addCustomCheck}
            onDeleteCustomCheck={deleteCustomCheck}
            onAuditorNotesChange={updateAuditorNotes}
            onToggleComplete={toggleComplete}
            onAddFailure={addFailure}
            onUpdateFailure={updateFailure}
            onDeleteFailure={deleteFailure}
            onUpdateDetectedElement={updateDetectedElement}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
