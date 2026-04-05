import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReports, type ReportListItem } from '@/hooks/useReports';
import { useProjects } from '@/hooks/useProjects';
import { useScanContext, formatElapsed } from '@/context/ScanContext';
import { apiFetch } from '@/lib/api';
import { AuditType } from '@accessibility-scanner/shared';
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
import { TriangleAlert, Trash2, Download, FolderOpen, Pencil, Check, X } from 'lucide-react';
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
import { EditProjectDialog } from '@/components/EditProjectDialog';
import type { ProjectWithCount } from '@/hooks/useProjects';

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
  const { reports, loading, error, refresh, renameReport } = useReports();
  const { projects, createProject, deleteProject, updateProject, refresh: refreshProjects } = useProjects();
  const location = useLocation();
  const navigate = useNavigate();


  const [showScanForm, setShowScanForm] = useState(false);

  const [auditType, setAuditType] = useState<AuditType>('all-inclusive');
  const [wcagLevel, setWcagLevel] = useState<'A' | 'AA' | 'AAA'>('AA');
  const [includeBestPractices, setIncludeBestPractices] = useState(false);
  const [parallelTabs, setParallelTabs] = useState<'1' | '3' | '5' | '8'>('1');
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
  const [exportReport, setExportReport] = useState<ReportListItem | null>(null);
  const [scanProjectId, setScanProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [assignReport, setAssignReport] = useState<ReportListItem | null>(null);
  const [assignProjectId, setAssignProjectId] = useState<string>('');
  const [assignNewProjectName, setAssignNewProjectName] = useState('');
  const [assignShowNewProjectInput, setAssignShowNewProjectInput] = useState(false);
  const [renamingReportId, setRenamingReportId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectWithCount | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Seymour — Reports';
  }, []);

  // Show form when "New Scan" is triggered from another page
  useEffect(() => {
    const state = location.state as { newScan?: boolean; projectId?: string } | null;
    if (state?.newScan) {
      if (!scanning) {
        resetForm();
        if (state.projectId) setScanProjectId(state.projectId);
        setShowScanForm(true);
      }
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate, scanning]);

  function resetForm() {
    setAuditType('all-inclusive');
    setWcagLevel('AA');
    setIncludeBestPractices(false);
    setParallelTabs('1');
    setMode('url');
    setSitemap('');
    setFile(null);
    setCrawlUrl('');
    setMaxPages('200');
    setUrlList([]);
    setUrlInputValue('');
    setUrlInputError(null);
    setScanError(null);
    setScanProjectId('');
    setNewProjectName('');
    setShowNewProjectInput(false);
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
      // Handle "new project" inline creation
      let resolvedProjectId = scanProjectId;
      if (showNewProjectInput && newProjectName.trim()) {
        const created = await createProject(newProjectName.trim());
        resolvedProjectId = created.id;
      }

      const concurrent = Number(parallelTabs);
      const scanOptions = { auditType, wcagLevel, includeBestPractices, concurrent };
      let body: Record<string, unknown>;
      if (mode === 'urllist') {
        body = { urls: urlList, ...scanOptions };
      } else if (mode === 'file' && file) {
        body = { xmlContent: await file.text(), filename: file.name, ...scanOptions };
      } else if (mode === 'crawl') {
        body = { crawlUrl, maxPages: Number(maxPages) || 200, ...scanOptions };
      } else {
        body = { sitemap, ...scanOptions };
      }
      if (resolvedProjectId) body.projectId = resolvedProjectId;

      const res = await apiFetch('/api/scan', {
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
        onComplete: () => {
          resetForm();
          setShowScanForm(false);
          refresh({ background: true });
          refreshProjects({ background: true });
        },
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
        <Label className="text-base font-medium mb-2 block">Audit Type</Label>
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
              <span className="text-base font-semibold">{AUDIT_TYPE_LABELS[type]}</span>
              <span className="text-xs text-muted-foreground">{AUDIT_TYPE_DESCRIPTIONS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* WCAG level + best practices */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-base font-medium">WCAG Level</Label>
          <div className="flex gap-1">
            {(['A', 'AA', 'AAA'] as const).map(level => (
              <button
                key={level}
                type="button"
                disabled={scanning}
                onClick={() => setWcagLevel(level)}
                aria-pressed={wcagLevel === level}
                className={[
                  'rounded border px-3 py-1 text-base font-medium transition-colors',
                  wcagLevel === level
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50',
                  scanning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none pb-0.5">
          <input
            type="checkbox"
            checked={includeBestPractices}
            onChange={e => setIncludeBestPractices(e.target.checked)}
            disabled={scanning}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span className="text-base font-medium">Include best practices</span>
        </label>
      </div>

      <div className="flex flex-col gap-1.5 max-w-xs">
        <Label htmlFor="scan-parallel">Parallel browser tabs</Label>
        <select
          id="scan-parallel"
          value={parallelTabs}
          onChange={e => setParallelTabs(e.target.value as '1' | '3' | '5' | '8')}
          disabled={scanning}
          aria-describedby="scan-parallel-hint"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="1">1</option>
          <option value="3">3</option>
          <option value="5">5</option>
          <option value="8">8</option>
        </select>
        <p id="scan-parallel-hint" className="text-xs text-muted-foreground">
          Crawl and audit use this many Chromium tabs at once. Lower numbers use less memory.
        </p>
      </div>

      {/* Project assignment */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scan-project">Project <span className="text-muted-foreground font-normal">(optional)</span></Label>
        {showNewProjectInput ? (
          <div className="flex gap-2">
            <Input
              id="scan-project"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              disabled={scanning}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowNewProjectInput(false); setNewProjectName(''); }} disabled={scanning}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              id="scan-project"
              value={scanProjectId}
              onChange={e => setScanProjectId(e.target.value)}
              disabled={scanning}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowNewProjectInput(true)} disabled={scanning}>
              + New
            </Button>
          </div>
        )}
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
              <p id="url-input-error" role="alert" className="text-base text-destructive">{urlInputError}</p>
            )}
          </div>

          {urlList.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="URLs to audit">
              {urlList.map((url, i) => (
                <li key={url} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="text-base font-mono truncate flex-1 mr-2">{url}</span>
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
          {file && <p className="text-base text-muted-foreground">{file.name}</p>}
        </div>
      )}

      {mode === 'crawl' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-base space-y-1">
            <p className="font-medium">⚠ Before you crawl</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>Crawling follows internal links from your starting URL downward — keep the path specific to avoid scanning the whole site.</li>
              <li>Speed depends on the site and parallel tabs; increase parallel tabs for large crawls if your machine has headroom.</li>
              <li>Heavy sites (many images, long pages) use more memory — lower parallel tabs if the process struggles.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-1.5 w-32">
            <Label htmlFor="max-pages">Max pages</Label>
            <Input
              id="max-pages"
              type="number"
              min="1"
              max="5000"
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
        id="scan-progress"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={scanning ? 'flex flex-col gap-2 pt-1' : 'sr-only'}
      >
        {scanning && (
          <>
            <div className="flex items-center justify-between text-base text-muted-foreground">
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
        <p id="scan-error" role="alert" className="text-base text-destructive">
          {scanError}
        </p>
      )}
    </form>
  );

  const unassignedReports = reports?.filter(r => !r.projectId) ?? [];
  const hasUnassigned = unassignedReports.length > 0;
  const hasAnything =
    (!loading || reports.length > 0 || projects.length > 0) &&
    ((reports?.length ?? 0) > 0 || projects.length > 0);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Accessibility Reports</h1>

      {(!hasAnything || showScanForm || scanning) && !(loading && reports.length === 0) && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New Scan</CardTitle>
          </CardHeader>
          <CardContent>{scanForm}</CardContent>
        </Card>
      )}

      {loading && reports.length === 0 && <div>Loading…</div>}
      {error && <div>Error: {error}</div>}

      {/* Projects section */}
      {projects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Projects</h2>
            <Link to="/projects" className="text-base text-link hover:underline">View all</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(project => (
              <div
                key={project.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary hover:bg-primary/5"
              >
                <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
                <Link to={`/projects/${project.id}`} className="min-w-0 flex-1">
                  <p className="text-base font-medium truncate">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.reportCount} {project.reportCount === 1 ? 'report' : 'reports'}
                  </p>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingProject(project)}
                    aria-label={`Edit project ${project.name}`}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteProjectId(project.id)}
                    aria-label={`Delete project ${project.name}`}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unassigned reports */}
      {hasUnassigned && (
        <h2 className="text-lg font-semibold mb-3">Reports</h2>
      )}

      <div className="grid gap-6">
        {unassignedReports.map(report => (
          <Card key={report.id}>
            <CardHeader className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <CardTitle>
                  {renamingReportId === report.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameDraft}
                        onChange={e => setRenameDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { renameReport(report.id, renameDraft); setRenamingReportId(null); }
                          if (e.key === 'Escape') setRenamingReportId(null);
                        }}
                        className="text-xl font-semibold bg-transparent border-b-2 border-primary focus:outline-none flex-1 min-w-0"
                        aria-label="Report name"
                      />
                      <button type="button" onClick={() => { renameReport(report.id, renameDraft); setRenamingReportId(null); }} aria-label="Save" className="text-muted-foreground hover:text-foreground shrink-0"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setRenamingReportId(null)} aria-label="Cancel" className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group/title">
                      <span>{report.pageTitle || report.sitemap}</span>
                      <button
                        type="button"
                        onClick={() => { setRenameDraft(report.pageTitle || report.sitemap); setRenamingReportId(report.id); setTimeout(() => renameInputRef.current?.select(), 0); }}
                        aria-label={`Rename ${report.pageTitle || report.sitemap}`}
                        className="opacity-0 group-hover/title:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </CardTitle>
                {report.pageTitle && report.sitemap.startsWith('http') && (
                  <ExternalLink href={report.sitemap} className="text-base text-muted-foreground break-all font-normal">
                    {report.sitemap}
                  </ExternalLink>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {report.auditType && (
                    <span className="inline-block text-xs font-medium rounded-full px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700">
                      {AUDIT_TYPE_LABELS[report.auditType]}
                    </span>
                  )}
                  {report.projectId && (() => {
                    const proj = projects.find(p => p.id === report.projectId);
                    return proj ? (
                      <Link
                        to={`/projects/${proj.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 hover:underline"
                      >
                        <FolderOpen className="h-3 w-3" aria-hidden="true" />
                        {proj.name}
                      </Link>
                    ) : null;
                  })()}
                  <p className="text-base text-muted-foreground">
                    Scanned on {new Date(report.startTime).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-row items-center gap-2 lg:shrink-0">
                <Link
                  to={`/reports/${report.id}`}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                >
                  View Report
                </Link>
                <button
                  type="button"
                  onClick={() => { setAssignReport(report); setAssignProjectId(report.projectId ?? ''); }}
                  aria-label={`Assign ${report.pageTitle || report.sitemap} to a project`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-primary/20 hover:border-primary"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  Project
                </button>
                <button
                  type="button"
                  onClick={() => setExportReport(report)}
                  aria-label={`Export report for ${report.sitemap}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-primary/20 hover:border-primary"
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
                  <p className="text-base text-muted-foreground">Total Pages</p>
                  <p className="text-2xl font-bold underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.totalPages}
                  </p>
                </Link>
                <Link to={`/reports/${report.id}?tab=violations`} className="group">
                  <p className="text-base text-muted-foreground">Total Violations</p>
                  <p className="text-2xl font-bold text-red-400 underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.totalViolations}
                  </p>
                </Link>
                <Link to={`/reports/${report.id}?tab=violations&impact=critical`} className="group">
                  <p className="text-base text-muted-foreground">Critical</p>
                  <p className="text-2xl font-bold text-red-400 underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.violationsByImpact.critical || 0}
                  </p>
                </Link>
                <Link to={`/reports/${report.id}?tab=violations&impact=serious`} className="group">
                  <p className="text-base text-muted-foreground">Serious</p>
                  <p className="text-2xl font-bold text-orange-400 underline decoration-dotted group-hover:decoration-solid">
                    {report.summary.violationsByImpact.serious || 0}
                  </p>
                </Link>
              </div>
              <div className="flex items-center gap-4 text-base text-muted-foreground">
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
            <DialogDescription className="text-base text-muted-foreground">
              This will permanently delete this scan report.
            </DialogDescription>
            <p className="flex items-center gap-1.5 text-base text-destructive font-medium" aria-live="polite">
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

      <EditProjectDialog
        open={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSave={updateProject}
      />

      {/* Delete project confirmation */}
      {(() => {
        const proj = projects.find(p => p.id === pendingDeleteProjectId);
        return (
          <Dialog open={!!pendingDeleteProjectId} onOpenChange={open => { if (!open) setPendingDeleteProjectId(null); }}>
            <DialogContent className="text-foreground">
              <DialogHeader>
                <DialogTitle>Delete Project</DialogTitle>
                <DialogDescription>
                  Delete <strong>{proj?.name}</strong>? Scans in this project will not be deleted — they will just be unassigned.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 mt-4">
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    if (!pendingDeleteProjectId) return;
                    await deleteProject(pendingDeleteProjectId);
                    setPendingDeleteProjectId(null);
                  }}
                >
                  Delete Project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Assign to project dialog */}
      <Dialog open={!!assignReport} onOpenChange={open => { if (!open) { setAssignReport(null); setAssignShowNewProjectInput(false); setAssignNewProjectName(''); } }}>
        <DialogContent className="text-foreground">
          <DialogHeader>
            <DialogTitle>Assign to Project</DialogTitle>
            <DialogDescription>
              {assignReport?.pageTitle || assignReport?.sitemap}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="assign-project-select">Project</Label>
            {assignShowNewProjectInput ? (
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="assign-project-select"
                  placeholder="New project name"
                  value={assignNewProjectName}
                  onChange={e => setAssignNewProjectName(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => { setAssignShowNewProjectInput(false); setAssignNewProjectName(''); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="mt-1.5 flex gap-2">
                <select
                  id="assign-project-select"
                  value={assignProjectId}
                  onChange={e => setAssignProjectId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <option value="">No project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignShowNewProjectInput(true)}>
                  + New
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              onClick={async () => {
                if (!assignReport) return;
                let resolvedProjectId = assignProjectId;
                if (assignShowNewProjectInput && assignNewProjectName.trim()) {
                  const created = await createProject(assignNewProjectName.trim());
                  if (created) resolvedProjectId = created.id;
                }
                await apiFetch(`/api/reports/${assignReport.id}/project`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId: resolvedProjectId || null }),
                });
                setAssignReport(null);
                setAssignShowNewProjectInput(false);
                setAssignNewProjectName('');
                refresh({ background: true });
                refreshProjects({ background: true });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function handleRemove(id: string) {
    await apiFetch(`/api/reports/${id}`, { method: 'DELETE' });
    setPendingRemoveId(null);
    refresh({ background: true });
  }

}
