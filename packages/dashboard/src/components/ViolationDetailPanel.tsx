import { AxeViolation } from '@accessibility-scanner/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from './ExternalLink';

interface ViolationDetailPanelProps {
  violation: AxeViolation;
  urls: string[];
  onClose: () => void;
}

const impactColors = {
  critical: 'destructive',
  serious: 'destructive',
  moderate: 'secondary',
  minor: 'outline',
} as const;

export function ViolationDetailPanel({ violation, urls, onClose }: ViolationDetailPanelProps) {
  return (
    <Card className="mt-4 border-l-4 border-l-primary">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardTitle className="text-lg">{violation.help}</CardTitle>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-4 text-base">

        <div className="flex flex-wrap gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Impact</p>
            <Badge variant={impactColors[violation.impact]}>{violation.impact}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">WCAG Level</p>
            <p className="font-medium">{violation.level || 'best-practice'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Rule ID</p>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{violation.id}</code>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Description</p>
          <p>{violation.description}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Tags</p>
          <div className="flex flex-wrap gap-1">
            {violation.tags.map(tag => (
              <Badge key={tag} variant="default" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Affected Pages ({urls.length})
          </p>
          <ul className="space-y-0.5">
            {urls.map(u => (
              <li key={u}>
                <ExternalLink href={u} className="break-all">{u}</ExternalLink>
              </li>
            ))}
          </ul>
        </div>

        {violation.nodes.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Examples ({violation.nodes.length})
            </p>
            <div className="space-y-3">
              {violation.nodes.slice(0, 5).map((node, i) => (
                <div key={i} className="border rounded p-3 space-y-1.5 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Example {i + 1}</p>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
                    <code>{node.html}</code>
                  </pre>
                  {node.target.length > 0 && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Target: </span>
                      {node.target.join(' > ')}
                    </p>
                  )}
                  {node.failureSummary && (
                    <p className="text-xs text-muted-foreground">{node.failureSummary}</p>
                  )}
                </div>
              ))}
              {violation.nodes.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  …and {violation.nodes.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <ExternalLink href={violation.helpUrl} className="text-xs">
            Learn more about this rule
          </ExternalLink>
        </div>

      </CardContent>
    </Card>
  );
}
