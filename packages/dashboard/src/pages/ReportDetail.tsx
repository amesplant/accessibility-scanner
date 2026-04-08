import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from '@/components/ExternalLink';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ScanReport } from '@accessibility-scanner/shared';
import { useCurrentReport } from '@/context/CurrentReportContext';
import { useReport } from '@/hooks/useReport';
import { useReportPages } from '@/hooks/useReportPages';
import { downloadReportJson } from '@/lib/reportTransfer';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ViolationsTable } from '@/components/ViolationsTable';
import { ImpactChart } from '@/components/ImpactChart';
import { LevelChart } from '@/components/LevelChart';
import { PagesList } from '../components/PagesList';
import { ExportModal } from '@/components/ExportModal';
import { useLayoutBreadcrumbs } from '@/context/LayoutBreadcrumbContext';
import { ReportIntegrityNotice, isCorruptedReport } from '@/components/ReportIntegrityNotice';
import { apiFetch, readApiError } from '@/lib/api';
import { useProjects } from '@/hooks/useProjects';

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

export function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const activeTab = searchParams.get('tab') || 'overview';

  function handleTabChange(tab: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      if (tab !== 'violations') next.delete('impact');
      return next;
    });
  }

  const { report, loading, error, renameReport } = useReport(id);
  const { pages: shortcutPages } = useReportPages(id, 250);
  const { setCurrentReport } = useCurrentReport();
  const { projects } = useProjects();

  useEffect(() => {
    if (report) {
      const label = report.pageTitle || report.sitemap;
      document.title = `${label} — Accessibility Report`;
      setCurrentReport(report.id, label, report.auditType);
    }
    return () => { document.title = 'Seymour'; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const reportProject = report?.projectId
    ? projects.find((project) => project.id === report.projectId) ?? null
    : null;

  const breadcrumbs = useMemo(() => ([
    { label: 'Dashboard', to: '/' },
    ...(reportProject
      ? [{ label: 'Projects', to: '/projects' }, { label: reportProject.name, to: `/projects/${reportProject.id}` }]
      : [{ label: 'Reports' }]),
    { label: report?.pageTitle || report?.sitemap || 'Report' },
  ]), [report?.pageTitle, report?.sitemap, reportProject]);

  useLayoutBreadcrumbs(breadcrumbs);

  if (loading) return (
    <div role="status" aria-live="polite" className="flex items-center justify-center h-64 text-on-surface-variant">
      <Icon name="hourglass_empty" className="animate-spin mr-2" />
      Loading report…
    </div>
  );
  if (error) return <div role="alert" className="p-8 text-error">{error}</div>;
  if (!report) return <div role="status" className="p-8 text-on-surface-variant">Report not found</div>;

  async function handleCleanupCorruptedReport() {
    if (!report) return;

    try {
      setCleanupError(null);
      setCleaningUp(true);
      const res = await apiFetch(`/api/reports/${report.id}`, { method: 'DELETE' });
      if (!res.ok) throw await readApiError(res, 'Failed to cleanup report');
      navigate('/');
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : 'Failed to cleanup report');
    } finally {
      setCleaningUp(false);
    }
  }

  if (isCorruptedReport(report)) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-error/20 bg-surface-container-lowest p-8 shadow-[0px_18px_48px_rgba(24,28,32,0.08)]">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-error-container/60 text-error">
              <Icon name="warning" className="text-3xl" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-error">Storage integrity issue</p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface">
                {report.pageTitle || report.sitemap}
              </h1>
              <p className="mt-3 text-sm text-on-surface-variant">
                Seymour can still read the summary metadata for this scan, but the stored report payload is corrupted, incomplete, or missing.
              </p>
            </div>
          </div>

          <ReportIntegrityNotice report={report} className="mt-6" />

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Pages</p>
              <p className="mt-1 text-lg font-bold text-on-surface">{report.summary.totalPages}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Violations</p>
              <p className="mt-1 text-lg font-bold text-error">{report.summary.totalViolations}</p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Scanned</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{new Date(report.startTime).toLocaleString()}</p>
            </div>
          </div>

          {cleanupError && (
            <p role="alert" className="mt-4 text-sm text-error">{cleanupError}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCleanupCorruptedReport}
              disabled={cleaningUp}
              className="inline-flex items-center gap-2 rounded-xl bg-error px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Icon name="cleaning_services" className="text-[18px]" />
              {cleaningUp ? 'Cleaning up…' : 'Cleanup broken report'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const manualFailCount = report.summary.manualFailCount ?? 0;
  const auditedCount = report.summary.auditedPages ?? 0;
  const auditCoveragePct = report.summary.totalPages > 0
    ? Math.round((auditedCount / report.summary.totalPages) * 100)
    : 0;
  const scanDurationSec = Math.round(
    (new Date(report.endTime).getTime() - new Date(report.startTime).getTime()) / 1000
  );
  const levelACount = report.summary.violationsByLevel?.['A'] ?? 0;
  const levelAACount = report.summary.violationsByLevel?.['AA'] ?? 0;

  function getPagePathLabel(url: string) {
    try {
      return new URL(url).pathname || url;
    } catch {
      return url;
    }
  }

  function getManualAuditState(pageResult: ScanReport['results'][number]) {
    const checks = pageResult.manualAudit?.checks ?? [];
    const failCount = checks.filter((check) => check.status === 'fail').length;
    const checkedCount = checks.filter((check) => check.status !== 'not-tested').length;
    const completed = pageResult.manualAudit?.completed === true;

    return {
      failCount,
      checkedCount,
      completed,
    };
  }

  const nextManualAuditTarget =
    shortcutPages.find((pageResult) => getManualAuditState(pageResult).failCount > 0) ??
    shortcutPages.find((pageResult) => {
      const state = getManualAuditState(pageResult);
      return !state.completed && state.checkedCount > 0;
    }) ??
    shortcutPages.find((pageResult) => !getManualAuditState(pageResult).completed) ??
    null;

  const nextManualAuditState = nextManualAuditTarget ? getManualAuditState(nextManualAuditTarget) : null;
  const nextManualAuditLabel = nextManualAuditTarget
    ? nextManualAuditState?.failCount
      ? 'Resume failing audit'
      : nextManualAuditState && nextManualAuditState.checkedCount > 0
      ? 'Continue manual audit'
      : 'Start next audit'
    : 'Open audit board';

  const auditTypeLabel =
    report.auditType === 'rapid' ? 'Rapid Audit'
    : report.auditType === 'mid-level' ? 'Mid-Level'
    : report.auditType === 'all-inclusive' ? 'All-Inclusive'
    : report.auditType ?? '';

  return (
    <div className="p-8 space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">
            {auditTypeLabel && `${auditTypeLabel} · `}
            {new Date(report.startTime).toLocaleString()}
          </p>

          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renameReport(titleDraft); setEditingTitle(false); }
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="text-2xl font-extrabold bg-transparent border-b-2 border-primary flex-1 text-on-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="Report name"
              />
              <button
                type="button"
                onClick={() => { renameReport(titleDraft); setEditingTitle(false); }}
                aria-label="Save report name"
                className="p-2 rounded-xl text-secondary hover:bg-secondary-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="check" />
              </button>
              <button
                type="button"
                onClick={() => setEditingTitle(false)}
                aria-label="Cancel editing"
                className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="close" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">
                {report.pageTitle || report.sitemap}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(report.pageTitle || report.sitemap);
                  setEditingTitle(true);
                  setTimeout(() => titleInputRef.current?.select(), 0);
                }}
                aria-label="Edit report name"
                className="p-1.5 rounded-lg opacity-0 text-on-surface-variant hover:bg-surface-container transition-all group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="edit" className="text-[18px]" />
              </button>
            </div>
          )}

          {report.pageTitle && report.sitemap.startsWith('http') && (
            <ExternalLink href={report.sitemap} className="mt-0.5 max-w-full text-sm text-on-surface-variant break-all">
              {report.sitemap}
            </ExternalLink>
          )}

          <ReportIntegrityNotice report={report} className="max-w-2xl" />
        </div>
      </div>

      {/* Hero bento section */}
      <section className="grid grid-cols-12 gap-6" aria-label="Report summary">
        {/* Coverage card */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-2xl p-8 shadow-[0px_12px_32px_rgba(24,28,32,0.06)] flex flex-col justify-between min-h-[180px]">
          <div>
            <span className="text-[10px] font-bold tracking-[0.1em] text-secondary uppercase mb-2 block">
              Executive Summary
            </span>
            <h2 className="text-xl font-extrabold tracking-tight text-on-surface mb-4">
              Manual Audit Coverage
            </h2>
            <div className="mb-5">
              {nextManualAuditTarget ? (
                <button
                  type="button"
                  onClick={() => navigate(`/reports/${report.id}/page/${nextManualAuditTarget.id}`, { state: { tab: 'manual' } })}
                  className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-950 shadow-[0px_10px_24px_rgba(245,158,11,0.14)] transition-colors hover:bg-amber-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">
                        <Icon name="local_fire_department" className="text-[14px] text-amber-700" />
                        Next Best Page
                      </div>
                      <div className="mt-2 text-sm font-bold text-amber-950">{nextManualAuditLabel}</div>
                      <div className="mt-1 truncate text-xs font-medium text-amber-900/80">{getPagePathLabel(nextManualAuditTarget.url)}</div>
                    </div>
                    <Icon name="arrow_forward" className="text-xl text-amber-700 shrink-0" />
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleTabChange('pages')}
                  className="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon name="edit_document" className="text-[18px] text-secondary" />
                  Open audit board
                </button>
              )}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-end mb-3">
              <span className="text-5xl font-black text-primary">{auditCoveragePct}%</span>
              <span className="text-sm font-medium text-on-surface-variant mb-1">
                {auditedCount} of {report.summary.totalPages} pages audited
              </span>
            </div>
            <div className="h-3 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${auditCoveragePct}%`,
                  background: 'linear-gradient(to right, #5b54e8, #7438da)',
                }}
                role="presentation"
              />
            </div>
            {auditedCount < report.summary.totalPages && auditedCount > 0 && (
              <p className="text-xs text-on-surface-variant mt-2">
                {report.summary.totalPages - auditedCount} pages still need a manual audit.
              </p>
            )}
            {auditedCount === report.summary.totalPages && report.summary.totalPages > 0 && (
              <p className="text-xs text-secondary font-medium mt-2 flex items-center gap-1">
                <Icon name="check_circle" filled className="text-[14px]" />
                All pages have been manually audited.
              </p>
            )}
          </div>
        </div>

        {/* Stats column */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <button
            onClick={() => handleTabChange('pages')}
            className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-left hover:bg-surface-container transition-colors cursor-pointer focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`${report.summary.totalPages} pages scanned — view Pages tab`}
          >
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">
              Inventory Overview
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold text-on-surface">{report.summary.totalPages}</p>
                <p className="text-sm text-on-surface-variant">Pages Scanned</p>
              </div>
              <Icon name="find_in_page" className="text-5xl opacity-30 text-primary" />
            </div>
          </button>

          <button
            onClick={() => handleTabChange('violations')}
            className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 text-left hover:bg-surface-container transition-colors cursor-pointer focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`${report.summary.totalViolations + manualFailCount} total violations — view Violations tab`}
          >
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">
              Automated Detections
            </p>
            <div className="flex gap-8">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-error inline-block" />
                  <p className="text-2xl font-bold text-on-surface">{levelACount}</p>
                </div>
                <p className="text-xs text-on-surface-variant font-medium">Level A</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  <p className="text-2xl font-bold text-on-surface">{levelAACount}</p>
                </div>
                <p className="text-xs text-on-surface-variant font-medium">Level AA</p>
              </div>
              {manualFailCount > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                    <p className="text-2xl font-bold text-on-surface">{manualFailCount}</p>
                  </div>
                  <p className="text-xs text-on-surface-variant font-medium">Manual</p>
                </div>
              )}
            </div>
          </button>
        </div>
      </section>

      {/* Action cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Report actions">
        <button
          onClick={() => handleTabChange('pages')}
          className="group p-5 bg-gradient-to-r from-primary to-primary-container text-white rounded-2xl flex items-center justify-between shadow-[0px_12px_32px_rgba(91,84,232,0.18)] hover:scale-[1.02] transition-transform duration-200 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="text-left">
            <Icon name="edit_document" filled className="text-2xl mb-2 block" />
            <p className="font-bold text-base leading-tight">Manual Audit Board</p>
            <p className="text-xs opacity-70">Pick the next page to review</p>
          </div>
          <Icon name="chevron_right" className="group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={() => setExportOpen(true)}
          className="group p-5 bg-surface-container-lowest text-on-surface rounded-2xl flex items-center justify-between border border-outline-variant/20 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="text-left">
            <Icon name="groups" className="text-2xl mb-2 block text-secondary" />
            <p className="font-bold text-base leading-tight">Teamwork Export</p>
            <p className="text-xs text-on-surface-variant">CSV Format</p>
          </div>
          <Icon name="download" className="text-outline-variant" />
        </button>

        <button
          onClick={() => setExportOpen(true)}
          className="group p-5 bg-surface-container-lowest text-on-surface rounded-2xl flex items-center justify-between border border-outline-variant/20 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="text-left">
            <Icon name="bug_report" className="text-2xl mb-2 block text-secondary" />
            <p className="font-bold text-base leading-tight">Jira Export</p>
            <p className="text-xs text-on-surface-variant">Ticket Sync</p>
          </div>
          <Icon name="sync" className="text-outline-variant" />
        </button>

        <button
          onClick={async () => {
            if (exportingJson) return;
            try {
              setExportingJson(true);
              await downloadReportJson(report.id);
            } catch (err) {
              console.error('JSON export failed:', err);
            } finally {
              setExportingJson(false);
            }
          }}
          className="group p-5 bg-surface-container-lowest text-on-surface rounded-2xl flex items-center justify-between border border-outline-variant/20 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="text-left">
            <Icon name="data_object" className="text-2xl mb-2 block text-secondary" />
            <p className="font-bold text-base leading-tight">
              {exportingJson ? 'Saving…' : 'JSON Export'}
            </p>
            <p className="text-xs text-on-surface-variant">Raw Data</p>
          </div>
          <Icon name="code" className="text-outline-variant" />
        </button>
      </section>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="flex items-center gap-4">
          <TabsList className="inline-flex h-auto w-auto items-center gap-1 rounded-[20px] border border-surface-container-high bg-surface-container-lowest p-1 shadow-[0px_12px_32px_rgba(24,28,32,0.04)]">
            <TabsTrigger
              value="overview"
              className="rounded-[16px] px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors data-[state=active]:bg-cyan-900 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="violations"
              className="rounded-[16px] px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors data-[state=active]:bg-cyan-900 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Violations
            </TabsTrigger>
            <TabsTrigger
              value="pages"
              className="rounded-[16px] px-5 py-3 text-sm font-bold text-on-surface-variant transition-colors data-[state=active]:bg-cyan-900 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Pages
            </TabsTrigger>
          </TabsList>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-medium">
              Scanned in {scanDurationSec}s
            </span>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-4">
                Violations by Impact
              </h3>
              <ImpactChart data={Object.entries(report.summary.violationsByImpact || {}).map(([impact, count]) => ({ impact, count }))} />
            </div>
            <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-4">
                Violations by WCAG Level
              </h3>
              <LevelChart
                data={Object.entries(report.summary.violationsByLevel || {}).map(([level, count]) => ({ level, count }))}
              />
            </div>
          </div>

          {/* Top Violation Types */}
          <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
            <div className="p-6 border-b border-surface-container">
              <h3 className="text-base font-bold tracking-tight text-on-surface">Top Violation Types</h3>
            </div>
            <div className="p-6 space-y-3">
              {Object.entries(report.summary.violationsByType)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-on-surface truncate">{type}</p>
                        <span className="text-xs text-on-surface-variant shrink-0 font-mono">{count}</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-secondary to-secondary-fixed-dim"
                          style={{ width: `${report.summary.totalViolations > 0 ? (count / report.summary.totalViolations) * 100 : 0}%` }}
                          role="presentation"
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="violations">
          <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
            <div className="p-6 border-b border-surface-container">
              <h3 className="text-base font-bold tracking-tight text-on-surface">All Violations</h3>
            </div>
            <div className="p-6">
              <ViolationsTable reportId={report.id} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pages">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-outline-variant/15 bg-surface-container-lowest p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Manual Audit Flow</p>
                  <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface">Page Audit Board</h3>
                </div>

                <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                  <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                    <div className="text-2xl font-black text-on-surface">{report.summary.totalPages}</div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Pages</div>
                  </div>
                  <div className="rounded-2xl bg-secondary-container/60 px-4 py-3">
                    <div className="text-2xl font-black text-secondary">{auditedCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Audited</div>
                  </div>
                  <div className="rounded-2xl bg-primary/10 px-4 py-3">
                    <div className="text-2xl font-black text-primary">{report.summary.totalPages - auditedCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Remaining</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
              <div className="p-6">
                <PagesList reportId={report.id} />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ExportModal report={exportOpen ? report : null} onClose={() => setExportOpen(false)} />
    </div>
  );
}
