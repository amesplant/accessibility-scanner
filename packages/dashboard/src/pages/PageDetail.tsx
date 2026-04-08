import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScanResult } from '@accessibility-scanner/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink } from '@/components/ExternalLink';
import { ViewLayoutToggle, type ViewLayout } from '@/components/ViewLayoutToggle';

interface LocationState {
  page: ScanResult;
}

export function PageDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;
  const [layout, setLayout] = useState<ViewLayout>('list');

  if (!state || !state.page) {
    navigate(-1);
    return null;
  }

  const { page } = state;
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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Page Details</h1>
        <Button variant="default" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="font-medium">URL</p>
          <p className="text-base break-words">
            <ExternalLink href={page.url} className="break-words">{page.url}</ExternalLink>
          </p>
        </div>

        <div>
          <p className="font-medium">Scanned</p>
          <p className="text-base ">
            {new Date(page.timestamp).toLocaleString()}
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <Badge variant={page.violations.length > 0 ? 'destructive' : 'secondary'}>
            {page.violations.length} Violations
          </Badge>
          <Badge variant="default">{page.passes} passes</Badge>
          <Badge variant="default">{page.incomplete} incomplete</Badge>
          <Badge variant="default">{page.inapplicable} inapplicable</Badge>
        </div>

        <div className="space-y-4">
          <div className="flex justify-end">
            <ViewLayoutToggle value={layout} onChange={setLayout} ariaLabel="Page violations layout" />
          </div>

          {layout === 'list' ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Violation</TableHead>
                <TableHead className="min-w-[200px]">Impact</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="min-w-[120px]">WCAG Criteria</TableHead>
                <TableHead className="min-w-[200px]">Location</TableHead>
                <TableHead className="min-w-[200px]">Failure Summary</TableHead>
                <TableHead className="min-w-[200px]">HTML</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.violations.map((v, idx) => {
                const nodes = v.nodes.length ? v.nodes : [{
                  html: '',
                  target: [],
                  failureSummary: ''
                }];

                return nodes.map((n, nidx) => (
                  <TableRow key={`${v.id}-${idx}-${nidx}`}>
                    {nidx === 0 && (
                      <>
                        <TableCell rowSpan={nodes.length} className="min-w-[200px]">
                          <p className="font-medium">
                            <ExternalLink href={v.helpUrl}>
                              {[...wcagCriteria(v.tags), v.help].filter(Boolean).join(' — ')}
                            </ExternalLink>
                          </p>
                        </TableCell>
                        <TableCell rowSpan={nodes.length} className="min-w-[200px]">
                          <Badge variant={impactColors[v.impact]}>{v.impact}</Badge>
                        </TableCell>
                        <TableCell rowSpan={nodes.length}>
                          {v.level
                            ? <Badge variant="outline">{v.level === 'best-practice' ? 'Best Practice' : `WCAG ${v.level}`}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell rowSpan={nodes.length} className="min-w-[120px]">
                          <div className="flex flex-wrap gap-1">
                            {wcagCriteria(v.tags).length > 0
                              ? wcagCriteria(v.tags).map(c => (
                                  <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                                ))
                              : <span className="text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                      </>
                    )}
                    <TableCell className="min-w-[200px]">
                      {n.target.join(' ')}
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <p className="text-xs break-words">
                        {n.failureSummary}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <pre className="text-xs break-words">
                        {n.html}
                      </pre>
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {page.violations.map((violation, idx) => (
                <div key={`${violation.id}-${idx}`} className="rounded-2xl border border-outline-variant/20 bg-background p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">
                        <ExternalLink href={violation.helpUrl}>
                          {[...wcagCriteria(violation.tags), violation.help].filter(Boolean).join(' — ')}
                        </ExternalLink>
                      </p>
                    </div>
                    <Badge variant={impactColors[violation.impact]}>{violation.impact}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {violation.level
                      ? <Badge variant="outline">{violation.level === 'best-practice' ? 'Best Practice' : `WCAG ${violation.level}`}</Badge>
                      : <span className="text-muted-foreground">—</span>}
                    {wcagCriteria(violation.tags).length > 0
                      ? wcagCriteria(violation.tags).map(criteria => (
                          <Badge key={criteria} variant="outline" className="font-mono text-xs">{criteria}</Badge>
                        ))
                      : <span className="text-muted-foreground">No WCAG criterion</span>}
                  </div>

                  <div className="mt-4 space-y-3">
                    {(violation.nodes.length ? violation.nodes : [{ html: '', target: [], failureSummary: '' }]).map((node, nodeIndex) => (
                      <div key={`${violation.id}-${nodeIndex}`} className="rounded-xl bg-muted/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Location</p>
                        <p className="mt-1 text-xs break-words">{node.target.join(' ') || '—'}</p>

                        <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Failure Summary</p>
                        <p className="mt-1 text-xs break-words">{node.failureSummary || '—'}</p>

                        <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">HTML</p>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs">{node.html || '—'}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
