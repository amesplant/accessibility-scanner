import { useEffect, useRef, useState } from 'react';
import { Download, Pencil, Check, X } from 'lucide-react';
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress
} from '@/components/ui';
import { ViolationsTable } from '@/components/ViolationsTable';
import { ImpactChart } from '@/components/ImpactChart';
import { LevelChart } from '@/components/LevelChart';
import { PagesList } from '@/components/PagesList';
import { ExportModal } from '@/components/ExportModal';

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

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!report) return <div>Report not found</div>;

  const manualFailCount = report.summary.manualFailCount ?? 0;
  const auditedCount = report.summary.auditedPages ?? 0;
  const auditCoveragePct = report.summary.totalPages > 0
    ? Math.round((auditedCount / report.summary.totalPages) * 100)
    : 0;

  const impactData = Object.entries(report.summary.violationsByImpact || {}).map(
    ([impact, count]) => ({ impact, count })
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          {editingTitle ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { renameReport(titleDraft); setEditingTitle(false); }
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="text-3xl font-bold bg-transparent border-b-2 border-primary focus:outline-none w-full"
                aria-label="Report name"
              />
              <button
                type="button"
                onClick={() => { renameReport(titleDraft); setEditingTitle(false); }}
                aria-label="Save report name"
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <Check className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setEditingTitle(false)}
                aria-label="Cancel editing"
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1 group">
              <h1 className="text-3xl font-bold">
                {report.pageTitle || report.sitemap}
              </h1>
              <button
                type="button"
                onClick={() => { setTitleDraft(report.pageTitle || report.sitemap); setEditingTitle(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
                aria-label="Edit report name"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          {report.pageTitle && report.sitemap.startsWith('http') && (
            <p className="text-base mb-1">
              <ExternalLink href={report.sitemap} className="break-all text-muted-foreground text-base">
                {report.sitemap}
              </ExternalLink>
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {report.auditType && (
              <span className="inline-block text-xs font-medium rounded-full px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700">
                {report.auditType === 'rapid' ? 'Rapid Audit (Quick Assess)' : report.auditType === 'mid-level' ? 'Mid-Level' : 'Full Site'}
              </span>
            )}
            <p className="text-base text-muted-foreground">
              Scanned on {new Date(report.startTime).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => handleTabChange('pages')}
          className="rounded-xl border border-border bg-card text-card-foreground shadow text-left hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors cursor-pointer"
          aria-label={`${report.summary.totalPages} pages scanned — view Pages tab`}
        >
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <p className="text-base font-medium">Pages Scanned</p>
          </div>
          <div className="p-6 pt-0">
            <p className="text-2xl font-bold underline decoration-dotted">
              {report.summary.totalPages}
            </p>
          </div>
        </button>

        <button
          onClick={() => handleTabChange('violations')}
          className="rounded-xl border border-border bg-card text-card-foreground shadow text-left hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors cursor-pointer"
          aria-label={`${report.summary.totalViolations} total violations — view Violations tab`}
        >
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <p className="text-base font-medium">Total Violations</p>
          </div>
          <div className="p-6 pt-0">
            <p className="text-2xl font-bold text-red-400 underline decoration-dotted">
              {report.summary.totalViolations + manualFailCount}
            </p>
            {manualFailCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {report.summary.totalViolations} automated · {manualFailCount} manual
              </p>
            )}
          </div>
        </button>

        <button
          onClick={() => handleTabChange('violations')}
          className="rounded-xl border border-border bg-card text-card-foreground shadow text-left hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors cursor-pointer"
          aria-label={`${(report.summary.totalViolations / report.summary.totalPages).toFixed(1)} violations per page on average — view Violations tab`}
        >
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <p className="text-base font-medium">Avg per Page</p>
          </div>
          <div className="p-6 pt-0">
            <p className="text-2xl font-bold underline decoration-dotted">
              {(report.summary.totalViolations / report.summary.totalPages).toFixed(1)}
            </p>
          </div>
        </button>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              Scan Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {Math.round(
                (new Date(report.endTime).getTime() -
                 new Date(report.startTime).getTime()) / 1000
              )}s
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <div className="flex items-center">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="violations">Violations</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
          </TabsList>
          <button
            type="button"
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
            className="ml-auto mr-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-primary/20 hover:border-primary focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {exportingJson ? 'Saving…' : 'Export JSON'}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-primary/20 hover:border-primary focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
        </div>
        
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Violations by Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <ImpactChart data={impactData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Violations by WCAG Level</CardTitle>
            </CardHeader>
            <CardContent>
              <LevelChart
                data={Object.entries(report.summary.violationsByLevel || {}).map(
                  ([level, count]) => ({ level, count })
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual Audit Coverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-base">
                <span className="text-muted-foreground">
                  {auditedCount} of {report.summary.totalPages} pages audited
                </span>
                <span className="font-semibold">{auditCoveragePct}%</span>
              </div>
              <Progress value={auditCoveragePct} aria-label={`${auditCoveragePct}% of pages manually audited`} />
              {auditedCount < report.summary.totalPages && (
                <p className="text-xs text-muted-foreground">
                  {report.summary.totalPages - auditedCount} pages still need a manual audit. Open each page's detail view to complete it.
                </p>
              )}
              {auditedCount === report.summary.totalPages && report.summary.totalPages > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  All pages have been manually audited.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Violation Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(report.summary.violationsByType)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([type, count]) => {
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <p className="text-base font-medium">{type}</p>
                            <span className="text-xs text-muted-foreground font-mono shrink-0">{count}</span>
                          </div>
                          <Progress
                            value={(count / report.summary.totalViolations) * 100}
                            className="h-2"
                            aria-label={`${type}: ${count} of ${report.summary.totalViolations} violations`}
                          />
                        </div>
                        <span className="text-base w-12 text-right">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="violations">
          <ViolationsTable reportId={report.id} />
        </TabsContent>

        <TabsContent value="pages">
          <PagesList reportId={report.id} />
        </TabsContent>

      </Tabs>

      <ExportModal report={exportOpen ? report : null} onClose={() => setExportOpen(false)} />
    </div>
  );
}