import { useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useViolationDetail } from '@/hooks/useViolationDetail';
import { useReport } from '@/hooks/useReport';
import { useLayoutBreadcrumbs } from '@/context/LayoutBreadcrumbContext';
import { ExternalLink } from '@/components/ExternalLink';
import { Pagination } from '@/components/ui/pagination';

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

const impactBadgeStyle: Record<string, string> = {
  critical: 'bg-error-container text-on-error-container',
  serious:  'bg-error-container/60 text-on-error-container',
  moderate: 'bg-amber-100 text-amber-800',
  minor:    'bg-surface-container-high text-on-surface-variant',
};

export function ViolationWindow() {
  const { id, violationId } = useParams<{ id: string; violationId: string }>();
  const { group, pages, total, loading, error, page, setPage, totalPages } = useViolationDetail(id, violationId);
  const { report } = useReport(id);
  const navigate = useNavigate();

  const violation = group?.kind === 'automated' ? group.violation : null;

  useEffect(() => {
    if (violation) {
      document.title = `${violation.help} — Violation Detail`;
    }
    return () => { document.title = 'Seymour'; };
  }, [violation]);

  const breadcrumbs = useMemo(() => ([
    { label: 'Dashboard', to: '/' },
    { label: 'Reports', to: '/' },
    { label: report?.pageTitle || report?.sitemap || 'Report', to: `/reports/${id}?tab=violations` },
    { label: 'Violations', to: `/reports/${id}?tab=violations` },
    { label: violation?.help || 'Violation detail' },
  ]), [id, report?.pageTitle, report?.sitemap, violation?.help]);

  useLayoutBreadcrumbs(breadcrumbs);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-on-surface-variant">
      <Icon name="hourglass_empty" className="animate-spin mr-2" />
      Loading…
    </div>
  );
  if (error)  return <div className="p-8 text-error">Error: {error}</div>;
  if (!group) return <div className="p-8 text-on-surface-variant">Violation not found in this report.</div>;
  if (group.kind !== 'automated' || !violation) return <div className="p-8 text-on-surface-variant">Violation not found in this report.</div>;

  function wcagCriteria(tags: string[]): string[] {
    return tags
      .filter(t => /^wcag\d{3,}$/.test(t))
      .map(t => {
        const d = t.replace('wcag', '');
        return `${d[0]}.${d[1]}.${d.slice(2)}`;
      });
  }

  const criteria = wcagCriteria(violation.tags);
  const impactStyle = impactBadgeStyle[violation.impact] ?? impactBadgeStyle.minor;

  return (
    <div className="p-8 space-y-8">
      {/* Nav row */}
      <div className="flex items-center justify-between">
        <div aria-hidden="true" />
        <button
          type="button"
          aria-label="Close violation detail"
          onClick={() => navigate('/')}
          className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <Icon name="close" />
        </button>
      </div>

      {/* Header */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">
          Violation Detail
        </p>
        <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">
          {criteria.length > 0 && (
            <span className="text-on-surface-variant font-mono mr-2 font-normal text-lg">{criteria.join(', ')}</span>
          )}
          {violation.help}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Impact</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${impactStyle}`}>
              {violation.impact}
            </span>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">WCAG Level</p>
            <p className="text-sm font-semibold text-on-surface">
              {violation.level === 'best-practice' || !violation.level ? 'Best Practice' : `WCAG ${violation.level}`}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Rule ID</p>
            <code className="text-xs bg-surface-container-high px-2 py-0.5 rounded font-mono text-on-surface">
              {violation.id}
            </code>
          </div>
        </div>
      </div>

      {/* Content cards */}
      <div className="space-y-6">
        {/* Description */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">Description</h2>
          <p className="text-sm text-on-surface leading-relaxed">{violation.description}</p>
          <ExternalLink
            href={violation.helpUrl}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-4 mt-3"
          >
            <Icon name="open_in_new" className="text-[14px]" />
            Learn more about this rule
          </ExternalLink>
        </div>

        {/* Tags */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {violation.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-surface-container-high text-on-surface-variant"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Affected Pages */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
          <div className="p-6 border-b border-surface-container flex items-center justify-between">
            <h2 className="text-base font-bold text-on-surface">
              Affected Pages
              <span className="ml-2 text-sm font-normal text-on-surface-variant">({total} total)</span>
            </h2>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
          <ul className="divide-y divide-surface-container">
            {pages.map(({ url, pageId }) => (
              <li key={url} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-surface/30 transition-colors">
                <ExternalLink href={url} className="break-all text-sm flex-1 min-w-0 text-on-surface">
                  {url}
                </ExternalLink>
                {pageId && (
                  <Link
                    to={`/reports/${id}/page/${pageId}`}
                    className="inline-flex items-center gap-1.5 shrink-0 text-sm font-semibold text-primary hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                  >
                    <Icon name="manage_search" className="text-[16px]" />
                    Page details
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Examples */}
        {violation.nodes.length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
            <div className="p-6 border-b border-surface-container">
              <h2 className="text-base font-bold text-on-surface">
                Examples
                <span className="ml-2 text-sm font-normal text-on-surface-variant">({violation.nodes.length})</span>
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {violation.nodes.map((node, i) => (
                <div key={i} className="bg-surface-container-low rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Example {i + 1}</p>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono bg-surface-container-high rounded-lg p-3 text-on-surface">
                    <code>{node.html}</code>
                  </pre>
                  {node.target.length > 0 && (
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-semibold">Target: </span>
                      <code className="font-mono">{node.target.join(' > ')}</code>
                    </p>
                  )}
                  {node.failureSummary && (
                    <p className="text-xs text-on-surface-variant">{node.failureSummary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
