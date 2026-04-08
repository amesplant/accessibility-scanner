import { useLocation, useNavigate } from 'react-router-dom';
import { AxeViolation } from '@accessibility-scanner/shared';
import { ExternalLink } from '@/components/ExternalLink';

interface LocationState {
  violation: AxeViolation;
  urls?: string[];
  reportId?: string;
}

const impactBadgeStyle: Record<string, string> = {
  critical: 'bg-error-container text-on-error-container',
  serious:  'bg-error-container/60 text-on-error-container',
  moderate: 'bg-amber-100 text-amber-800',
  minor:    'bg-surface-container-high text-on-surface-variant',
};

export function ViolationDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  if (!state || !state.violation) {
    navigate(-1);
    return null;
  }

  const { violation, urls = [] } = state;
  const impactStyle = impactBadgeStyle[violation.impact] ?? impactBadgeStyle.minor;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">{violation.help}</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/30 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
        >
          Back
        </button>
      </div>

      <div className="space-y-6">
        {/* URLs */}
        {urls.length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">URLs</h2>
            <ul className="space-y-1.5">
              {urls.map((u) => (
                <li key={u}>
                  <ExternalLink href={u} className="text-sm break-all text-on-surface">{u}</ExternalLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Meta */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Impact</h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${impactStyle}`}>
                {violation.impact}
              </span>
            </div>
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">WCAG Level</h2>
              <p className="text-sm font-semibold text-on-surface">
                {violation.level === 'best-practice' || !violation.level ? 'Best Practice' : `WCAG ${violation.level}`}
              </p>
            </div>
            <div className="col-span-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Description</h2>
              <p className="text-sm text-on-surface leading-relaxed">{violation.description}</p>
            </div>
            <div className="col-span-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {violation.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-surface-container-high text-on-surface-variant">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Examples */}
        {violation.nodes.length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_12px_32px_rgba(24,28,32,0.06)]">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-4">Examples</h2>
            <div className="space-y-4">
              {violation.nodes.map((node, i) => (
                <div key={i} className="bg-surface-container-low rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Example {i + 1}</p>
                  <pre className="p-3 rounded-lg text-xs overflow-x-auto bg-surface-container-high font-mono text-on-surface">
                    <code>{node.html}</code>
                  </pre>
                  {node.target.length > 0 && (
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-semibold">Target: </span>
                      <code className="font-mono">{node.target.join(' > ')}</code>
                    </p>
                  )}
                  {node.failureSummary && (
                    <p className="text-xs text-on-surface-variant">{node.failureSummary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help URL */}
        <ExternalLink href={violation.helpUrl} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4">
          Learn more about this rule
        </ExternalLink>
      </div>
    </div>
  );
}
