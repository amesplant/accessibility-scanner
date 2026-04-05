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
import { Pagination } from '@/components/ui/pagination';
import { useReportPages } from '@/hooks/useReportPages';

interface PagesListProps {
  reportId: string;
}

export function PagesList({ reportId }: PagesListProps) {
  const { pages, total, loading, error, page, setPage, totalPages } = useReportPages(reportId);

  if (loading) return <div className="text-sm text-muted-foreground">Loading pages…</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
        <span>Page {page} of {totalPages} — {total} pages</span>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
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