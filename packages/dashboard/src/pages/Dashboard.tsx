import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReports, type ReportListItem } from '@/hooks/useReports';
import { useProjects } from '@/hooks/useProjects';
import { useScanContext, formatElapsed } from '@/context/ScanContext';
import { apiFetch } from '@/lib/api';
import { downloadReportJson, importReportJsonPayload } from '@/lib/reportTransfer';
import { AuditType, ScanReport } from '@accessibility-scanner/shared';
import { Progress } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ExternalLink';
import { ProjectCard } from '@/components/ProjectCard';
import {
  ReportIntegrityNotice,
  getReportIntegrityMessage,
  isCorruptedReport,
} from '@/components/ReportIntegrityNotice';
import { ViewLayoutToggle, type ViewLayout } from '@/components/ViewLayoutToggle';
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
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import { readApiError } from '@/lib/api';
import type { ProjectWithCount } from '@/hooks/useProjects';

type InputMode = 'url' | 'file' | 'crawl' | 'urllist';

const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  'rapid':         'Rapid',
  'mid-level':     'Mid-Level',
  'all-inclusive': 'All-Inclusive',
};

const AUDIT_TYPE_DESCRIPTIONS: Record<AuditType, string> = {
  'rapid':         'Quick review of core pages and the most urgent issues.',
  'mid-level':     'Representative audit across key templates and flows.',
  'all-inclusive': 'Comprehensive review across design, code, and content.',
};

const AUDIT_TYPE_ICONS: Record<AuditType, string> = {
  'rapid':         'bolt',
  'mid-level':     'layers',
  'all-inclusive': 'all_inclusive',
};

function Icon({ name, className, filled }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={['material-symbols-outlined', className].filter(Boolean).join(' ')}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

export function Dashboard() {
  const { reports, loading, error, refresh, renameReport } = useReports();
  const { projects, createProject, deleteProject, updateProject, refresh: refreshProjects } = useProjects();
  const location = useLocation();
  const navigate = useNavigate();

  const [showScanForm, setShowScanForm] = useState(false);
  const [recentScansLayout, setRecentScansLayout] = useState<ViewLayout>('list');

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
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [openingManualAuditReportId, setOpeningManualAuditReportId] = useState<string | null>(null);
  const [reportAuditActionLabels, setReportAuditActionLabels] = useState<Record<string, 'start' | 'continue'>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const { handleCloseAutoFocus: handleRemoveCloseAutoFocus } = useRestoreFocus(!!pendingRemoveId);
  const { handleCloseAutoFocus: handleDeleteProjectCloseAutoFocus } = useRestoreFocus(!!pendingDeleteProjectId);
  const { handleCloseAutoFocus: handleAssignCloseAutoFocus } = useRestoreFocus(!!assignReport);

  useEffect(() => {
    document.title = 'Seymour — Dashboard';
  }, []);

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

  async function handleImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    setIsImporting(true);
    setImportStatus(null);
    setImportError(null);

    let totalImported = 0;
    let totalSkipped = 0;
    const failures: string[] = [];

    for (const f of selectedFiles) {
      try {
        const parsed = JSON.parse(await f.text()) as unknown;
        const result = await importReportJsonPayload(parsed);
        totalImported += result.importedCount;
        totalSkipped += result.skippedCount;
      } catch (err) {
        failures.push(`${f.name}: ${err instanceof Error ? err.message : 'invalid JSON file'}`);
      }
    }

    if (totalImported > 0) {
      setImportStatus(`Imported ${totalImported} report${totalImported === 1 ? '' : 's'}${totalSkipped ? ` (${totalSkipped} skipped)` : ''}.`);
      refresh({ background: true });
      refreshProjects({ background: true });
    }

    if (failures.length > 0) {
      setImportError(failures.join(' | '));
    } else if (totalImported === 0) {
      setImportError('No valid reports were imported.');
    }

    setIsImporting(false);
  }

  function switchMode(next: InputMode) {
    setMode(next);
    setScanError(null);
  }

  async function handleRemove(id: string) {
    try {
      const res = await apiFetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw await readApiError(res, 'Failed to remove report');
      setPendingRemoveId(null);
      refresh({ background: true });
      refreshProjects({ background: true });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to remove report');
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

  function getAuditActionLabelFromPages(pages: ScanReport['results']): 'start' | 'continue' {
    const hasAuditProgress = pages.some((pageResult) => {
      const state = getManualAuditState(pageResult);
      return state.failCount > 0 || state.checkedCount > 0 || state.completed;
    });

    return hasAuditProgress ? 'continue' : 'start';
  }

  async function handleOpenManualAudit(report: ReportListItem) {
    try {
      setOpeningManualAuditReportId(report.id);
      const res = await apiFetch(`/api/reports/${report.id}/pages?offset=0&limit=250`);
      if (!res.ok) throw await readApiError(res, 'Failed to fetch report pages');
      const data = await res.json() as { items?: ScanReport['results'] };
      const pages = data.items ?? [];

      setReportAuditActionLabels((current) => ({
        ...current,
        [report.id]: getAuditActionLabelFromPages(pages),
      }));

      const targetPage =
        pages.find((pageResult) => getManualAuditState(pageResult).failCount > 0) ??
        pages.find((pageResult) => {
          const state = getManualAuditState(pageResult);
          return !state.completed && state.checkedCount > 0;
        }) ??
        pages.find((pageResult) => !getManualAuditState(pageResult).completed) ??
        null;

      if (targetPage) {
        navigate(`/reports/${report.id}/page/${targetPage.id}`, { state: { tab: 'manual' } });
        return;
      }

      navigate(`/reports/${report.id}?tab=pages`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to open manual audit');
    } finally {
      setOpeningManualAuditReportId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAuditActionLabels() {
      const labelEntries = await Promise.all(
        reports.map(async (report) => {
          if (isCorruptedReport(report)) {
            return [report.id, 'start'] as const;
          }
          try {
            const limit = Math.min(report.summary.totalPages || 250, 250);
            const res = await apiFetch(`/api/reports/${report.id}/pages?offset=0&limit=${Math.max(limit, 1)}`);
            if (!res.ok) return [report.id, 'start'] as const;
            const data = await res.json() as { items?: ScanReport['results'] };
            return [report.id, getAuditActionLabelFromPages(data.items ?? [])] as const;
          } catch {
            return [report.id, 'start'] as const;
          }
        }),
      );

      if (!cancelled) {
        setReportAuditActionLabels(Object.fromEntries(labelEntries));
      }
    }

    if (reports.length > 0) {
      loadAuditActionLabels();
    } else {
      setReportAuditActionLabels({});
    }

    return () => {
      cancelled = true;
    };
  }, [reports]);

  const progressPercent = scanState.total > 0
    ? Math.round((scanState.scanned / scanState.total) * 100)
    : 0;
  const pendingRemoveReport = pendingRemoveId
    ? reports.find((report) => report.id === pendingRemoveId) ?? null
    : null;

  const totalCritical = reports.reduce((sum, r) => sum + (r.summary.violationsByImpact?.critical ?? 0), 0);

  // ── Scan form ──────────────────────────────────────────────────────────────

  const scanForm = (
    <div className="grid grid-cols-12 gap-8">
      {/* Left: form */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight mb-1">Setup Your Next Audit</h1>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Initialize an automated scan to identify accessibility barriers. Choose a tier that matches your current development phase.
          </p>
        </div>

        <form onSubmit={handleScan} className="flex flex-col gap-8">
          {/* Audit tier selection */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">1. Select Audit Tier</p>
            <div className="grid grid-cols-3 gap-4">
              {(['rapid', 'mid-level', 'all-inclusive'] as AuditType[]).map(type => {
                const isSelected = auditType === type;
                const isAI = type === 'all-inclusive';
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={scanning}
                    onClick={() => handleAuditTypeChange(type)}
                    aria-pressed={isSelected}
                    className={[
                      'relative group cursor-pointer rounded-xl p-5 text-left transition-all border-2',
                      isSelected
                        ? type === 'all-inclusive'
                          ? 'bg-surface-container-lowest shadow-xl border-tertiary-fixed-dim'
                          : type === 'mid-level'
                            ? 'bg-surface-container-lowest shadow-xl border-secondary-fixed-dim'
                            : 'bg-surface-container-lowest shadow-xl border-emerald-300'
                        : type === 'all-inclusive'
                          ? 'bg-surface-container-lowest border-transparent hover:bg-white hover:shadow-lg hover:border-tertiary-fixed-dim'
                          : type === 'mid-level'
                            ? 'bg-surface-container-lowest border-transparent hover:bg-white hover:shadow-lg hover:border-secondary-fixed-dim'
                            : 'bg-surface-container-lowest border-transparent hover:bg-white hover:shadow-lg hover:border-emerald-200',
                      scanning ? 'opacity-50 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    <div className={[
                      'w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors',
                      isSelected
                        ? (isAI
                          ? 'bg-tertiary-fixed text-tertiary'
                          : type === 'mid-level'
                            ? 'bg-secondary-fixed text-on-secondary-fixed'
                            : 'bg-emerald-100 text-emerald-700')
                        : (isAI
                          ? 'bg-surface-container-low text-tertiary'
                          : type === 'mid-level'
                            ? 'bg-surface-container-low text-secondary-md'
                            : 'bg-emerald-50 text-emerald-700'),
                    ].join(' ')}>
                      <Icon name={AUDIT_TYPE_ICONS[type]} className="text-xl" />
                    </div>
                    <p className="font-bold text-on-surface text-sm mb-1">{AUDIT_TYPE_LABELS[type]}</p>
                    <p className="text-xs text-on-surface-variant leading-normal">{AUDIT_TYPE_DESCRIPTIONS[type]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form fields */}
          <div className="bg-surface-container-low rounded-xl p-6 space-y-6">
            {/* WCAG level + best practices */}
            <div className="flex flex-wrap gap-6 items-end">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-on-surface">WCAG Level</Label>
                <div className="flex gap-2">
                  {(['A', 'AA', 'AAA'] as const).map(level => (
                    <button
                      key={level}
                      type="button"
                      disabled={scanning}
                      onClick={() => setWcagLevel(level)}
                      aria-pressed={wcagLevel === level}
                      className={[
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        wcagLevel === level
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                        scanning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      {`WCAG ${level}`}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeBestPractices}
                  onChange={e => setIncludeBestPractices(e.target.checked)}
                  disabled={scanning}
                  className="h-4 w-4 rounded border-outline accent-primary"
                />
                <span className="text-sm font-medium text-on-surface">Include best practices</span>
              </label>
            </div>

            {/* Project + name */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="scan-project" className="text-sm font-bold text-on-surface">
                  Project <span className="font-normal text-on-surface-variant">(optional)</span>
                </Label>
                {showNewProjectInput ? (
                  <div className="flex gap-2">
                    <Input
                      id="scan-project"
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      disabled={scanning}
                      className="bg-surface-container-lowest"
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
                      className="flex h-9 w-full rounded-lg border border-outline/30 bg-surface-container-lowest px-3 py-1 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div className="space-y-2">
                <Label htmlFor="scan-parallel" className="text-sm font-bold text-on-surface">Parallel browser tabs</Label>
                <select
                  id="scan-parallel"
                  value={parallelTabs}
                  onChange={e => setParallelTabs(e.target.value as '1' | '3' | '5' | '8')}
                  disabled={scanning}
                  aria-describedby="scan-parallel-hint"
                  className="flex h-9 w-full rounded-lg border border-outline/30 bg-surface-container-lowest px-3 py-1 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="1">1</option>
                  <option value="3">3</option>
                  <option value="5">5</option>
                  <option value="8">8</option>
                </select>
                <p id="scan-parallel-hint" className="text-xs text-on-surface-variant">
                  Lower = less memory. Higher = faster scans.
                </p>
              </div>
            </div>

            {/* Input mode toggle (All-Inclusive only) */}
            {mode !== 'urllist' && (
              <div className="space-y-2">
                <Label className="text-sm font-bold text-on-surface">Input method</Label>
                <div className="flex gap-2">
                  {(['url', 'file', 'crawl'] as InputMode[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      disabled={scanning}
                      aria-pressed={mode === m}
                      className={[
                        'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                        mode === m
                          ? 'bg-primary text-white'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
                        scanning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      {m === 'url' ? 'Sitemap URL' : m === 'file' ? 'Upload XML' : 'Crawl Site'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* URL list (Rapid/Mid-Level) */}
            {mode === 'urllist' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="url-list-input" className="text-sm font-bold text-on-surface">
                    Page URLs to audit
                    {auditType === 'rapid' && (
                      <span className={['ml-2 text-xs font-normal', urlList.length >= 5 ? 'text-destructive' : 'text-on-surface-variant'].join(' ')}>
                        {urlList.length} / 5
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
                      className="flex-1 bg-surface-container-lowest"
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
                  <ul className="flex flex-col gap-1.5" aria-label="URLs to audit">
                    {urlList.map((url, i) => (
                      <li key={url} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2">
                        <span className="text-xs font-mono truncate flex-1 mr-2 text-on-surface">{url}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveUrl(i)}
                          disabled={scanning}
                          aria-label={`Remove ${url}`}
                          className="text-on-surface-variant hover:text-destructive transition-colors shrink-0 p-1"
                        >
                          <Icon name="close" className="text-sm" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Sitemap URL input */}
            {mode === 'url' && (
              <div className="space-y-2">
                <Label htmlFor="sitemap" className="text-sm font-bold text-on-surface">Sitemap URL or crawl starting point</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Icon name="language" className="text-primary text-base" />
                  </div>
                  <Input
                    id="sitemap"
                    type="text"
                    value={sitemap}
                    onChange={e => setSitemap(e.target.value)}
                    disabled={scanning}
                    className="pl-9 bg-surface-container-lowest"
                  />
                </div>
              </div>
            )}

            {/* File upload */}
            {mode === 'file' && (
              <div className="space-y-2">
                <Label htmlFor="sitemap-file" className="text-sm font-bold text-on-surface">Sitemap XML file</Label>
                <Input
                  id="sitemap-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  disabled={scanning}
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className="bg-surface-container-lowest"
                />
                {file && <p className="text-xs text-on-surface-variant">{file.name}</p>}
              </div>
            )}

            {/* Crawl */}
            {mode === 'crawl' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-surface-container-high p-4 text-sm space-y-1">
                  <p className="font-semibold text-on-surface">Before you crawl</p>
                  <ul className="list-disc list-inside text-on-surface-variant text-xs space-y-0.5">
                    <li>Keep the path specific to avoid scanning the whole site.</li>
                    <li>Lower parallel tabs if the process struggles with memory.</li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="crawl-url" className="text-sm font-bold text-on-surface">Site URL to crawl</Label>
                    <Input
                      id="crawl-url"
                      type="url"
                      value={crawlUrl}
                      onChange={e => setCrawlUrl(e.target.value)}
                      disabled={scanning}
                      className="bg-surface-container-lowest"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-pages" className="text-sm font-bold text-on-surface">Max pages</Label>
                    <Input
                      id="max-pages"
                      type="number"
                      min="1"
                      max="5000"
                      value={maxPages}
                      onChange={e => setMaxPages(e.target.value)}
                      disabled={scanning}
                      className="bg-surface-container-lowest"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scan progress */}
          <div
            id="scan-progress"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={scanning ? 'flex flex-col gap-2' : 'sr-only'}
          >
            {scanning && (
              <>
                <div className="flex items-center justify-between text-sm text-on-surface-variant">
                  <span className="truncate max-w-[70%]">
                    {scanState.phase === 'crawling' && (crawlingUrl ? <>Crawling: <span className="font-mono text-xs">{crawlingUrl}</span></> : 'Discovering pages…')}
                    {scanState.phase === 'scanning' && scanState.total > 0 && `Scanning page ${scanState.scanned} of ${scanState.total}`}
                    {scanState.phase === 'scanning' && scanState.total === 0 && 'Scanning…'}
                    {!scanState.phase && 'Starting…'}
                  </span>
                  <span className="font-mono text-xs" aria-label={`Elapsed time: ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</span>
                </div>

                {scanState.phase === 'scanning' && scanState.total > 0 ? (
                  <Progress value={progressPercent} className="h-2" aria-label={`Scan progress: ${progressPercent}%`} />
                ) : (
                  <div className="h-2 rounded-full bg-surface-container-high overflow-hidden" role="progressbar" aria-label="Scan in progress" aria-valuetext="Indeterminate">
                    <div className="h-full w-1/3 rounded-full bg-primary animate-[progress-indeterminate_1.5s_ease-in-out_infinite]" />
                  </div>
                )}

                {scanState.phase === 'scanning' && scanningUrl && (
                  <p className="text-xs text-on-surface-variant font-mono truncate" title={scanningUrl}>{scanningUrl}</p>
                )}

                <Button type="button" variant="outline" size="sm" className="self-start" onClick={handleAbort}>
                  Abort
                </Button>
              </>
            )}
          </div>

          {scanError && (
            <p id="scan-error" role="alert" className="text-sm text-destructive">{scanError}</p>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => { resetForm(); setShowScanForm(false); }}
              className="px-6 py-3 text-on-surface-variant font-semibold hover:text-on-surface transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || scanning}
              className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-primary to-primary-container text-white rounded-full font-bold text-sm shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {scanning ? 'Scanning…' : `Start ${AUDIT_TYPE_LABELS[auditType]} Scan`}
              <Icon name="rocket_launch" className="text-base" />
            </button>
          </div>
        </form>
      </div>

      {/* Right: Auditor's Tips */}
      <aside className="col-span-12 lg:col-span-4">
        <div className="sticky top-24 glass-panel rounded-2xl p-6 border border-white/40 shadow-2xl shadow-slate-200/40">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-tertiary flex items-center justify-center">
              <Icon name="lightbulb" className="text-white text-base" filled />
            </div>
            <h2 className="text-base font-bold text-on-surface">Choosing The Right Audit</h2>
          </div>
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <Icon name="bolt" className="text-sm" />
                Rapid Accessibility Audit
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Best for a fast assessment of high-impact pages and core journeys when you need to surface the most critical accessibility barriers first. It is a focused audit that highlights the issues most likely to affect end users without aiming to document every WCAG issue on the site.
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-secondary-md flex items-center gap-2">
                <Icon name="layers" className="text-sm" />
                Mid-Level Accessibility Audit
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Best when you want stronger coverage across a wider range of pages, templates, and components without moving into a fully bespoke program. It balances depth and efficiency, helping teams uncover both major and moderate issues across a representative sample of the experience.
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-tertiary flex items-center gap-2">
                <Icon name="verified_user" className="text-sm" />
                All-Inclusive Accessibility Audit
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Best for clients who need the deepest view of accessibility risk across design, code, content, navigation, forms, multimedia, and interactive behavior. It is the most comprehensive option for teams planning broad remediation work or preparing for stronger compliance and governance expectations.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );

  // ── Overview (main dashboard) ──────────────────────────────────────────────

  const overview = (
    <div>
      {/* Page header */}
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Operational Intelligence</p>
          <h1 className="text-3xl font-extrabold text-on-surface tracking-tight">Audit Dashboard</h1>
          <p className="text-on-surface-variant text-sm mt-1">System health and compliance monitoring for enterprise accessibility.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={importFileInputRef}
            type="file"
            accept="application/json,.json"
            multiple
            className="sr-only"
            aria-label="Import JSON reports"
            onChange={handleImportChange}
          />
          <button
            type="button"
            disabled={isImporting}
            onClick={() => importFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-on-surface-variant bg-surface-container-lowest border border-outline-variant hover:border-primary hover:text-primary transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon name="upload" className="text-base" />
            {isImporting ? 'Importing…' : 'Import JSON'}
          </button>
          <button
            type="button"
            onClick={() => { resetForm(); setShowScanForm(true); }}
            className="flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-primary to-primary-container text-white shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon name="add" className="text-base" />
            New Scan
          </button>
        </div>
      </div>

      {(importStatus || importError) && (
        <div className="mb-6">
          {importStatus && <p role="status" className="text-sm text-secondary-md">{importStatus}</p>}
          {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.04)] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Total Reports</p>
            <p className="text-4xl font-extrabold text-on-surface">{reports.length}</p>
          </div>
          <div className="w-12 h-12 bg-primary-fixed rounded-full flex items-center justify-center text-primary shrink-0">
            <Icon name="history" className="text-2xl" />
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.04)] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Active Projects</p>
            <p className="text-4xl font-extrabold text-on-surface">{projects.length}</p>
          </div>
          <div className="w-12 h-12 bg-secondary-container rounded-full flex items-center justify-center text-on-secondary-container shrink-0">
            <Icon name="assignment_turned_in" className="text-2xl" />
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.04)] flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Critical Issues</p>
            <p className={['text-4xl font-extrabold', totalCritical > 0 ? 'text-destructive' : 'text-on-surface'].join(' ')}>
              {totalCritical}
            </p>
          </div>
          <div className="w-12 h-12 bg-error-container rounded-full flex items-center justify-center text-on-error-container shrink-0">
            <Icon name="warning" className="text-2xl" />
          </div>
        </div>
      </div>

      {/* Active Projects */}
      {projects.length > 0 && (
        <section className="mb-10">
          <div className="flex items-end justify-between mb-5">
            <h2 className="text-lg font-bold text-on-surface">Active Projects</h2>
            <Link to="/projects" className="text-sm font-semibold text-primary hover:underline">
              View All Projects
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 3).map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={(projectId) => navigate(`/projects/${projectId}`)}
                onEdit={setEditingProject}
                onDelete={setPendingDeleteProjectId}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Scans / Reports */}
      {loading && reports.length === 0 && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-on-surface-variant py-8">
          <Icon name="sync" className="animate-spin" />
          <span>Loading reports…</span>
        </div>
      )}
      {error && <p role="alert" className="text-destructive mb-6">{error}</p>}

      {reports.length > 0 && (
        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-on-surface">Recent Scans</h2>
            <ViewLayoutToggle value={recentScansLayout} onChange={setRecentScansLayout} ariaLabel="Recent scans layout" />
          </div>
          {recentScansLayout === 'list' ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.04)] overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase">
                  <th className="px-6 py-4">Report</th>
                  <th className="px-6 py-4 text-right">Pages</th>
                  <th className="px-6 py-4 text-right">Violations</th>
                  <th className="px-6 py-4">Scanned</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => {
                  const proj = report.projectId ? projects.find(p => p.id === report.projectId) : null;
                  const reportLabel = report.pageTitle || report.sitemap;
                  const reportCorrupted = isCorruptedReport(report);
                  const manualAuditActionLabel = reportAuditActionLabels[report.id] === 'continue'
                    ? 'Continue Audit'
                    : 'Start Audit';
                  return (
                    <tr key={report.id} className="hover:bg-surface-container-low transition-colors group border-t border-surface-container-high">
                      <td className="px-6 py-4">
                        <div>
                          {report.auditType && (
                            <div className="mb-2">
                              <span className={[
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]',
                                report.auditType === 'all-inclusive'
                                  ? 'border-tertiary-fixed-dim bg-tertiary-fixed text-on-tertiary-fixed'
                                  : report.auditType === 'mid-level'
                                    ? 'border-secondary-fixed-dim bg-secondary-fixed text-on-secondary-fixed'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-900',
                              ].join(' ')}>
                                <Icon
                                  name={AUDIT_TYPE_ICONS[report.auditType]}
                                  className={[
                                    'text-sm',
                                    report.auditType === 'all-inclusive'
                                      ? 'text-tertiary'
                                      : report.auditType === 'mid-level'
                                        ? 'text-secondary-md'
                                        : 'text-emerald-700',
                                  ].join(' ')}
                                />
                                {AUDIT_TYPE_LABELS[report.auditType]}
                              </span>
                            </div>
                          )}
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
                                className="text-sm font-semibold bg-transparent border-b-2 border-primary flex-1 min-w-0 text-on-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                                aria-label="Report name"
                              />
                              <button type="button" onClick={() => { renameReport(report.id, renameDraft); setRenamingReportId(null); }} aria-label="Save" className="text-on-surface-variant hover:text-on-surface p-1 rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                                <Icon name="check" className="text-sm" />
                              </button>
                              <button type="button" onClick={() => setRenamingReportId(null)} aria-label="Cancel" className="text-on-surface-variant hover:text-on-surface p-1 rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                                <Icon name="close" className="text-sm" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group/title">
                              <Link
                                to={`/reports/${report.id}`}
                                className="text-sm font-semibold text-on-surface hover:text-primary transition-colors"
                              >
                                {report.pageTitle || report.sitemap}
                              </Link>
                              <button
                                type="button"
                                onClick={() => { setRenameDraft(report.pageTitle || report.sitemap); setRenamingReportId(report.id); setTimeout(() => renameInputRef.current?.select(), 0); }}
                                aria-label={`Rename ${report.pageTitle || report.sitemap}`}
                                className="opacity-0 text-on-surface-variant hover:text-primary transition-opacity p-1 rounded-md group-hover/title:opacity-100 group-focus-within/title:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                <Icon name="edit" className="text-sm" />
                              </button>
                            </div>
                          )}
                          {report.pageTitle && report.sitemap.startsWith('http') && (
                            <ExternalLink href={report.sitemap} className="text-xs text-on-surface-variant break-all">
                              {report.sitemap}
                            </ExternalLink>
                          )}
                          {proj && (
                            <Link
                              to={`/projects/${proj.id}`}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold mt-1 text-secondary-md hover:underline"
                            >
                              <Icon name="folder_open" className="text-xs" />
                              {proj.name}
                            </Link>
                          )}
                          <ReportIntegrityNotice report={report} className="max-w-xl" />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link to={`/reports/${report.id}?tab=pages`} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors">
                          {report.summary.totalPages}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/reports/${report.id}?tab=violations`}
                          className={['text-sm font-semibold hover:underline', report.summary.totalViolations > 0 ? 'text-destructive' : 'text-on-surface'].join(' ')}
                        >
                          {report.summary.totalViolations}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-on-surface-variant">
                          {new Date(report.startTime).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleOpenManualAudit(report)}
                            disabled={openingManualAuditReportId === report.id || reportCorrupted}
                            aria-label={reportCorrupted
                              ? `Manual audit unavailable for ${reportLabel}: ${getReportIntegrityMessage(report)}`
                              : `${openingManualAuditReportId === report.id ? 'Opening manual audit for' : `${manualAuditActionLabel} for`} ${reportLabel}`}
                            className="h-10 rounded-xl bg-secondary px-4 text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 transition-opacity disabled:opacity-60 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {reportCorrupted ? 'Audit unavailable' : openingManualAuditReportId === report.id ? 'Opening…' : manualAuditActionLabel}
                          </button>
                          <Link
                            to={`/reports/${report.id}`}
                            aria-label={`View report details for ${reportLabel}`}
                            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {reportCorrupted ? 'Review' : 'View'}
                          </Link>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => { setAssignReport(report); setAssignProjectId(report.projectId ?? ''); }}
                              aria-label={`Assign ${reportLabel} to a project`}
                              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <Icon name="folder_open" className="text-base" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExportReport(report)}
                              aria-label={`Export report for ${reportLabel}`}
                              disabled={reportCorrupted}
                              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <Icon name="download" className="text-base" />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadReportJson(report.id).catch(err => setImportError(err instanceof Error ? err.message : 'Failed to export JSON'))}
                              aria-label={`Download JSON for ${reportLabel}`}
                              disabled={reportCorrupted}
                              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              <Icon name="data_object" className="text-base" />
                            </button>
                            {reportCorrupted ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingRemoveId(report.id);
                                }}
                                aria-label={`Cleanup broken report for ${reportLabel}`}
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-error/30 px-3 text-xs font-semibold text-error hover:bg-error-container/50 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                <Icon name="cleaning_services" className="text-base" />
                                Cleanup
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingRemoveId(report.id);
                                }}
                                aria-label={`Delete report for ${reportLabel}`}
                                className="p-2 rounded-lg text-on-surface-variant hover:text-destructive hover:bg-error-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                <Icon name="delete" className="text-base" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {reports.map(report => {
                const proj = report.projectId ? projects.find(p => p.id === report.projectId) : null;
                const reportLabel = report.pageTitle || report.sitemap;
                const reportCorrupted = isCorruptedReport(report);
                const manualAuditActionLabel = reportAuditActionLabels[report.id] === 'continue'
                  ? 'Continue Audit'
                  : 'Start Audit';

                return (
                  <div key={report.id} className="rounded-2xl bg-surface-container-lowest p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.04)]">
                    <div>
                      {report.auditType && (
                        <div className="mb-3">
                          <span className={[
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]',
                            report.auditType === 'all-inclusive'
                              ? 'border-tertiary-fixed-dim bg-tertiary-fixed text-on-tertiary-fixed'
                              : report.auditType === 'mid-level'
                                ? 'border-secondary-fixed-dim bg-secondary-fixed text-on-secondary-fixed'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-900',
                          ].join(' ')}>
                            <Icon
                              name={AUDIT_TYPE_ICONS[report.auditType]}
                              className={[
                                'text-sm',
                                report.auditType === 'all-inclusive'
                                  ? 'text-tertiary'
                                  : report.auditType === 'mid-level'
                                    ? 'text-secondary-md'
                                    : 'text-emerald-700',
                              ].join(' ')}
                            />
                            {AUDIT_TYPE_LABELS[report.auditType]}
                          </span>
                        </div>
                      )}

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
                            className="text-sm font-semibold bg-transparent border-b-2 border-primary flex-1 min-w-0 text-on-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                            aria-label="Report name"
                          />
                          <button type="button" onClick={() => { renameReport(report.id, renameDraft); setRenamingReportId(null); }} aria-label="Save" className="text-on-surface-variant hover:text-on-surface p-1 rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                            <Icon name="check" className="text-sm" />
                          </button>
                          <button type="button" onClick={() => setRenamingReportId(null)} aria-label="Cancel" className="text-on-surface-variant hover:text-on-surface p-1 rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
                            <Icon name="close" className="text-sm" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/title">
                          <Link to={`/reports/${report.id}`} className="text-base font-semibold text-on-surface hover:text-primary transition-colors break-words">
                            {reportLabel}
                          </Link>
                          <button
                            type="button"
                            onClick={() => { setRenameDraft(reportLabel); setRenamingReportId(report.id); setTimeout(() => renameInputRef.current?.select(), 0); }}
                            aria-label={`Rename ${reportLabel}`}
                            className="opacity-0 text-on-surface-variant hover:text-primary transition-opacity p-1 rounded-md group-hover/title:opacity-100 group-focus-within/title:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <Icon name="edit" className="text-sm" />
                          </button>
                        </div>
                      )}

                      {report.pageTitle && report.sitemap.startsWith('http') && (
                        <ExternalLink href={report.sitemap} className="mt-1 block text-xs text-on-surface-variant break-all">
                          {report.sitemap}
                        </ExternalLink>
                      )}
                      {proj && (
                        <Link to={`/projects/${proj.id}`} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-secondary-md hover:underline">
                          <Icon name="folder_open" className="text-xs" />
                          {proj.name}
                        </Link>
                      )}
                      <ReportIntegrityNotice report={report} />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-surface-container-low p-4 text-sm">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Pages</p>
                        <p className="mt-1 font-semibold text-on-surface">{report.summary.totalPages}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Violations</p>
                        <p className={['mt-1 font-semibold', report.summary.totalViolations > 0 ? 'text-destructive' : 'text-on-surface'].join(' ')}>{report.summary.totalViolations}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Scanned</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{new Date(report.startTime).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenManualAudit(report)}
                        disabled={openingManualAuditReportId === report.id || reportCorrupted}
                        aria-label={reportCorrupted
                          ? `Manual audit unavailable for ${reportLabel}: ${getReportIntegrityMessage(report)}`
                          : `${openingManualAuditReportId === report.id ? 'Opening manual audit for' : `${manualAuditActionLabel} for`} ${reportLabel}`}
                        className="h-10 rounded-xl bg-secondary px-4 text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 transition-opacity disabled:opacity-60 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {reportCorrupted ? 'Audit unavailable' : openingManualAuditReportId === report.id ? 'Opening…' : manualAuditActionLabel}
                      </button>
                      <Link
                        to={`/reports/${report.id}`}
                        aria-label={`View report details for ${reportLabel}`}
                        className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {reportCorrupted ? 'Review' : 'View'}
                      </Link>
                    </div>

                    <div className="mt-4 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setAssignReport(report); setAssignProjectId(report.projectId ?? ''); }}
                        aria-label={`Assign ${reportLabel} to a project`}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <Icon name="folder_open" className="text-base" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportReport(report)}
                        aria-label={`Export report for ${reportLabel}`}
                        disabled={reportCorrupted}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <Icon name="download" className="text-base" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadReportJson(report.id).catch(err => setImportError(err instanceof Error ? err.message : 'Failed to export JSON'))}
                        aria-label={`Download JSON for ${reportLabel}`}
                        disabled={reportCorrupted}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <Icon name="data_object" className="text-base" />
                      </button>
                      {reportCorrupted ? (
                        <button
                          type="button"
                          onClick={() => { setPendingRemoveId(report.id); }}
                          aria-label={`Cleanup broken report for ${reportLabel}`}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-error/30 px-3 text-xs font-semibold text-error hover:bg-error-container/50 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <Icon name="cleaning_services" className="text-base" />
                          Cleanup
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setPendingRemoveId(report.id); }}
                          aria-label={`Delete report for ${reportLabel}`}
                          className="p-2 rounded-lg text-on-surface-variant hover:text-destructive hover:bg-error-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <Icon name="delete" className="text-base" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Empty state */}
      {!loading && reports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-primary-fixed flex items-center justify-center">
            <Icon name="biotech" className="text-3xl text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-on-surface mb-1">No scans yet</p>
            <p className="text-sm text-on-surface-variant">Start your first accessibility scan to see results here.</p>
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setShowScanForm(true); }}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-white font-semibold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon name="add" className="text-base" />
            Start First Scan
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {showScanForm || scanning ? scanForm : overview}

      {/* Dialogs */}
      <Dialog
        open={!!pendingRemoveId}
        onOpenChange={open => {
          if (!open) {
            setPendingRemoveId(null);
          }
        }}
      >
        <DialogContent aria-live="assertive" onCloseAutoFocus={handleRemoveCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle className="text-on-surface">
              {isCorruptedReport(pendingRemoveReport) ? 'Cleanup broken report?' : 'Remove report?'}
            </DialogTitle>
            <DialogDescription className="text-on-surface-variant">
              {isCorruptedReport(pendingRemoveReport)
                ? 'This will permanently remove the unreadable report payload and its summary entry. This action cannot be undone.'
                : 'This will permanently delete this scan report. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" aria-label="Cancel — keep this report" autoFocus>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={() => pendingRemoveId && handleRemove(pendingRemoveId)}>
              {isCorruptedReport(pendingRemoveReport) ? 'Cleanup report' : 'Remove report'}
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

      {/* Delete project */}
      {(() => {
        const proj = projects.find(p => p.id === pendingDeleteProjectId);
        return (
          <Dialog open={!!pendingDeleteProjectId} onOpenChange={open => { if (!open) setPendingDeleteProjectId(null); }}>
            <DialogContent className="text-on-surface" onCloseAutoFocus={handleDeleteProjectCloseAutoFocus}>
              <DialogHeader>
                <DialogTitle>Delete Project</DialogTitle>
                <DialogDescription>
                  Delete <strong>{proj?.name}</strong>? Scans will not be deleted — they will just be unassigned.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 mt-4">
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="button" variant="destructive" onClick={async () => { if (!pendingDeleteProjectId) return; await deleteProject(pendingDeleteProjectId); setPendingDeleteProjectId(null); }}>
                  Delete Project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Assign to project */}
      <Dialog open={!!assignReport} onOpenChange={open => { if (!open) { setAssignReport(null); setAssignShowNewProjectInput(false); setAssignNewProjectName(''); } }}>
        <DialogContent className="text-on-surface" onCloseAutoFocus={handleAssignCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Assign to Project</DialogTitle>
            <DialogDescription>{assignReport?.pageTitle || assignReport?.sitemap}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="assign-project-select">Project</Label>
            {assignShowNewProjectInput ? (
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="assign-project-select"
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
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignShowNewProjectInput(true)}>+ New</Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
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
    </>
  );
}
