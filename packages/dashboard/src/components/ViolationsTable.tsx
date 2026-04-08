import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '@/components/ui/pagination';
import { ViewLayoutToggle, type ViewLayout } from '@/components/ViewLayoutToggle';
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
  const [layout, setLayout] = useState<ViewLayout>('list');

  if (loading) return <div className="text-sm text-on-surface-variant py-4">Loading violations…</div>;
  if (error) return <div className="text-sm text-error py-4">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 text-xs text-on-surface-variant sm:flex-row sm:items-center">
          <span>Page {page} of {totalPages} — {total} violation groups</span>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
        <ViewLayoutToggle value={layout} onChange={setLayout} ariaLabel="Violation groups layout" />
      </div>

      {layout === 'list' ? (
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => {
            const title = item.kind === 'automated' ? item.violation.help : item.title;
            const level = item.kind === 'automated' ? item.violation.level || '—' : item.level ?? '—';
            const identifier = item.kind === 'automated' ? item.violation.id : item.wcagCriterion ?? 'Custom issue';
            const destination = item.kind === 'automated'
              ? `/reports/${reportId}/violation/${item.violation.id}`
              : `/reports/${reportId}/page/${item.firstPageId}`;

            return (
              <div
                key={item.kind === 'automated' ? `auto-${item.violation.id}` : `manual-${item.checkId}`}
                className="rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-[0px_12px_32px_rgba(24,28,32,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-on-surface">{title}</p>
                    <p className="mt-1 text-xs font-mono text-on-surface-variant">{identifier}</p>
                  </div>
                  <TypeBadge kind={item.kind} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <ImpactBadge impact={item.impact} />
                  <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                    {level}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface-container-low p-4 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Occurrences</p>
                    <p className="mt-1 font-semibold text-on-surface">{item.count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Pages</p>
                    <p className="mt-1 font-semibold text-on-surface">{item.pageCount}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <Link
                    to={destination}
                    state={item.kind === 'manual' ? { tab: 'manual' } : undefined}
                    className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
