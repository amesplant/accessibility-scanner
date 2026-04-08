import type { KeyboardEvent, MouseEvent } from 'react';
import type { ProjectWithCount } from '@/hooks/useProjects';

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={['material-symbols-outlined', className].filter(Boolean).join(' ')} aria-hidden="true">
      {name}
    </span>
  );
}

interface ProjectCardProps {
  project: ProjectWithCount;
  onOpen: (projectId: string) => void;
  onEdit: (project: ProjectWithCount) => void;
  onDelete: (projectId: string) => void;
  onArchive?: (projectId: string) => void;
  onRestore?: (projectId: string) => void;
}

export function ProjectCard({ project, onOpen, onEdit, onDelete, onArchive, onRestore }: ProjectCardProps) {
  function handleOpen() {
    onOpen(project.id);
  }

  function handleRestore(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onRestore?.(project.id);
  }

  function handleArchive(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onArchive?.(project.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Open project ${project.name} with ${project.reportCount} report${project.reportCount === 1 ? '' : 's'}`}
      className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.04)] hover:shadow-lg transition-shadow group cursor-pointer flex flex-col gap-4 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0">
          <Icon name="folder_open" className="text-primary" />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {project.archived ? (
            <button
              type="button"
              onClick={handleRestore}
              onKeyDown={(event) => event.stopPropagation()}
              aria-label={`Restore archived project ${project.name}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-secondary-container/50 hover:text-secondary transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              title={`Restore ${project.name}`}
            >
              <Icon name="unarchive" className="text-[14px]" />
              Archived
            </button>
          ) : (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={handleArchive}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={`Archive project ${project.name}`}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-tertiary hover:bg-tertiary-fixed/50 transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="archive" className="text-base" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(project);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={`Edit project ${project.name}`}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="edit" className="text-base" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(project.id);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                aria-label={`Delete project ${project.name}`}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-destructive hover:bg-error-container transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon name="delete" className="text-base" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1">
        <div className="text-base font-bold text-on-surface group-hover:text-primary transition-colors leading-snug">
          {project.name}
        </div>
        {project.description && (
          <p className="text-xs text-on-surface-variant mt-1 leading-relaxed line-clamp-2">{project.description}</p>
        )}
        {project.archivedAt && (
          <p className="mt-2 text-[11px] text-on-surface-variant">
            Archived {new Date(project.archivedAt).toLocaleDateString()}
          </p>
        )}
      </div>

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

      <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-primary bg-surface-container-low group-hover:bg-primary-fixed transition-colors">
        {project.archived ? 'View archive' : 'View reports'}
        <Icon name="arrow_forward" className="text-sm" />
      </div>
    </div>
  );
}