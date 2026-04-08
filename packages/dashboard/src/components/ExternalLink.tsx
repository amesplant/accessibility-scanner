import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function ExternalLink({ href, children, className }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex max-w-full items-end gap-1 underline hover:text-link', className)}
    >
      <span className="min-w-0">{children}</span>
      <span className="material-symbols-outlined mb-px text-[12px] leading-none select-none" aria-hidden="true">open_in_new</span>
      <span className="sr-only"> (opens in new window)</span>
    </a>
  );
}
