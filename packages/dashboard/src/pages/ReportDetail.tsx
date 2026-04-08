import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from '@/components/ExternalLink';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCurrentReport } from '@/context/CurrentReportContext';
import { useReport } from '@/hooks/useReport';
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
import { PagesList } from '@/components/PagesList';
import { ExportModal } from '@/components/ExportModal';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
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
  const { setCurrentReport } = useCurrentReport();

  useEffect(() => {
    if (report) {
      const label = report.pageTitle || report.sitemap;
      document.title = `${label} — Accessibility Report`;
      setCurrentReport(report.id, label, report.auditType);
    }
    return () => { document.title = 'Seymour'; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  if (loading) return (
    <div role="status" aria-live="polite" className="flex items-center justify-center h-64 text-on-surface-variant">
      <Icon name="hourglass_empty" className="animate-spin mr-2" />
      Loading report…
    </div>
  );
  if (error) return <div role="alert" className="p-8 text-error">{error}</div>;
  if (!report) return <div role="status" className="p-8 text-on-surface-variant">Report not found</div>;

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
            <ExternalLink href={report.sitemap} className="text-sm text-on-surface-variant break-all mt-0.5 block">
              {report.sitemap}
            </ExternalLink>
          )}
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
            <p className="font-bold text-base leading-tight">Manual Audit</p>
            <p className="text-xs opacity-70">Start human review</p>
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
          <TabsList className="bg-surface-container-high rounded-xl p-1">
            <TabsTrigger
              value="overview"
              className="rounded-lg px-5 py-2 text-sm font-semibold data-[state=active]:bg-surface-container-lowest data-[state=active]:text-on-surface data-[state=active]:shadow-sm text-on-surface-variant"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="violations"
              className="rounded-lg px-5 py-2 text-sm font-semibold data-[state=active]:bg-surface-container-lowest data-[state=active]:text-on-surface data-[state=active]:shadow-sm text-on-surface-variant"
            >
              Violations
            </TabsTrigger>
            <TabsTrigger
              value="pages"
              className="rounded-lg px-5 py-2 text-sm font-semibold data-[state=active]:bg-surface-container-lowest data-[state=active]:text-on-surface data-[state=active]:shadow-sm text-on-surface-variant"
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
          <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
            <div className="p-6 border-b border-surface-container flex justify-between items-center">
              <h3 className="text-base font-bold tracking-tight text-on-surface">Scanned Pages Inventory</h3>
            </div>
            <div className="p-6">
              <PagesList reportId={report.id} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ExportModal report={exportOpen ? report : null} onClose={() => setExportOpen(false)} />
    </div>
  );
}
