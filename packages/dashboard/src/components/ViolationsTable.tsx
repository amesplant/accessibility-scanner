import { Link } from 'react-router-dom';
import { Pagination } from '@/components/ui/pagination';
import { useViolationGroups } from '@/hooks/useViolationGroups';

interface ViolationsTableProps {
  reportId: string;
}

const impactBadgeStyle: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-error-container', text: 'text-on-error-container' },
  serious:  { bg: 'bg-error-container/60', text: 'text-on-error-container' },
  moderate: { bg: 'bg-amber-100', text: 'text-amber-800' },
  minor:    { bg: 'bg-surface-container-high', text: 'text-on-surface-variant' },
};

function ImpactBadge({ impact }: { impact: string }) {
  const style = impactBadgeStyle[impact] ?? impactBadgeStyle.minor;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.text}`}>
      {impact}
    </span>
  );
}

function TypeBadge({ kind }: { kind: 'automated' | 'manual' }) {
  return kind === 'automated' ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-surface-container-high text-on-surface-variant">
      Automated
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary-fixed text-primary">
      Manual
    </span>
  );
}

export function ViolationsTable({ reportId }: ViolationsTableProps) {
  const { items, total, loading, error, page, setPage, totalPages } = useViolationGroups(reportId);

  if (loading) return <div className="text-sm text-on-surface-variant py-4">Loading violations…</div>;
  if (error) return <div className="text-sm text-error py-4">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-on-surface-variant">
        <span>Page {page} of {totalPages} — {total} violation groups</span>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/10">
        <table className="w-full text-left" aria-label="Accessibility violations grouped by type">
          <thead>
            <tr className="bg-surface-container-low">
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Violation</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Type</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Impact</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Level</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Occurrences</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Pages</th>
              <th className="px-6 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {items.map(item => {
              if (item.kind === 'automated') {
                return (
                  <tr key={`auto-${item.violation.id}`} className="hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-sm text-on-surface">{item.violation.help}</p>
                      <p className="text-xs text-on-surface-variant font-mono mt-0.5">{item.violation.id}</p>
                    </td>
                    <td className="px-6 py-4"><TypeBadge kind="automated" /></td>
                    <td className="px-6 py-4"><ImpactBadge impact={item.impact} /></td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{item.violation.level || '—'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-on-surface">{item.count}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{item.pageCount}</td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/reports/${reportId}/violation/${item.violation.id}`}
                        className="text-sm font-bold text-primary hover:underline underline-offset-4"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={`manual-${item.checkId}`} className="hover:bg-surface/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-sm text-on-surface">{item.title}</p>
                    {item.wcagCriterion && (
                      <p className="text-xs text-on-surface-variant font-mono mt-0.5">{item.wcagCriterion}</p>
                    )}
                  </td>
                  <td className="px-6 py-4"><TypeBadge kind="manual" /></td>
                  <td className="px-6 py-4"><ImpactBadge impact={item.impact} /></td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{item.level ?? '—'}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-on-surface">{item.count}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{item.pageCount}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      to={`/reports/${reportId}/page/${item.firstPageId}`}
                      state={{ tab: 'manual' }}
                      className="text-sm font-bold text-primary hover:underline underline-offset-4"
                    >
                      Details
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
