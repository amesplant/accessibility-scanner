import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
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
import type { ProjectWithCount } from '@/hooks/useProjects';

export function Projects() {
  const { projects, loading, error, createProject, deleteProject, updateProject } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectWithCount | null>(null);

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
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
          New Project
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-3">
          <FolderOpen className="h-12 w-12 opacity-30" aria-hidden="true" />
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm">Create a project to group related scans together.</p>
          <Button variant="outline" onClick={() => setShowCreate(true)} className="mt-2">
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            New Project
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map(project => (
          <div
            key={project.id}
            className="rounded-xl border border-border bg-card shadow-sm flex flex-col"
          >
            <div className="p-5 flex-1">
              <div className="flex items-start justify-between gap-2 mb-1">
                <Link
                  to={`/projects/${project.id}`}
                  className="text-base font-semibold hover:underline leading-snug"
                >
                  {project.name}
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingProject(project)}
                    aria-label={`Edit project ${project.name}`}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(project.id)}
                    aria-label={`Delete project ${project.name}`}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground mb-3">{project.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {project.reportCount} {project.reportCount === 1 ? 'report' : 'reports'}
              </span>
              <Link
                to={`/projects/${project.id}`}
                className="text-sm text-link hover:underline"
              >
                View reports →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Create project dialog */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setShowCreate(false); setNewName(''); setNewDescription(''); setCreateError(null); } }}>
        <DialogContent className="text-foreground">
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
                <Label htmlFor="project-description">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="project-description"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                />
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
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
        <DialogContent className="text-foreground">
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
