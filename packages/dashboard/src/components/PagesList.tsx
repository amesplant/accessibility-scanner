import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExternalLink } from './ExternalLink';
import { useReportPages } from '@/hooks/useReportPages';

interface PagesListProps {
  reportId: string;
}

export function PagesList({ reportId }: PagesListProps) {
  const { pages, total, loading, loadingMore, error, loadMore, hasMore } = useReportPages(reportId);

  if (loading) return <div className="text-sm text-muted-foreground">Loading pages…</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{pages.length} of {total} pages loaded</span>
        {hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="text-link hover:underline disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      <Table aria-label="Accessibility pages">
        <TableHeader>
          <TableRow>
            <TableHead>Page</TableHead>
            <TableHead>Violations</TableHead>
            <TableHead>Manual Audit</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map(page => (
            <TableRow key={page.id}>
              <TableCell>
                <div className="space-y-0.5">
                  <ExternalLink href={page.url} className="break-all text-sm">
                    {page.url}
                  </ExternalLink>
                  <p className="text-xs text-muted-foreground">
                    Scanned {new Date(page.timestamp).toLocaleString()}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={page.violations.length > 0 ? 'destructive' : 'secondary'}>
                  {page.violations.length}
                </Badge>
              </TableCell>
              <TableCell>
                {page.manualAudit?.completed ? (
                  <Badge variant="outline" className="border-green-600/50 text-green-700 dark:text-green-400">
                    Completed
                  </Badge>
                ) : (
                  <Badge variant="secondary">Pending</Badge>
                )}
              </TableCell>
              <TableCell>
                <Link
                  to={`/reports/${reportId}/page/${page.id}`}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                >
                  Details
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}