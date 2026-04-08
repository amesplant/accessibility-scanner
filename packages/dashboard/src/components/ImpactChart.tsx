import * as React from "react";

interface ImpactChartProps {
  data: Array<{ impact: string; count: number }>;
}

// Accessible patterns as SVG data URIs to supplement color encoding
const patterns: Record<string, string> = {
  critical: "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 4px)",
  serious: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 4px)",
  moderate: "none",
  minor: "none",
};

const colors: Record<string, string> = {
  critical: '#ba1a1a',
  serious: '#ea580c',
  moderate: '#ca8a04',
  minor: '#70787e',
};

export function ImpactChart({ data }: ImpactChartProps) {
  const sortedData = React.useMemo(() => {
    return [...data].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      return order[a.impact] - order[b.impact];
    });
  }, [data]);

  const maxCount = React.useMemo(() => {
    return Math.max(...sortedData.map((d) => d.count), 0);
  }, [sortedData]);

  const total = sortedData.reduce((sum, d) => sum + d.count, 0);

  return (
    <figure role="img" aria-label="Bar chart: violations by impact level">
      <figcaption className="sr-only">
        Violations by impact: {sortedData.map(d => `${d.impact}: ${d.count}`).join(', ')}
      </figcaption>
      <div className="space-y-2" aria-hidden="true">
        {sortedData.map((d) => {
          const widthPercent = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <div key={d.impact} className="flex items-center">
              <span className="w-24 text-base font-medium capitalize">{d.impact}</span>
              <div className="flex-1 ml-2 h-6 rounded bg-surface-container-high">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${widthPercent}%`,
                    background: colors[d.impact] || 'gray',
                    backgroundImage: patterns[d.impact] || 'none',
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-semibold leading-6">
                {d.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
