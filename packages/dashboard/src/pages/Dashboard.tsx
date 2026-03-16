import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReports } from '@/hooks/useReports';
import { useScanContext, formatElapsed } from '@/context/ScanContext';
import { AuditType, ScanReport } from '@accessibility-scanner/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Progress,
} from '@/components/ui';
import { ExternalLink } from '@/components/ExternalLink';
import { TriangleAlert, Trash2, Download } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExportModal } from '@/components/ExportModal';

type InputMode = 'url' | 'file' | 'crawl' | 'urllist';

const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  'rapid':         'Rapid Audit',
  'mid-level':     'Mid-Level',
  'all-inclusive': 'Full Site',
};

const AUDIT_TYPE_DESCRIPTIONS: Record<AuditType, string> = {
  'rapid':         'A focused evaluation of up to 5 pages targeting critical issues — color contrast, heading structure, alt text, and keyboard accessibility.',
  'mid-level':     'A thorough assessment across a representative set of pages covering both major and minor issues using automated, manual, and screen reader testing.',
  'all-inclusive': 'A comprehensive evaluation of every page on your site against the highest accessibility standards using automated scanning.',
};

export function Dashboard() {
  const { reports, loading, error, refresh } = useReports();
  const location = useLocation();
  const navigate = useNavigate();

  const hasReports = !loading && (reports?.length ?? 0) > 0;

  const [showScanForm, setShowScanForm] = useState(false);

  const [auditType, setAuditType] = useState<AuditType>('all-inclusive');
  const [mode, setMode] = useState<InputMode>('url');
  const [sitemap, setSitemap] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [maxPages, setMaxPages] = useState('200');
  const [urlList, setUrlList] = useState<string[]>([]);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [urlInputError, setUrlInputError] = useState<string | null>(null);

  const { scanning, scanState, elapsed, crawlingUrl, scanningUrl, scanError, startScan, abortScan, setScanError } = useScanContext();
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const removeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [exportReport, setExportReport] = useState<ScanReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Fueled Access — Reports';
  }, []);

  // Show form when "New Scan" is triggered from another page
  useEffect(() => {
    if ((location.state as { newScan?: boolean } | null)?.newScan) {
      resetForm();
      setShowScanForm(true);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  function resetForm() {
    setAuditType('all-inclusive');
    setMode('url');
    setSitemap('');
    setFile(null);
    setCrawlUrl('');
    setMaxPages('200');
    setUrlList([]);
    setUrlInputValue('');
    setUrlInputError(null);
    setScanError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleAuditTypeChange(type: AuditType) {
    setAuditType(type);
    setUrlList([]);
    setUrlInputValue('');
    setUrlInputError(null);
    setScanError(null);
    if (type === 'rapid' || type === 'mid-level') {
      setMode('urllist');
    } else {
      setMode('url');
    }
  }

  function handleAddUrl() {
    const trimmed = urlInputValue.trim();
    try {
      new URL(trimmed);
    } catch {
      setUrlInputError('Please enter a valid URL (including https://)');
      return;
    }
    if (urlList.includes(trimmed)) {
      setUrlInputError('This URL has already been added');
      return;
    }
    if (auditType === 'rapid' && urlList.length >= 5) {
      setUrlInputError('Rapid Audit supports a maximum of 5 URLs');
      return;
    }
    setUrlList(prev => [...prev, trimmed]);
    setUrlInputValue('');
    setUrlInputError(null);
  }

  function handleRemoveUrl(index: number) {
    setUrlList(prev => prev.filter((_, i) => i !== index));
    setUrlInputError(null);
  }

  const canSubmit = !scanning && (
    mode === 'urllist' ? urlList.length > 0 :
    mode === 'url'     ? sitemap.trim() !== '' :
    mode === 'file'    ? file !== null :
    crawlUrl.trim() !== ''
  );

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setScanError(null);

    try {
      let body: Record<string, unknown>;
      if (mode === 'urllist') {
        body = { urls: urlList, auditType };
      } else if (mode === 'file' && file) {
        body = { xmlContent: await file.text(), filename: file.name, auditType };
      } else if (mode === 'crawl') {
        body = { crawlUrl, maxPages: Number(maxPages) || 200, auditType };
      } else {
        body = { sitemap, auditType };
      }

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Scan failed');
      }

      const { jobId } = await res.json();
      startScan(jobId, {
        onComplete: () => { resetForm(); setShowScanForm(false); refresh(); },
      });
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    }
  }

  async function handleAbort() {
    await abortScan();
  }

  function switchMode(next: InputMode) {
    setMode(next);
    setScanError(null);
  }

  const progressPercent = scanState.total > 0
    ? Math.round((scanState.scanned / scanState.total) * 100)
    : 0;

  const scanForm = (
    <form onSubmit={handleScan} className="flex flex-col gap-4">
      {/* Audit type selector */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Audit Type</Label>
        <div className="grid grid-cols-3 gap-3">
          {(['rapid', 'mid-level', 'all-inclusive'] as AuditType[]).map(type => (
            <button
              key={type}
              type="button"
              disabled={scanning}
              onClick={() => handleAuditTypeChange(type)}
              className={[
                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                auditType === type
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50',
                scanning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <span className="text-sm font-semibold">{AUDIT_TYPE_LABELS[type]}</span>
              <span className="text-xs text-muted-foreground">{AUDIT_TYPE_DESCRIPTIONS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode toggle — only shown for All-Inclusive */}
      {mode !== 'urllist' && (
        <div className="flex gap-2">
          {(['url', 'file', 'crawl'] as InputMode[]).map(m => (
            <Button
              key={m}
              type="button"
              variant={mode === m ? 'default' : 'outline'}
              onClick={() => switchMode(m)}
              disabled={scanning}
            >
              {m === 'url' ? 'Sitemap URL' : m === 'file' ? 'Upload XML' : 'Crawl Site'}
            </Button>
          ))}
        </div>
      )}

      {/* URL list input — shown for Rapid and Mid-Level */}
      {mode === 'urllist' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url-list-input">
              Add page URLs to audit
              {auditType === 'rapid' && (
                <span className={[
                  'ml-2 text-xs font-normal',
                  urlList.length >= 5 ? 'text-destructive' : 'text-muted-foreground',
                ].join(' ')}>
                  {urlList.length} / 5 URLs
                </span>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                id="url-list-input"
                type="url"
                value={urlInputValue}
                onChange={e => { setUrlInputValue(e.target.value); setUrlInputError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
                disabled={scanning || (auditType === 'rapid' && urlList.length >= 5)}
                className="flex-1"
                aria-describedby={urlInputError ? 'url-input-error' : undefined}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddUrl}
                disabled={scanning || !urlInputValue.trim() || (auditType === 'rapid' && urlList.length >= 5)}
              >
                Add URL
              </Button>
            </div>
            {urlInputError && (
              <p id="url-input-error" role="alert" className="text-sm text-destructive">{urlInputError}</p>
            )}
          </div>

          {urlList.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="URLs to audit">
              {urlList.map((url, i) => (
                <li key={url} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm font-mono truncate flex-1 mr-2">{url}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveUrl(i)}
                    disabled={scanning}
                    aria-label={`Remove ${url}`}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button type="submit" disabled={!canSubmit} className="self-start">
            {scanning ? 'Scanning…' : `Start ${AUDIT_TYPE_LABELS[auditType]}`}
          </Button>
        </div>
      )}

      {mode === 'url' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sitemap">Sitemap URL or local file path</Label>
          <div className="flex gap-2">
            <Input
              id="sitemap"
              type="text"
              value={sitemap}
              onChange={e => setSitemap(e.target.value)}
              disabled={scanning}
              className="flex-1"
            />
            <Button type="submit" disabled={!canSubmit}>
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'file' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sitemap-file">Sitemap XML file</Label>
          <div className="flex gap-2">
            <Input
              id="sitemap-file"
              ref={fileInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              disabled={scanning}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="flex-1"
            />
            <Button type="submit" disabled={!canSubmit}>
              {scanning ? 'Scanning…' : 'Scan'}
            </Button>
          </div>
          {file && <p className="text-sm text-muted-foreground">{file.name}</p>}
        </div>
      )}

      {mode === 'crawl' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
            <p className="font-medium">⚠ Before you crawl</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>Crawling follows internal links from your starting URL downward — keep the path specific to avoid scanning the whole site.</li>
              <li>~200 pages takes 5–10 min at default settings.</li>
              <li>500 pages can take 30+ min and uses significantly more memory.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-1.5 w-32">
            <Label htmlFor="max-pages">Max pages</Label>
            <Input
              id="max-pages"
              type="number"
              min="1"
              max="500"
              value={maxPages}
              onChange={e => setMaxPages(e.target.value)}
              disabled={scanning}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crawl-url">Site URL to crawl</Label>
            <div className="flex gap-2">
              <Input
                id="crawl-url"
                type="url"
                value={crawlUrl}
                onChange={e => setCrawlUrl(e.target.value)}
                disabled={scanning}
                className="flex-1"
              />
              <Button type="submit" disabled={!canSubmit}>
                {scanning ? 'Running…' : 'Crawl & Scan'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Progress UI */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={scanning ? 'flex flex-col gap-2 pt-1' : 'sr-only'}
      >
        {scanning && (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="truncate max-w-[70%]">
                {scanState.phase === 'crawling' && (
                  crawlingUrl
                    ? <>Crawling: <span className="font-mono text-xs">{crawlingUrl}</span></>
                    : 'Discovering pages…'
                )}
                {scanState.phase === 'scanning' && scanState.total > 0 && (
                  `Scanning page ${scanState.scanned} of ${scanState.total}`
                )}
                {scanState.phase === 'scanning' && scanState.total === 0 && 'Scanning…'}
                {!scanState.phase && 'Starting…'}
              </span>
              <span className="font-mono" aria-label={`Elapsed time: ${formatElapsed(elapsed)}`}>
                {formatElapsed(elapsed)}
              </span>
            </div>

            {scanState.phase === 'scanning' && scanState.total > 0 ? (
              <Progress
                value={progressPercent}
                className="h-2"
                aria-label={`Scan progress: ${progressPercent}%`}
              />
            ) : (
              <div
                className="h-2 rounded-full bg-secondary overflow-hidden"
                role="progressbar"
                aria-label="Scan in progress"
                aria-valuetext="Indeterminate"
              >
                <div className="h-full w-1/3 rounded-full bg-primary animate-[progress-indeterminate_1.5s_ease-in-out_infinite]" />
              </div>
            )}

            {scanState.phase === 'scanning' && scanningUrl && (
              <p className="text-xs text-muted-foreground font-mono truncate" title={scanningUrl}>
                {scanningUrl}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={handleAbort}
            >
              Abort
            </Button>
          </>
        )}
      </div>

      {scanError && (
        <p id="scan-error" role="alert" className="text-sm text-destructive">
          {scanError}
        </p>
      )}
    </form>
  );

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Accessibility Reports</h1>

      {(!hasReports || showScanForm) && !loading && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New Scan</CardTitle>
          </CardHeader>
          <CardContent>{scanForm}</CardContent>
        </Card>
      )}

      {loading && <div>Loading…</div>}
      {error && <div>Error: {error}</div>}

      <div className="grid gap-6">
        {reports?.map(report => (
          <Card key={report.id}>
            <CardHeader className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <CardTitle>
                  {report.pageTitle || report.sitemap}
                </CardTitle>
                {report.pageTitle && report.sitemap.startsWith('http') && (
                  <ExternalLink href={report.sitemap} className="text-sm text-muted-foreground break-all font-normal">
                    {report.sitemap}
                  </ExternalLink>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {report.auditType && (
                    <span className="inline-block text-xs font-medium rounded-full px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700">
                      {AUDIT_TYPE_LABELS[report.auditType]}
                    </span>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Scanned on {new Date(report.startTime).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-row items-center gap-2 lg:shrink-0">
                <Link
                  to={`/reports/${report.id}`}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                >
                  View Report
                </Link>
                <button
                  type="button"
                  onClick={() => setExportReport(report)}
                  aria-label={`Export report for ${report.sitemap}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/20 hover:border-primary"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={e => {
                    removeButtonRef.current = e.currentTarget as HTMLButtonElement;
                    setPendingRemoveId(report.id);
                  }}
                  aria-label={`Remove scan for ${report.sitemap}`}
                  className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <Link to={`/reports/${report.id}?tab=pages`} className="group">
                  <p className="text-sm text-muted-foreground">Total Pages</p>
                  <p className="text-2xl font-bold underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.totalPages}
                  </p>
                </Link>
                <Link to={`/reports/${report.id}?tab=violations`} className="group">
                  <p className="text-sm text-muted-foreground">Total Violations</p>
                  <p className="text-2xl font-bold text-red-400 underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.totalViolations}
                  </p>
                </Link>
                <Link to={`/reports/${report.id}?tab=violations&impact=critical`} className="group">
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-2xl font-bold text-red-400 underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.violationsByImpact.critical || 0}
                  </p>
                </Link>
                <Link to={`/reports/${report.id}?tab=violations&impact=serious`} className="group">
                  <p className="text-sm text-muted-foreground">Serious</p>
                  <p className="text-2xl font-bold text-orange-400 underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.violationsByImpact.serious || 0}
                  </p>
                </Link>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Link
                  to={`/reports/${report.id}?tab=violations`}
                  className="underline hover:text-link"
                >
                  {Object.keys(report.summary.violationsByType).length} violation types
                </Link>
                <span>
                  {Math.round(
                    (new Date(report.endTime).getTime() -
                     new Date(report.startTime).getTime()) / 1000
                  )}s scan duration
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/*
        Radix Dialog provides out-of-the-box:
          • role="dialog" + aria-modal="true"
          • aria-labelledby → DialogTitle
          • aria-describedby → DialogDescription
          • Keyboard trap (Tab / Shift+Tab cycle inside)
          • Escape key closes and returns focus to trigger
          • Focus return to the element that opened the dialog
        We add on top:
          • autoFocus on Cancel so the safe action is default
          • DialogClose wrapping Cancel for Radix-managed close + focus return
          • aria-live="assertive" status region for screen reader announcement
      */}
      <Dialog
        open={!!pendingRemoveId}
        onOpenChange={open => {
          if (!open) {
            setPendingRemoveId(null);
            // Explicitly return focus to the button that opened the dialog
            setTimeout(() => removeButtonRef.current?.focus(), 0);
          }
        }}
      >
        <DialogContent className="border-2 border-white" aria-live="assertive">
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">Remove report?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This will permanently delete this scan report.
            </DialogDescription>
            <p className="flex items-center gap-1.5 text-sm text-destructive font-medium" aria-live="polite">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              This action cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="text-foreground border-border"
                aria-label="Cancel — keep this report"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => pendingRemoveId && handleRemove(pendingRemoveId)}
              aria-label="Permanently remove this scan report"
            >
              Remove report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportModal report={exportReport} onClose={() => setExportReport(null)} />
    </div>
  );

  async function handleRemove(id: string) {
    await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    setPendingRemoveId(null);
    refresh();
  }

}
