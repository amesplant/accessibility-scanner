import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ScanReport } from '@accessibility-scanner/shared';
import { ExportModal } from '@/components/ExportModal';
import { downloadReportJson } from '@/lib/reportTransfer';
import { Input } from '@/components/ui/input';
import { ExternalLink } from '@/components/ExternalLink';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';

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

interface ProjectWithReports {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  reports: ScanReport[];
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  'rapid': 'Rapid Audit',
  'mid-level': 'Mid-Level',
  'all-inclusive': 'All-Inclusive',
};

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportReport, setExportReport] = useState<ScanReport | null>(null);
  const [exportingJsonId, setExportingJsonId] = useState<string | null>(null);
  const [removeConfirmReport, setRemoveConfirmReport] = useState<ScanReport | null>(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState<ScanReport | null>(null);
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false);
  const { handleCloseAutoFocus: handleDeleteProjectCloseAutoFocus } = useRestoreFocus(deleteProjectConfirm);
  const { handleCloseAutoFocus: handleDeleteReportCloseAutoFocus } = useRestoreFocus(!!deleteConfirmReport);
  const { handleCloseAutoFocus: handleRemoveReportCloseAutoFocus } = useRestoreFocus(!!removeConfirmReport);

  // Inline edit state
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (project) document.title = `${project.name} — Seymour`;
    return () => { document.title = 'Seymour'; };
  }, [project]);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Project not found');
      setProject(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveName() {
    if (!project || !editName.trim()) return;
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingName(false);
    await load();
  }

  async function saveDescription() {
    if (!project) return;
    await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: editDescription.trim() || null }),
    });
    setEditingDescription(false);
    await load();
  }

  async function removeFromProject(reportId: string) {
    await fetch(`/api/reports/${reportId}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null }),
    });
    setRemoveConfirmReport(null);
    await load();
  }

  async function deleteReport(reportId: string) {
    await fetch(`/api/reports/${reportId}`, { method: 'DELETE' });
    setDeleteConfirmReport(null);
    await load();
  }

  async function deleteProject() {
    if (!project) return;
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    navigate('/projects');
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-on-surface-variant">
      <Icon name="hourglass_empty" className="animate-spin mr-2" />
      Loading project…
    </div>
  );
  if (error || !project) return <div className="p-8 text-error">{error ?? 'Project not found'}</div>;

  return (
    <div className="p-8 space-y-8">
      {/* Back link */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <Icon name="arrow_back" className="text-[18px]" />
        All Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">
            Created {new Date(project.createdAt).toLocaleDateString()} · {project.reports.length} {project.reports.length === 1 ? 'report' : 'reports'}
          </p>

          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-2xl font-extrabold h-auto py-1 max-w-md bg-transparent border-0 border-b-2 border-primary rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
              <button type="button" onClick={saveName} aria-label="Save name"
                className="p-2 rounded-xl text-secondary hover:bg-secondary-container transition-colors">
                <Icon name="check" />
              </button>
              <button type="button" onClick={() => setEditingName(false)} aria-label="Cancel"
                className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
                <Icon name="close" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">{project.name}</h1>
              <button
                type="button"
                onClick={() => { setEditName(project.name); setEditingName(true); }}
                aria-label="Edit project name"
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-container transition-all"
              >
                <Icon name="edit" className="text-[18px] text-on-surface-variant" />
              </button>
            </div>
          )}

          {editingDescription ? (
            <div className="flex items-center gap-2 mt-2">
              <Input
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') setEditingDescription(false); }}
                className="max-w-md"
                autoFocus
              />
              <button type="button" onClick={saveDescription} aria-label="Save description"
                className="p-2 rounded-xl text-secondary hover:bg-secondary-container transition-colors">
                <Icon name="check" />
              </button>
              <button type="button" onClick={() => setEditingDescription(false)} aria-label="Cancel"
                className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
                <Icon name="close" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1 group">
              <p className="text-sm text-on-surface-variant">
                {project.description ?? <span className="italic">No description</span>}
              </p>
              <button
                type="button"
                onClick={() => { setEditDescription(project.description ?? ''); setEditingDescription(true); }}
                aria-label="Edit description"
                className="p-1 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-container transition-all"
              >
                <Icon name="edit" className="text-[16px] text-on-surface-variant" />
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDeleteProjectConfirm(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-error/30 text-error hover:bg-error-container/50 transition-colors text-sm font-medium"
        >
          <Icon name="delete" className="text-[18px]" />
          Delete Project
        </button>
      </div>

      {/* Reports list */}
      {project.reports.length === 0 ? (
        <div className="text-center py-20 bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
          <Icon name="folder_open" className="text-5xl text-on-surface-variant/30 mb-4" />
          <p className="text-sm text-on-surface-variant mb-2">No reports in this project yet.</p>
          <button
            type="button"
            onClick={() => navigate('/', { state: { newScan: true, projectId: project.id } })}
            className="text-sm font-semibold text-primary hover:underline underline-offset-4"
          >
            Start a new scan
          </button>
          <span className="text-sm text-on-surface-variant"> and assign it to this project.</span>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_12px_32px_rgba(24,28,32,0.06)] overflow-hidden">
          <div className="p-6 border-b border-surface-container">
            <h2 className="text-base font-bold text-on-surface">Reports</h2>
          </div>
          <div className="divide-y divide-surface-container">
            {project.reports.map(report => (
              <div key={report.id} className="p-6 hover:bg-surface/30 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {report.auditType && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary-fixed text-primary">
                          {AUDIT_TYPE_LABELS[report.auditType] ?? report.auditType}
                        </span>
                      )}
                      <span className="text-xs text-on-surface-variant">
                        {new Date(report.startTime).toLocaleString()}
                      </span>
                    </div>
                    <p className="font-semibold text-on-surface truncate">
                      {report.pageTitle || report.sitemap}
                    </p>
                    {report.pageTitle && report.sitemap.startsWith('http') && (
                      <ExternalLink href={report.sitemap} className="text-xs text-on-surface-variant break-all">
                        {report.sitemap}
                      </ExternalLink>
                    )}
                    <div className="flex gap-6 mt-2 text-sm">
                      <span>
                        <strong className="font-bold text-on-surface">{report.summary.totalPages}</strong>{' '}
                        <span className="text-on-surface-variant">pages</span>
                      </span>
                      <span>
                        <strong className="font-bold text-error">{report.summary.totalViolations}</strong>{' '}
                        <span className="text-on-surface-variant">violations</span>
                      </span>
                      <span>
                        <strong className="font-bold text-on-surface">{report.summary.violationsByImpact?.critical ?? 0}</strong>{' '}
                        <span className="text-on-surface-variant">critical</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Link
                      to={`/reports/${report.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-container shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                    >
                      View Report
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExportReport(report)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
                    >
                      <Icon name="download" className="text-[18px]" />
                      Export
                    </button>
                    <button
                      type="button"
                      disabled={exportingJsonId === report.id}
                      onClick={async () => {
                        try {
                          setExportingJsonId(report.id);
                          await downloadReportJson(report.id);
                        } catch (err) {
                          console.error('JSON export failed:', err);
                        } finally {
                          setExportingJsonId(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                    >
                      <Icon name="data_object" className="text-[18px]" />
                      {exportingJsonId === report.id ? 'Saving…' : 'JSON'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveConfirmReport(report)}
                      aria-label={`Remove ${report.pageTitle || report.sitemap} from this project`}
                      className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
                      title="Remove from project"
                    >
                      <Icon name="folder_off" className="text-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmReport(report)}
                      aria-label={`Delete report ${report.pageTitle || report.sitemap}`}
                      className="p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
                      title="Delete report"
                    >
                      <Icon name="delete" className="text-[18px]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ExportModal report={exportReport} onClose={() => setExportReport(null)} />

      <Dialog open={deleteProjectConfirm} onOpenChange={open => { if (!open) setDeleteProjectConfirm(false); }}>
        <DialogContent onCloseAutoFocus={handleDeleteProjectCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{project.name}</strong> and unlink all its reports. Reports themselves will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteProject}>Delete project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmReport} onOpenChange={open => { if (!open) setDeleteConfirmReport(null); }}>
        <DialogContent onCloseAutoFocus={handleDeleteReportCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Delete report</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteConfirmReport?.pageTitle || deleteConfirmReport?.sitemap}</strong> and all its data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmReport(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmReport && deleteReport(deleteConfirmReport.id)}>
              Delete report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeConfirmReport} onOpenChange={open => { if (!open) setRemoveConfirmReport(null); }}>
        <DialogContent onCloseAutoFocus={handleRemoveReportCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Remove from project</DialogTitle>
            <DialogDescription>
              This will remove <strong>{removeConfirmReport?.pageTitle || removeConfirmReport?.sitemap}</strong> from this project. The report itself will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirmReport(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => removeConfirmReport && removeFromProject(removeConfirmReport.id)}>
              Remove from project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
