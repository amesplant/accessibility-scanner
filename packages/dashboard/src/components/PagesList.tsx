import { useState, useId, ChangeEvent, FormEvent, Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonVariants, Button } from '@/components/ui/button';
import { ScanResult } from '@accessibility-scanner/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink } from './ExternalLink';

interface PagesListProps {
  results: ScanResult[];
  reportId: string;
}

interface TreeNode {
  segment: string;
  fullUrl: string;
  result: ScanResult | null;
  children: TreeNode[];
  totalViolations: number;
  criticalCount: number;
  seriousCount: number;
}

function buildTree(results: ScanResult[], search: string, filter: string): TreeNode[] {
  type DataNode = { result: ScanResult | null; children: Map<string, DataNode> };
  const dataMap = new Map<string, DataNode>();

  let origin = '';
  for (const result of results) {
    let segments: string[];
    try {
      const u = new URL(result.url);
      origin = u.origin;
      segments = u.pathname.split('/').filter(Boolean);
    } catch {
      continue;
    }

    // Root URL (pathname = "/") has no segments — add it directly as a "/" leaf
    if (segments.length === 0) {
      dataMap.set('/', { result, children: new Map() });
      continue;
    }

    let currentMap = dataMap;
    let i = 0;
    while (i < segments.length) {
      const seg = segments[i];

      // Detect YYYY/MM/DD date prefix — flatten month+day+slug under the year node
      if (
        /^\d{4}$/.test(seg) &&
        i + 2 < segments.length &&
        /^\d{1,2}$/.test(segments[i + 1]) &&
        /^\d{1,2}$/.test(segments[i + 2])
      ) {
        if (!currentMap.has(seg)) {
          currentMap.set(seg, { result: null, children: new Map() });
        }
        const yearNode = currentMap.get(seg)!;
        // Everything after the year collapses into one leaf key, e.g. "10/02/slug"
        const leafKey = segments.slice(i + 1).join('/');
        if (!yearNode.children.has(leafKey)) {
          yearNode.children.set(leafKey, { result: null, children: new Map() });
        }
        yearNode.children.get(leafKey)!.result = result;
        break;
      }

      // Normal single-segment processing
      if (!currentMap.has(seg)) {
        currentMap.set(seg, { result: null, children: new Map() });
      }
      const node = currentMap.get(seg)!;
      if (i === segments.length - 1) node.result = result;
      currentMap = node.children;
      i++;
    }
  }

  function matchesFilter(result: ScanResult | null): boolean {
    if (!result) return false;
    if (search && !result.url.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'with-violations' && result.violations.length === 0) return false;
    if (filter === 'clean' && result.violations.length > 0) return false;
    if (filter === 'audited' && !result.manualAudit?.completed) return false;
    if (filter === 'not-audited' && result.manualAudit?.completed) return false;
    return true;
  }

  function toNodes(map: Map<string, DataNode>, basePath: string): TreeNode[] {
    const nodes: TreeNode[] = [];

    for (const [segment, data] of map.entries()) {
      const path = `${basePath}/${segment}`;
      const children = toNodes(data.children, path);
      const selfMatches = matchesFilter(data.result);
      const hasMatchingDescendants = children.length > 0;

      if (!selfMatches && !hasMatchingDescendants && (search || filter !== 'all')) continue;

      const ownViolations = data.result?.violations.length ?? 0;
      const ownCritical = data.result?.violations.filter(v => v.impact === 'critical').length ?? 0;
      const ownSerious  = data.result?.violations.filter(v => v.impact === 'serious').length ?? 0;

      nodes.push({
        segment,
        fullUrl: data.result?.url ?? `${origin}${path}`,
        result: data.result,
        children,
        totalViolations: ownViolations + children.reduce((s, c) => s + c.totalViolations, 0),
        criticalCount:   ownCritical  + children.reduce((s, c) => s + c.criticalCount, 0),
        seriousCount:    ownSerious   + children.reduce((s, c) => s + c.seriousCount, 0),
      });
    }

    return nodes.sort((a, b) => {
      // Nodes with children (sub-paths) before leaf pages, then alphabetically
      const aHasChildren = a.children.length > 0 ? 0 : 1;
      const bHasChildren = b.children.length > 0 ? 0 : 1;
      if (aHasChildren !== bHasChildren) return aHasChildren - bHasChildren;
      return a.segment.localeCompare(b.segment);
    });
  }

  return toNodes(dataMap, '');
}

function TreeRow({
  node,
  reportId,
  depth,
  initialExpanded = false,
}: {
  node: TreeNode;
  reportId: string;
  depth: number;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const hasChildren = node.children.length > 0;
  const isPathOnly = node.result === null;
  const indent = depth * 1.25 + 0.75;

  return (
    <Fragment>
      <TableRow className={isPathOnly ? 'bg-muted/20' : undefined}>
        <TableCell style={{ paddingLeft: `${indent}rem` }} className="max-w-md">
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                aria-expanded={expanded}
                aria-label={expanded ? `Collapse children of ${node.segment}` : `Expand children of ${node.segment}`}
                className="shrink-0 rounded p-0.5 hover:bg-muted"
              >
                <ChevronRight
                  className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150"
                  style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="w-5 shrink-0" aria-hidden="true" />
            )}
            {isPathOnly ? (
              <span className="text-sm text-muted-foreground font-mono">{node.segment}/</span>
            ) : (
              <ExternalLink href={node.fullUrl} className="break-all text-sm">
                {node.segment}
              </ExternalLink>
            )}
          </div>
        </TableCell>
        <TableCell>
          {isPathOnly ? (
            <Badge variant="outline" className="text-muted-foreground">{node.totalViolations}</Badge>
          ) : (
            <Badge variant={node.result!.violations.length > 0 ? 'destructive' : 'secondary'}>
              {node.result!.violations.length}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          {node.criticalCount > 0 && <Badge variant="destructive">{node.criticalCount}</Badge>}
        </TableCell>
        <TableCell>
          {node.seriousCount > 0 && <Badge variant="destructive">{node.seriousCount}</Badge>}
        </TableCell>
        <TableCell>
          {!isPathOnly && (
            <div className="flex flex-wrap gap-1">
              {node.result!.violations.length === 0
                ? <Badge variant="secondary">Clean</Badge>
                : <Badge variant="destructive">Issues Found</Badge>}
              {node.result!.manualAudit?.completed && (
                <Badge variant="outline" className="border-green-600/50 text-green-700 dark:text-green-400">
                  Audited
                </Badge>
              )}
            </div>
          )}
        </TableCell>
        <TableCell>
          {!isPathOnly && (
            <Link
              to={`/reports/${reportId}/page/${node.result!.id}`}
              className={buttonVariants({ variant: 'default', size: 'sm' })}
              aria-label={`View details for page: ${node.fullUrl}`}
            >
              Details
            </Link>
          )}
        </TableCell>
      </TableRow>
      {expanded && hasChildren && (
        <TreeRows
          nodes={node.children}
          reportId={reportId}
          depth={depth + 1}
          initialExpanded={false}
        />
      )}
    </Fragment>
  );
}

const PAGE_SIZE = 5;

function TreeRows({
  nodes,
  reportId,
  depth = 0,
  initialExpanded = false,
}: {
  nodes: TreeNode[];
  reportId: string;
  depth?: number;
  initialExpanded?: boolean;
}) {
  const [showCount, setShowCount] = useState(PAGE_SIZE);

  // Folders (path-only with children) are always shown in full so the user
  // can see the full site structure. Pages (leaf nodes with results) are
  // paginated since there can be many.
  const folders = nodes.filter(n => n.result === null && n.children.length > 0);
  const pages   = nodes.filter(n => !(n.result === null && n.children.length > 0));

  const visiblePages = pages.length > PAGE_SIZE ? pages.slice(0, showCount) : pages;
  const remaining    = pages.length > PAGE_SIZE ? pages.length - showCount : 0;
  const indent = depth * 1.25 + 0.75;

  return (
    <Fragment>
      {folders.map(node => (
        <TreeRow
          key={node.fullUrl}
          node={node}
          reportId={reportId}
          depth={depth}
          initialExpanded={initialExpanded}
        />
      ))}
      {visiblePages.map(node => (
        <TreeRow
          key={node.fullUrl}
          node={node}
          reportId={reportId}
          depth={depth}
          initialExpanded={initialExpanded}
        />
      ))}
      {remaining > 0 && (
        <TableRow>
          <TableCell colSpan={6} style={{ paddingLeft: `${indent}rem` }} className="py-1">
            <button
              type="button"
              onClick={() => setShowCount(c => c + PAGE_SIZE)}
              className="text-sm text-primary underline-offset-4 hover:underline rounded"
            >
              Show {Math.min(remaining, PAGE_SIZE)} more
              <span className="text-muted-foreground ml-1">({remaining} remaining)</span>
            </button>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

export function PagesList({ results, reportId }: PagesListProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'with-violations' | 'clean' | 'audited' | 'not-audited'>('with-violations');
  const searchId = useId();
  const filterId = useId();

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const tree = buildTree(results, search, filter);
  // Skip all intermediate single-branch path-only nodes (no result, one child)
  // so the display starts at the actual crawl root rather than ancestor paths.
  function skipIntermediateNodes(nodes: TreeNode[]): TreeNode[] {
    if (nodes.length === 1 && nodes[0].result === null) {
      return skipIntermediateNodes(nodes[0].children);
    }
    return nodes;
  }
  const displayNodes = skipIntermediateNodes(tree);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <form onSubmit={handleSearchSubmit} role="search" className="flex flex-col gap-1 flex-1 min-w-64">
          <Label htmlFor={searchId}>Search URLs</Label>
          <div className="flex gap-2">
            <Input
              id={searchId}
              value={searchInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
              type="search"
            />
            <Button type="submit">Search</Button>
          </div>
        </form>
        <div className="flex flex-col gap-1">
          <Label htmlFor={filterId}>Filter pages</Label>
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger id={filterId} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pages</SelectItem>
              <SelectItem value="with-violations">With Violations</SelectItem>
              <SelectItem value="clean">Clean Pages</SelectItem>
              <SelectItem value="audited">Audited</SelectItem>
              <SelectItem value="not-audited">Not Yet Audited</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table aria-label="Scanned pages with violation counts">
          <TableHeader>
            <TableRow>
              <TableHead>Path</TableHead>
              <TableHead>Violations</TableHead>
              <TableHead>Critical</TableHead>
              <TableHead>Serious</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TreeRows nodes={displayNodes} reportId={reportId} initialExpanded={true} />
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
