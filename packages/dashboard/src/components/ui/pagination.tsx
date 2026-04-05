import { buttonVariants } from './button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function buildPageRange(currentPage: number, totalPages: number, maxButtons = 7): Array<number | 'ellipsis'> {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const range: Array<number | 'ellipsis'> = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) {
    range.push('ellipsis');
  }

  for (let page = left; page <= right; page += 1) {
    range.push(page);
  }

  if (right < totalPages - 1) {
    range.push('ellipsis');
  }

  range.push(totalPages);
  return range;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = buildPageRange(currentPage, totalPages);

  return (
    <nav className="flex flex-wrap items-center gap-2 text-base" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' disabled:cursor-not-allowed disabled:opacity-50'}
      >
        Previous
      </button>

      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">…</span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={
              buttonVariants({ variant: page === currentPage ? 'secondary' : 'outline', size: 'sm' }) +
              (page === currentPage ? ' cursor-default' : '')
            }
            disabled={page === currentPage}
          >
            {page}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' disabled:cursor-not-allowed disabled:opacity-50'}
      >
        Next
      </button>
    </nav>
  );
}
