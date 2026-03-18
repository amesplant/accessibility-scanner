import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { ScanReport, AxeViolation, ManualCheckResult } from '@accessibility-scanner/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ViolationsTableProps {
  report: ScanReport;
  initialImpactFilter?: string;
}

const IMPACT_LEVELS = ['critical', 'serious', 'moderate', 'minor'] as const;
type Impact = typeof IMPACT_LEVELS[number];

const impactColors = {
  critical: 'destructive',
  serious: 'destructive',
  moderate: 'secondary',
  minor: 'outline',
} as const;

// Derive an impact level from a WCAG conformance level for manual checks
function levelToImpact(level?: string): Impact {
  if (level === 'A')   return 'serious';
  if (level === 'AA')  return 'moderate';
  if (level === 'AAA') return 'minor';
  return 'moderate';
}

interface ManualFailureGroup {
  checkId: string;
  title: string;
  wcagCriterion?: string;
  level?: string;
  impact: Impact;
  pages: { pageId: string; url: string }[];
}

function buildManualFailureGroups(report: ScanReport): ManualFailureGroup[] {
  const map = new Map<string, ManualFailureGroup>();

  for (const result of report.results) {
    const failed = result.manualAudit?.checks.filter((c: ManualCheckResult) => c.status === 'fail') ?? [];
    for (const check of failed) {
      const existing = map.get(check.id);
      if (existing) {
        existing.pages.push({ pageId: result.id, url: result.url });
      } else {
        map.set(check.id, {
          checkId: check.id,
          title: check.title,
          wcagCriterion: check.wcagCriterion,
          level: check.level,
          impact: (check.impact as Impact | undefined) ?? levelToImpact(check.level),
          pages: [{ pageId: result.id, url: result.url }],
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const order: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return order[a.impact] - order[b.impact];
  });
}

type TypeFilter = 'all' | 'automated' | 'manual';

export function ViolationsTable({ report, initialImpactFilter = '' }: ViolationsTableProps) {
  const [impactFilter, setImpactFilter] = useState(initialImpactFilter);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // ── Automated violations ──────────────────────────────────────────────────
  const groupedViolations = report.results
    .flatMap(result => result.violations.filter(v => !v.overrideStatus).map(violation => ({ violation, url: result.url })))
    .reduce((acc, { violation, url }) => {
      if (!acc[violation.id]) acc[violation.id] = { violation, urls: [], count: 0 };
      acc[violation.id].urls.push(url);
      acc[violation.id].count++;
      return acc;
    }, {} as Record<string, { violation: AxeViolation; urls: string[]; count: number }>);

  const sortedViolations = Object.values(groupedViolations).sort((a, b) => {
    const order: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return order[a.violation.impact] - order[b.violation.impact];
  });

  // ── Manual failures ───────────────────────────────────────────────────────
  const manualFailures = buildManualFailureGroups(report);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const showAutomated = typeFilter !== 'manual';
  const showManual    = typeFilter !== 'automated';

  const filteredAutomated = sortedViolations.filter(({ violation }) =>
    showAutomated && (!impactFilter || violation.impact === impactFilter),
  );
  const filteredManual = manualFailures.filter(f =>
    showManual && (!impactFilter || f.impact === impactFilter),
  );

  const totalVisible = filteredAutomated.length + filteredManual.length;
  const totalAll     = sortedViolations.length + manualFailures.length;

  const countByImpact = [
    ...Object.values(groupedViolations).map(({ violation }) => violation.impact),
    ...manualFailures.map(f => f.impact),
  ].reduce((acc, impact) => {
    acc[impact] = (acc[impact] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-4">
      {/* Type + Impact filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={typeFilter === 'all'       ? 'default' : 'outline'} onClick={() => setTypeFilter('all')}>
            All ({totalAll})
          </Button>
          <Button size="sm" variant={typeFilter === 'automated' ? 'default' : 'outline'} onClick={() => setTypeFilter('automated')}>
            Automated ({sortedViolations.length})
          </Button>
          {manualFailures.length > 0 && (
            <Button size="sm" variant={typeFilter === 'manual' ? 'default' : 'outline'} onClick={() => setTypeFilter('manual')}>
              Manual ({manualFailures.length})
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={impactFilter === '' ? 'default' : 'outline'} onClick={() => setImpactFilter('')}>
            Any impact
          </Button>
          {IMPACT_LEVELS.map(level => {
            const count = countByImpact[level] || 0;
            if (count === 0) return null;
            return (
              <Button key={level} size="sm" variant={impactFilter === level ? 'default' : 'outline'} onClick={() => setImpactFilter(impactFilter === level ? '' : level)}>
                {level.charAt(0).toUpperCase() + level.slice(1)} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      <Table aria-label="Accessibility violations grouped by type">
        <TableHeader>
          <TableRow>
            <TableHead>Violation</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Impact</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>WCAG</TableHead>
            <TableHead>Occurrences</TableHead>
            <TableHead>Pages Affected</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Automated rows */}
          {filteredAutomated.map(({ violation, urls, count }) => (
            <TableRow key={`auto-${violation.id}`}>
              <TableCell>
                <div>
                  <p className="font-medium">{violation.help}</p>
                  <p className="text-xs text-muted-foreground">{violation.id}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">Automated</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={impactColors[violation.impact]}>{violation.impact}</Badge>
              </TableCell>
              <TableCell>
                {violation.level || '—'}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {violation.tags.filter(tag => tag.startsWith('wcag')).map(tag => (
                    <Badge key={tag} variant="default" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>{count}</TableCell>
              <TableCell>{new Set(urls).size}</TableCell>
              <TableCell>
                <Link
                  to={`/reports/${report.id}/violation/${violation.id}`}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                  aria-label={`View details for violation: ${violation.help}`}
                >
                  Details
                </Link>
              </TableCell>
            </TableRow>
          ))}

          {/* Manual failure rows */}
          {filteredManual.map(failure => (
            <TableRow key={`manual-${failure.checkId}`}>
              <TableCell>
                <div>
                  <p className="font-medium">{failure.title}</p>
                  {failure.wcagCriterion && (
                    <p className="text-xs text-muted-foreground font-mono">{failure.wcagCriterion}</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/20">Manual</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={impactColors[failure.impact]}>{failure.impact}</Badge>
              </TableCell>
              <TableCell>{failure.level ?? '—'}</TableCell>
              <TableCell>
                {failure.wcagCriterion && (
                  <Badge variant="outline" className="font-mono text-xs">{failure.wcagCriterion}</Badge>
                )}
              </TableCell>
              <TableCell>{failure.pages.length}</TableCell>
              <TableCell>{failure.pages.length}</TableCell>
              <TableCell>
                <Link
                  to={`/reports/${report.id}/page/${failure.pages[0].pageId}`}
                  state={{ tab: 'manual' }}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                  aria-label={`View manual audit for: ${failure.title}`}
                >
                  Details
                </Link>
              </TableCell>
            </TableRow>
          ))}

          {totalVisible === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No violations match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
