import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export type BreadcrumbItem = {
  label: string;
  to?: string;
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

export function Breadcrumbs({ items, className = '' }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-on-surface-variant">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="min-w-0">
                {item.to && !isCurrent ? (
                  <Link
                    to={item.to}
                    className="inline-flex max-w-full items-center rounded-lg px-1.5 py-0.5 transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                ) : (
                  <span
                    aria-current={isCurrent ? 'page' : undefined}
                    className={isCurrent ? 'inline-flex max-w-full items-center px-1.5 py-0.5 font-semibold text-on-surface' : 'inline-flex max-w-full items-center px-1.5 py-0.5'}
                  >
                    <span className="truncate">{item.label}</span>
                  </span>
                )}
              </li>
              {!isCurrent && (
                <li className="text-on-surface-variant/50" aria-hidden="true">
                  <Icon name="chevron_right" className="text-[18px]" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}