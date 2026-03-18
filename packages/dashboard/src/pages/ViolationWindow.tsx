import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useReport } from '@/hooks/useReport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ExternalLink';
import { X, ArrowLeft, FileSearch } from 'lucide-react';

export function ViolationWindow() {
  const { id, violationId } = useParams<{ id: string; violationId: string }>();
  const { report, loading, error } = useReport(id);
  const navigate = useNavigate();

  const allInstances = report
    ? report.results.flatMap(result =>
        result.violations
          .filter(v => v.id === violationId)
          .map(v => ({ violation: v, url: result.url }))
      )
    : [];

  const violation = allInstances[0]?.violation ?? null;

  useEffect(() => {
    if (violation) {
      document.title = `${violation.help} — Violation Detail`;
    }
    return () => { document.title = 'Fueled Access'; };
  }, [violation]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error)   return <div className="p-6">Error: {error}</div>;
  if (!report) return <div className="p-6">Report not found.</div>;
  if (!violation) return <div className="p-6">Violation not found in this report.</div>;

  const affectedPages = [...new Set(allInstances.map(i => i.url))]
    .sort((a, b) => a.localeCompare(b))
    .map(url => ({
      url,
      pageId: report.results.find(r => r.url === url)?.id,
    }));

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

  const criteria = wcagCriteria(violation.tags);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/reports/${id}?tab=pages`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to report
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close violation detail" onClick={() => navigate('/')}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <h1 className="text-2xl font-bold">
        {criteria.length > 0 && (
          <span className="text-muted-foreground font-mono mr-2">{criteria.join(', ')}</span>
        )}
        {violation.help}
      </h1>

      <div className="flex flex-wrap gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Impact</p>
          <Badge variant={impactColors[violation.impact]}>{violation.impact}</Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">WCAG Level</p>
          <p className="font-medium">{violation.level || 'best-practice'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Rule ID</p>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{violation.id}</code>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Description</p>
        <p>{violation.description}</p>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Tags</p>
        <div className="flex flex-wrap gap-1">
          {violation.tags.map(tag => (
            <Badge key={tag} variant="default" className="text-xs">{tag}</Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">
          Affected Pages ({affectedPages.length})
        </p>
        <ul className="space-y-1.5">
          {affectedPages.map(({ url, pageId }) => (
            <li key={url} className="flex items-center gap-3 flex-wrap">
              <ExternalLink href={url} className="break-all text-sm flex-1 min-w-0">{url}</ExternalLink>
              {pageId && (
                <Link
                  to={`/reports/${id}/page/${pageId}`}
                  className="inline-flex items-center gap-1 shrink-0 text-xs text-link hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                >
                  <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                  Page details
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      {violation.nodes.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Examples ({violation.nodes.length})
          </p>
          <div className="space-y-3">
            {violation.nodes.map((node, i) => (
              <div key={i} className="border rounded p-3 space-y-1.5 bg-muted/30">
                <p className="text-xs text-muted-foreground">Example {i + 1}</p>
                <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  <code>{node.html}</code>
                </pre>
                {node.target.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Target: </span>
                    {node.target.join(' > ')}
                  </p>
                )}
                {node.failureSummary && (
                  <p className="text-xs text-muted-foreground">{node.failureSummary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ExternalLink href={violation.helpUrl} className="text-sm">
        Learn more about this rule
      </ExternalLink>
    </div>
  );
}
