import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { useViolationGroups } from '@/hooks/useViolationGroups';

interface ViolationsTableProps {
  reportId: string;
}

const impactColors = {
  critical: 'destructive',
  serious: 'destructive',
  moderate: 'secondary',
  minor: 'outline',
} as const;

export function ViolationsTable({ reportId }: ViolationsTableProps) {
  const { items, total, loading, error, page, setPage, totalPages } = useViolationGroups(reportId);

  if (loading) return <div className="text-base text-muted-foreground">Loading violations…</div>;
  if (error) return <div className="text-base text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-base text-muted-foreground">
        <span>Page {page} of {totalPages} — {total} violation groups</span>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <Table aria-label="Accessibility violations grouped by type">
        <TableHeader>
          <TableRow>
            <TableHead>Violation</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Impact</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Occurrences</TableHead>
            <TableHead>Pages Affected</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => {
            if (item.kind === 'automated') {
              return (
                <TableRow key={`auto-${item.violation.id}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.violation.help}</p>
                      <p className="text-xs text-muted-foreground">{item.violation.id}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">Automated</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={impactColors[item.impact]}>{item.impact}</Badge>
                  </TableCell>
                  <TableCell>{item.violation.level || '—'}</TableCell>
                  <TableCell>{item.count}</TableCell>
                  <TableCell>{item.pageCount}</TableCell>
                  <TableCell>
                    <Link
                      to={`/reports/${reportId}/violation/${item.violation.id}`}
                      className={buttonVariants({ variant: 'default', size: 'sm' })}
                    >
                      Details
                    </Link>
                  </TableCell>
                </TableRow>
              );
            }

            return (
              <TableRow key={`manual-${item.checkId}`}>
                <TableCell>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.wcagCriterion && (
                      <p className="text-xs text-muted-foreground font-mono">{item.wcagCriterion}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/20">Manual</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={impactColors[item.impact]}>{item.impact}</Badge>
                </TableCell>
                <TableCell>{item.level ?? '—'}</TableCell>
                <TableCell>{item.count}</TableCell>
                <TableCell>{item.pageCount}</TableCell>
                <TableCell>
                  <Link
                    to={`/reports/${reportId}/page/${item.firstPageId}`}
                    state={{ tab: 'manual' }}
                    className={buttonVariants({ variant: 'default', size: 'sm' })}
                  >
                    Details
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}