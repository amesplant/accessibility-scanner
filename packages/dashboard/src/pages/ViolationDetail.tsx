import { useLocation, useNavigate } from 'react-router-dom';
import { AxeViolation } from '@accessibility-scanner/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ExternalLink';

interface LocationState {
  violation: AxeViolation;
  urls?: string[];
  reportId?: string;
}

export function ViolationDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  if (!state || !state.violation) {
    // no data passed; go back
    navigate(-1);
    return null;
  }

  const { violation, urls = [] } = state;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">{violation.help}</h1>
        <Button variant="default" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <div className="mb-2">
        <span className="font-medium">URLs:</span>
        <ul className="list-disc ml-6">
          {urls.map((u) => (
            <li key={u}>
              <ExternalLink href={u} className="text-base">{u}</ExternalLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Description</h2>
          <p className="text-base">{violation.description}</p>
        </div>

        <div>
          <h2 className="font-semibold">Impact</h2>
          <Badge
            variant={
              ({ critical: 'destructive', serious: 'destructive', moderate: 'secondary', minor: 'outline' } as const)[
                violation.impact
              ]
            }
          >
            {violation.impact}
          </Badge>
        </div>

        <div>
          <h2 className="font-semibold">WCAG Level</h2>
          <p>{violation.level === 'best-practice' || !violation.level ? 'Best Practice' : `WCAG ${violation.level}`}</p>
        </div>

        <div>
          <h2 className="font-semibold">Tags</h2>
          <div className="flex flex-wrap gap-1">
            {violation.tags.map((tag) => (
              <Badge key={tag} variant="default">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold">Examples</h2>
          {violation.nodes.map((node, i) => (
            <div key={i} className="space-y-2">
              <h3 className="font-medium">Example {i + 1}</h3>
              <pre className="p-2 rounded text-xs overflow-x-auto">
                <code>{node.html}</code>
              </pre>
              <p className="text-base">
                Target: {node.target.join(' > ')}
              </p>
              <p className="text-base">{node.failureSummary}</p>
            </div>
          ))}
        </div>

        <div>
          <h2 className="font-semibold">Help URL</h2>
          <ExternalLink href={violation.helpUrl} className="text-base">
            {violation.helpUrl}
          </ExternalLink>
        </div>
      </div>
    </div>
  );
}
