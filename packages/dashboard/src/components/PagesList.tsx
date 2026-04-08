import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink } from './ExternalLink';
import { ViewLayoutToggle, type ViewLayout } from './ViewLayoutToggle';
import { Pagination } from '@/components/ui/pagination';
import { useReportPages } from '@/hooks/useReportPages';
import { cn } from '@/lib/utils';

interface PagesListProps {
  reportId: string;
}

type PageBoardColumnId = 'backlog' | 'in-review' | 'audited';
type PageBoardFilter = 'all' | 'needs-attention' | 'unaudited' | 'audited';

const PAGE_FILTER_OPTIONS: { value: PageBoardFilter; label: string }[] = [
  { value: 'all', label: 'All pages' },
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'unaudited', label: 'Unaudited' },
  { value: 'audited', label: 'Audited' },
];

const PAGE_COLUMN_META: Record<PageBoardColumnId, { title: string; badge: string; empty: string }> = {
  backlog: {
    title: 'Audit Backlog',
    badge: 'bg-slate-200 text-slate-700',
    empty: 'No pages are waiting for a first manual pass.',
  },
  'in-review': {
    title: 'In Review',
    badge: 'bg-cyan-900 text-white',
    empty: 'No pages currently have an in-progress manual audit.',
  },
  audited: {
    title: 'Audited',
    badge: 'bg-emerald-700 text-white',
    empty: 'No pages have been marked complete yet.',
  },
};

function getPagePathLabel(url: string) {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

function getPageAuditSnapshot(page: ReturnType<typeof useReportPages>['pages'][number]) {
  const checks = page.manualAudit?.checks ?? [];
  const checked = checks.filter((check) => check.status !== 'not-tested').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;
  const pendingCount = checks.filter((check) => check.status === 'not-tested').length;

  return {
    checked,
    failCount,
    pendingCount,
    hasAudit: checks.length > 0,
    completed: page.manualAudit?.completed === true,
  };
}

function getPageBoardColumn(page: ReturnType<typeof useReportPages>['pages'][number]): PageBoardColumnId {
  const snapshot = getPageAuditSnapshot(page);
  if (snapshot.completed) return 'audited';
  if (snapshot.hasAudit && snapshot.checked > 0) return 'in-review';
  return 'backlog';
}

function PageBoardCard({ reportId, page }: { reportId: string; page: ReturnType<typeof useReportPages>['pages'][number] }) {
  const pathLabel = getPagePathLabel(page.url);
  const criticalCount = page.violations.filter((violation) => violation.impact === 'critical').length;
  const snapshot = getPageAuditSnapshot(page);
  const statusText = snapshot.completed
    ? 'Audited'
    : snapshot.checked > 0
    ? 'In review'
    : 'Ready for audit';

  return (
    <Link
      to={`/reports/${reportId}/page/${page.id}`}
      state={{ tab: 'manual' }}
      aria-label={`Open manual audit for ${pathLabel}. ${snapshot.failCount} failing checks and ${snapshot.pendingCount} pending checks.`}
      className="group block rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_16px_32px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_36px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-slate-950">{pathLabel}</p>
          <p className="mt-1 text-xs text-slate-500">{statusText}</p>
        </div>
        <span className={cn(
          'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
          snapshot.completed
            ? 'bg-emerald-100 text-emerald-700'
            : snapshot.checked > 0
            ? 'bg-cyan-100 text-cyan-800'
            : 'bg-slate-100 text-slate-600',
        )}>
          {snapshot.completed ? 'Complete' : snapshot.checked > 0 ? 'Active' : 'Queued'}
        </span>
      </div>

      <p className="mb-4 break-all text-xs text-slate-500 group-hover:text-slate-700">
        {page.url}
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-slate-50 px-2 py-3">
          <div className="text-sm font-black text-slate-900">{page.violations.length}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Detected</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-2 py-3">
          <div className="text-sm font-black text-red-700">{criticalCount}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Critical</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-2 py-3">
          <div className="text-sm font-black text-cyan-800">{snapshot.checked}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Checked</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{snapshot.failCount} fail{snapshot.failCount === 1 ? '' : 's'}</span>
        <span>{snapshot.pendingCount} pending</span>
        <span className="font-bold text-cyan-900 group-hover:underline">Open Manual Audit</span>
      </div>
    </Link>
  );
}

function PageBoardColumn({
  reportId,
  columnId,
  pages,
}: {
  reportId: string;
  columnId: PageBoardColumnId;
  pages: ReturnType<typeof useReportPages>['pages'];
}) {
  const meta = PAGE_COLUMN_META[columnId];
  const headingId = `pages-board-column-${columnId}`;

  return (
    <section aria-labelledby={headingId} className="flex min-h-[420px] min-w-[280px] flex-1 flex-col rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <h3 id={headingId} className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-600">{meta.title}</h3>
        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black', meta.badge)}>{pages.length}</span>
      </div>
      <ul role="list" className="flex-1 space-y-4 overflow-y-auto pr-1">
        {pages.map((resultPage) => (
          <li key={resultPage.id}>
            <PageBoardCard reportId={reportId} page={resultPage} />
          </li>
        ))}
        {pages.length === 0 && (
          <li>
            <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/80 px-5 py-6 text-sm text-slate-500">
              {meta.empty}
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

function PageListView({
  reportId,
  pages,
}: {
  reportId: string;
  pages: ReturnType<typeof useReportPages>['pages'];
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)] overflow-hidden">
      <ul role="list" className="divide-y divide-slate-200">
        {pages.map((page) => {
          const snapshot = getPageAuditSnapshot(page);
          const pathLabel = getPagePathLabel(page.url);
          const criticalCount = page.violations.filter((violation) => violation.impact === 'critical').length;

          return (
            <li key={page.id}>
              <Link
                to={`/reports/${reportId}/page/${page.id}`}
                state={{ tab: 'manual' }}
                className="flex items-start justify-between gap-4 px-6 py-5 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset"
                aria-label={`Open manual audit for ${pathLabel}. ${snapshot.failCount} failing checks and ${snapshot.pendingCount} pending checks.`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold leading-tight text-slate-950">{pathLabel}</p>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
                      snapshot.completed
                        ? 'bg-emerald-100 text-emerald-700'
                        : snapshot.checked > 0
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-slate-100 text-slate-600',
                    )}>
                      {snapshot.completed ? 'Audited' : snapshot.checked > 0 ? 'In review' : 'Queued'}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-sm text-slate-500">{page.url}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">{page.violations.length} detected</span>
                    <span className="rounded-full bg-red-50 px-2.5 py-1 font-bold text-red-700">{criticalCount} critical</span>
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 font-bold text-cyan-800">{snapshot.checked} checked</span>
                    <span>{snapshot.failCount} fail{snapshot.failCount === 1 ? '' : 's'}</span>
                    <span>{snapshot.pendingCount} pending</span>
                  </div>
                </div>
                <span className="shrink-0 self-center text-sm font-bold text-cyan-900">Open Manual Audit</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PagesList({ reportId }: PagesListProps) {
  const { pages, total, loading, error, page, setPage, totalPages } = useReportPages(reportId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [layout, setLayout] = useState<ViewLayout>('cards');

  const searchValue = searchParams.get('pageSearch') ?? '';
  const boardFilterParam = searchParams.get('pageFilter');
  const boardFilter: PageBoardFilter = PAGE_FILTER_OPTIONS.some((option) => option.value === boardFilterParam)
    ? (boardFilterParam as PageBoardFilter)
    : 'all';

  if (loading) return <div className="text-sm text-on-surface-variant py-4">Loading pages…</div>;
  if (error) return <div className="text-sm text-error py-4">{error}</div>;

  function updateBoardQuery(next: { search?: string; filter?: PageBoardFilter }) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);

      if (next.search !== undefined) {
        const value = next.search.trim();
        if (value) {
          params.set('pageSearch', next.search);
        } else {
          params.delete('pageSearch');
        }
      }

      if (next.filter !== undefined) {
        if (next.filter === 'all') {
          params.delete('pageFilter');
        } else {
          params.set('pageFilter', next.filter);
        }
      }

      return params;
    });
  }

  const normalizedQuery = searchValue.trim().toLowerCase();
  const filteredPages = pages.filter((resultPage) => {
    const snapshot = getPageAuditSnapshot(resultPage);
    const pathLabel = getPagePathLabel(resultPage.url).toLowerCase();
    const matchesQuery = normalizedQuery.length === 0
      || resultPage.url.toLowerCase().includes(normalizedQuery)
      || pathLabel.includes(normalizedQuery)
      || (resultPage.title?.toLowerCase().includes(normalizedQuery) ?? false);

    if (!matchesQuery) return false;

    if (boardFilter === 'needs-attention') return snapshot.failCount > 0 || resultPage.violations.length > 0;
    if (boardFilter === 'unaudited') return !snapshot.completed;
    if (boardFilter === 'audited') return snapshot.completed;

    return true;
  });

  const boardColumns: Record<PageBoardColumnId, typeof filteredPages> = {
    backlog: [],
    'in-review': [],
    audited: [],
  };

  filteredPages.forEach((resultPage) => {
    boardColumns[getPageBoardColumn(resultPage)].push(resultPage);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-on-surface-variant">
        <span>Showing {filteredPages.length} of {total} scanned pages</span>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <div className="max-w-xl space-y-1.5">
        <label htmlFor="report-pages-search" className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">
          Search Pages
        </label>
        <input
          id="report-pages-search"
          type="search"
          value={searchValue}
          onChange={(event) => updateBoardQuery({ search: event.target.value })}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        />
      </div>

      <div className="hidden lg:block space-y-4">
        <div className="flex items-center justify-between gap-4 px-1">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Audit Layout</div>
            <p className="mt-1 text-sm text-slate-500">Switch between the board and a denser list without changing the audit flow.</p>
          </div>
          <ViewLayoutToggle value={layout} onChange={setLayout} ariaLabel="Page audit layout" />
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter page board">
            {PAGE_FILTER_OPTIONS.map((option) => {
              const active = option.value === boardFilter;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateBoardQuery({ filter: option.value })}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
                    active
                      ? 'bg-cyan-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {layout === 'cards' ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[960px] gap-6">
              {(['backlog', 'in-review', 'audited'] as PageBoardColumnId[]).map((columnId) => (
                <PageBoardColumn key={columnId} reportId={reportId} columnId={columnId} pages={boardColumns[columnId]} />
              ))}
            </div>
          </div>
        ) : (
          <PageListView reportId={reportId} pages={filteredPages} />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/10 lg:hidden">
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
            {filteredPages.map((resultPage) => {
              const isAudited = !!resultPage.manualAudit?.completed;
              const criticalCount = resultPage.violations.filter((violation) => violation.impact === 'critical').length;

              return (
                <tr key={resultPage.id} className="hover:bg-surface/50 transition-colors">
                  <td className="px-6 py-5">
                    <p className="font-semibold text-sm text-on-surface">{getPagePathLabel(resultPage.url)}</p>
                    <ExternalLink href={resultPage.url} className="text-xs text-on-surface-variant break-all">
                      {resultPage.url}
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
                    {resultPage.violations.length > 0 ? (
                      <div className="flex gap-4 flex-wrap">
                        {criticalCount > 0 && (
                          <span className="text-xs font-medium text-on-surface-variant flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-error inline-block" />
                            {criticalCount} Critical
                          </span>
                        )}
                        <span className="text-xs font-medium text-on-surface-variant flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          {resultPage.violations.length} Detected
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
                      to={`/reports/${reportId}/page/${resultPage.id}`}
                      state={{ tab: 'manual' }}
                      className="text-sm font-bold text-primary hover:underline underline-offset-4"
                    >
                      Open Manual Audit
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
