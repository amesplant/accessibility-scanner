import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EditProjectDialog } from '@/components/EditProjectDialog';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import type { ProjectWithCount } from '@/hooks/useProjects';

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={['material-symbols-outlined', className].filter(Boolean).join(' ')} aria-hidden="true">
      {name}
    </span>
  );
}

export function Projects() {
  const { projects, loading, error, createProject, deleteProject, updateProject } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectWithCount | null>(null);
  const { handleCloseAutoFocus: handleCreateCloseAutoFocus } = useRestoreFocus(showCreate);
  const { handleCloseAutoFocus: handleDeleteCloseAutoFocus } = useRestoreFocus(!!pendingDeleteId);

  useEffect(() => { document.title = 'Seymour — Projects'; }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createProject(newName.trim(), newDescription.trim() || undefined);
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDeleteId) return;
    await deleteProject(pendingDeleteId);
    setPendingDeleteId(null);
  }

  const pendingProject = projects.find(p => p.id === pendingDeleteId);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-on-surface tracking-tight mb-1">Active Engagements</h1>
          <p className="text-on-surface-variant text-sm">
            Manage your accessibility audits and track progress across client engagements.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-container text-white rounded-full px-5 py-2.5 font-semibold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity border-0"
        >
          <Icon name="add" className="text-base" />
          New Project
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-on-surface-variant py-8">
          <Icon name="sync" className="animate-spin" />
          <span>Loading projects…</span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive mb-6">{error}</p>
      )}

      {/* Project grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <div
            key={project.id}
            className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.04)] hover:shadow-lg transition-shadow group flex flex-col gap-4"
          >
            {/* Card header */}
            <div className="flex items-start justify-between gap-2">
              <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0">
                <Icon name="folder_open" className="text-primary" />
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setEditingProject(project)}
                  aria-label={`Edit project ${project.name}`}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon name="edit" className="text-base" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(project.id)}
                  aria-label={`Delete project ${project.name}`}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:text-destructive hover:bg-error-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon name="delete" className="text-base" />
                </button>
              </div>
            </div>

            {/* Card body */}
            <div className="flex-1">
              <Link
                to={`/projects/${project.id}`}
                className="text-base font-bold text-on-surface hover:text-primary transition-colors leading-snug focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
              >
                {project.name}
              </Link>
              {project.description && (
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed line-clamp-2">{project.description}</p>
              )}
            </div>

            {/* Card footer */}
            <div className="flex items-center justify-between pt-2 border-t border-surface-container-high">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Reports</p>
                <p className="text-lg font-bold text-on-surface">{project.reportCount}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Created</p>
                <p className="text-xs text-on-surface-variant">{new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <Link
              to={`/projects/${project.id}`}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-primary bg-surface-container-low hover:bg-primary-fixed transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              View reports
              <Icon name="arrow_forward" className="text-sm" />
            </Link>
          </div>
        ))}

        {/* "Start New Project" empty card */}
        {!loading && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-outline-variant p-8 text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary-fixed/30 transition-all focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center">
              <Icon name="add" className="text-2xl" />
            </span>
            <div className="text-center">
              <p className="text-sm font-semibold">Start New Project</p>
              <p className="text-xs mt-0.5">Add a new client or platform to the dashboard</p>
            </div>
          </button>
        )}
      </div>

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center">
            <Icon name="folder_open" className="text-3xl text-on-surface-variant" />
          </div>
          <div>
            <p className="text-lg font-bold text-on-surface mb-1">No projects yet</p>
            <p className="text-sm text-on-surface-variant">Create a project to group related scans together.</p>
          </div>
        </div>
      )}

      {/* Create project dialog */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setShowCreate(false); setNewName(''); setNewDescription(''); setCreateError(null); } }}>
        <DialogContent className="text-on-surface" onCloseAutoFocus={handleCreateCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Group related scans under a shared project.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-description">Description <span className="text-on-surface-variant font-normal">(optional)</span></Label>
                <Input
                  id="project-description"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                />
              </div>
              {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter className="gap-2 mt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={!newName.trim() || creating}>
                {creating ? 'Creating…' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <EditProjectDialog
        open={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSave={updateProject}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!pendingDeleteId} onOpenChange={open => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent className="text-on-surface" onCloseAutoFocus={handleDeleteCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Delete <strong>{pendingProject?.name}</strong>? Scans in this project will not be deleted — they will just be unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
