import { useState, useEffect } from 'react';
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
import { useRestoreFocus } from '@/hooks/useRestoreFocus';

interface EditProjectDialogProps {
  open: boolean;
  project: { id: string; name: string; description?: string } | null;
  onClose: () => void;
  onSave: (id: string, name: string, description?: string) => Promise<void>;
}

export function EditProjectDialog({ open, project, onClose, onSave }: EditProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleCloseAutoFocus } = useRestoreFocus(open);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setError(null);
    }
  }, [project]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(project.id, name.trim(), description.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="text-foreground" onCloseAutoFocus={handleCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update the project name or description.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-project-name">Name</Label>
              <Input
                id="edit-project-name"
                value={name}
                onChange={e => setName(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-project-description">
                Description{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="edit-project-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-base text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2 mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
