import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useReport } from '@/hooks/useReport';
import { useManualAudit } from '@/hooks/useManualAudit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ManualAuditTab } from '@/components/ManualAuditTab';
import { ExternalLink } from '@/components/ExternalLink';
import { X, ArrowLeft, ChevronDown } from 'lucide-react';

export function PageWindow() {
  const { id, pageId } = useParams<{ id: string; pageId: string }>();
  const { report, loading, error } = useReport(id);
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = (location.state as { tab?: string } | null)?.tab ?? 'automated';

  const page = report?.results.find(r => r.id === pageId) ?? null;

  const { audit, updateCheck, updateNotes, addCustomCheck, deleteCustomCheck, updateAuditorNotes, toggleComplete, addFailure, updateFailure, deleteFailure } =
    useManualAudit(id ?? '', pageId ?? '', page?.manualAudit);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [impactFilter, setImpactFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set());

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
    return () => { document.title = 'Accessibility Scanner'; };
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
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/reports/${id}?tab=pages`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to report
        </Button>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
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
            Automated Issues ({page.violations.length})
          </TabsTrigger>
          <TabsTrigger value="manual">
            {manualTabLabel}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automated">
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
                      return (
                        <div key={v.id} className="border rounded">
                          {/* Header row — always visible */}
                          <button
                            type="button"
                            onClick={() => toggleViolation(v.id)}
                            aria-expanded={isOpen}
                            className="w-full flex items-start justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded group"
                          >
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <p className="font-medium leading-snug">{v.help}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setImpactFilter(f => f === v.impact ? '' : v.impact); }}
                                  aria-label={`Filter by impact: ${v.impact}`}
                                  className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                                >
                                  <Badge variant={impactColors[v.impact]} className="cursor-pointer hover:opacity-75 transition-opacity">{v.impact}</Badge>
                                </button>
                                {v.level && (
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setLevelFilter(f => f === v.level ? '' : (v.level ?? '')); }}
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
                                  onClick={e => e.stopPropagation()}
                                >
                                  Learn more
                                </a>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 pt-0.5">
                              <span className="text-xs text-muted-foreground">{nodeCount} {nodeCount === 1 ? 'instance' : 'instances'}</span>
                              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                            </div>
                          </button>

                          {/* Expanded node list */}
                          {isOpen && (
                            <div className="border-t divide-y">
                              {v.nodes.map((n, i) => (
                                <div key={i} className="px-4 py-3 space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">Instance {i + 1}</p>
                                  {n.failureSummary && (
                                    <p className="text-sm">{n.failureSummary}</p>
                                  )}
                                  {n.target.length > 0 && (
                                    <p className="font-mono text-xs text-muted-foreground break-all">{n.target.join(' > ')}</p>
                                  )}
                                  {n.html && (
                                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{n.html}</pre>
                                  )}
                                </div>
                              ))}
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
            onStatusChange={updateCheck}
            onNotesChange={updateNotes}
            onAddCustomCheck={addCustomCheck}
            onDeleteCustomCheck={deleteCustomCheck}
            onAuditorNotesChange={updateAuditorNotes}
            onToggleComplete={toggleComplete}
            onAddFailure={addFailure}
            onUpdateFailure={updateFailure}
            onDeleteFailure={deleteFailure}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
