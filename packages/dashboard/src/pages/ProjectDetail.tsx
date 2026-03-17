import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Pencil, Trash2, X, Check } from 'lucide-react';
import { ScanReport } from '@accessibility-scanner/shared';
import { ExportModal } from '@/components/ExportModal';
import { Button } from '@/components/ui/button';
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
  'all-inclusive': 'Full Site',
};

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportReport, setExportReport] = useState<ScanReport | null>(null);
  const [removeConfirmReport, setRemoveConfirmReport] = useState<ScanReport | null>(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState<ScanReport | null>(null);

  // Inline edit state
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (project) document.title = `${project.name} — Fueled Access`;
    return () => { document.title = 'Fueled Access'; };
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

  if (loading) return <div className="container mx-auto p-6">Loading…</div>;
  if (error || !project) return <div className="container mx-auto p-6 text-destructive">{error ?? 'Project not found'}</div>;

  return (
    <div className="container mx-auto p-6">
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-link mb-6">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-2xl font-bold h-auto py-1 max-w-md"
                autoFocus
              />
              <button type="button" onClick={saveName} aria-label="Save name" className="p-1.5 rounded hover:bg-muted transition-colors">
                <Check className="h-4 w-4 text-primary" />
              </button>
              <button type="button" onClick={() => setEditingName(false)} aria-label="Cancel" className="p-1.5 rounded hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <button
                type="button"
                onClick={() => { setEditName(project.name); setEditingName(true); }}
                aria-label="Edit project name"
                className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}

          {editingDescription ? (
            <div className="flex items-center gap-2 mt-1">
              <Input
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') setEditingDescription(false); }}
                className="max-w-md"
                autoFocus
              />
              <button type="button" onClick={saveDescription} aria-label="Save description" className="p-1.5 rounded hover:bg-muted transition-colors">
                <Check className="h-4 w-4 text-primary" />
              </button>
              <button type="button" onClick={() => setEditingDescription(false)} aria-label="Cancel" className="p-1.5 rounded hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1 group">
              <p className="text-sm text-muted-foreground">
                {project.description || <span className="italic">No description</span>}
              </p>
              <button
                type="button"
                onClick={() => { setEditDescription(project.description ?? ''); setEditingDescription(true); }}
                aria-label="Edit description"
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            Created {new Date(project.createdAt).toLocaleDateString()} · {project.reports.length} {project.reports.length === 1 ? 'report' : 'reports'}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={deleteProject}
          className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Delete Project
        </Button>
      </div>

      {/* Reports list */}
      {project.reports.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No reports in this project yet.</p>
          <p className="text-sm mt-1">
            <button
              type="button"
              onClick={() => navigate('/', { state: { newScan: true, projectId: project.id } })}
              className="text-link hover:underline"
            >
              Start a new scan
            </button>
            {' '}and assign it to this project.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {project.reports.map(report => (
            <div key={report.id} className="rounded-xl border border-border bg-card shadow-sm p-5">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{report.pageTitle || report.sitemap}</p>
                  {report.pageTitle && report.sitemap.startsWith('http') && (
                    <ExternalLink href={report.sitemap} className="text-sm text-muted-foreground break-all">
                      {report.sitemap}
                    </ExternalLink>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {report.auditType && (
                      <span className="inline-block text-xs font-medium rounded-full px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700">
                        {AUDIT_TYPE_LABELS[report.auditType] ?? report.auditType}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.startTime).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-6 mt-3 text-sm">
                    <span><strong>{report.summary.totalPages}</strong> <span className="text-muted-foreground">pages</span></span>
                    <span><strong className="text-red-400">{report.summary.totalViolations}</strong> <span className="text-muted-foreground">violations</span></span>
                    <span><strong>{report.summary.violationsByImpact?.critical ?? 0}</strong> <span className="text-muted-foreground">critical</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/reports/${report.id}`}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                  >
                    View Report
                  </Link>
                  <button
                    type="button"
                    onClick={() => setExportReport(report)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/20 hover:border-primary"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveConfirmReport(report)}
                    aria-label={`Remove ${report.pageTitle || report.sitemap} from this project`}
                    className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove from project"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmReport(report)}
                    aria-label={`Delete report ${report.pageTitle || report.sitemap}`}
                    className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete report"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ExportModal report={exportReport} onClose={() => setExportReport(null)} />

      <Dialog open={!!deleteConfirmReport} onOpenChange={open => { if (!open) setDeleteConfirmReport(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete report</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteConfirmReport?.pageTitle || deleteConfirmReport?.sitemap}</strong> and all its data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmReport(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmReport && deleteReport(deleteConfirmReport.id)}
            >
              Delete report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeConfirmReport} onOpenChange={open => { if (!open) setRemoveConfirmReport(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from project</DialogTitle>
            <DialogDescription>
              This will remove <strong>{removeConfirmReport?.pageTitle || removeConfirmReport?.sitemap}</strong> from this project. The report itself will not be deleted and can still be found in your dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirmReport(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => removeConfirmReport && removeFromProject(removeConfirmReport.id)}
            >
              Remove from project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
