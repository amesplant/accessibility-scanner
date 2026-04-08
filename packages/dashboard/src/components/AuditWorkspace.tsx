import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AuditWorkspacePanelProps = {
  children: ReactNode;
  className?: string;
};

type AuditWorkspaceHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type AuditWorkspaceSectionHeaderProps = {
  eyebrow: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function AuditWorkspacePanel({ children, className }: AuditWorkspacePanelProps) {
  return (
    <div className={cn('rounded-[28px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur', className)}>
      {children}
    </div>
  );
}

export function AuditWorkspaceHero({ eyebrow, title, description, aside, children, className }: AuditWorkspaceHeroProps) {
  return (
    <div className={cn('flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between', className)}>
      <div className="space-y-2">
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-700/70">{eyebrow}</div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">{title}</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        {children}
      </div>
      {aside}
    </div>
  );
}

export function AuditWorkspaceSectionHeader({ eyebrow, description, actions, className }: AuditWorkspaceSectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}