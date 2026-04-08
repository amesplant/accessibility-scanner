import { Link } from 'react-router-dom';
import { ExternalLink } from './ExternalLink';
import { Pagination } from '@/components/ui/pagination';
import { useReportPages } from '@/hooks/useReportPages';

interface PagesListProps {
  reportId: string;
}

export function PagesList({ reportId }: PagesListProps) {
  const { pages, total, loading, error, page, setPage, totalPages } = useReportPages(reportId);

  if (loading) return <div className="text-sm text-on-surface-variant py-4">Loading pages…</div>;
  if (error) return <div className="text-sm text-error py-4">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-on-surface-variant">
        <span>Showing {pages.length} of {total} scanned pages</span>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/10">
        <table className="w-full text-left" aria-label="Scanned pages inventory">
          <thead>
            <tr className="bg-surface-container-low">
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Page</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Issues Found</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {pages.map(p => {
              const isAudited = !!p.manualAudit?.completed;
              const criticalCount = p.violations.filter(v => v.impact === 'critical').length;
              return (
                <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-6 py-5">
                    <p className="font-semibold text-sm text-on-surface">
                      {(() => { try { return new URL(p.url).pathname || p.url; } catch { return p.url; } })()}
                    </p>
                    <ExternalLink href={p.url} className="text-xs text-on-surface-variant break-all">
                      {p.url}
                    </ExternalLink>
                  </td>
                  <td className="px-6 py-5">
                    {isAudited ? (
                      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full w-fit">
                        <span
                          className="material-symbols-outlined text-sm"
                          aria-hidden="true"
                          style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                        >
                          check_circle
                        </span>
                        <span className="text-xs font-bold uppercase tracking-tighter">Audited</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-on-surface-variant bg-surface-container-high px-3 py-1 rounded-full w-fit">
                        <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                        <span className="text-xs font-bold uppercase tracking-tighter">Not Audited</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    {p.violations.length > 0 ? (
                      <div className="flex gap-4 flex-wrap">
                        {criticalCount > 0 && (
                          <span className="text-xs font-medium text-on-surface-variant flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-error inline-block" />
                            {criticalCount} Critical
                          </span>
                        )}
                        <span className="text-xs font-medium text-on-surface-variant flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          {p.violations.length} Detected
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant italic opacity-60">
                        {isAudited ? 'No issues found' : 'Pending review'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Link
                      to={`/reports/${reportId}/page/${p.id}`}
                      className="text-sm font-bold text-primary hover:underline underline-offset-4"
                    >
                      {isAudited ? 'View Results' : 'Audit Now'}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
