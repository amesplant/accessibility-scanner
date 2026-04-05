import * as React from "react";

interface LevelChartProps {
  data: Array<{ level: string; count: number }>;
}

const patterns: Record<string, string> = {
  A: "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 4px)",
  AA: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 4px)",
  AAA: "none",
  'best-practice': "none",
};

const colors: Record<string, string> = {
  A: '#2563eb',
  AA: '#059669',
  AAA: '#8b5cf6',
  'best-practice': '#6b7280',
};

export function LevelChart({ data }: LevelChartProps) {
  const sortedData = React.useMemo(() => {
    const order: Record<string, number> = { A: 0, AA: 1, AAA: 2, 'best-practice': 3 };
    return [...data].sort((a, b) => (order[a.level] || 99) - (order[b.level] || 99));
  }, [data]);

  const maxCount = React.useMemo(() => {
    return Math.max(...sortedData.map((d) => d.count), 0);
  }, [sortedData]);

  const total = sortedData.reduce((sum, d) => sum + d.count, 0);

  return (
    <figure role="img" aria-label="Bar chart: violations by WCAG level">
      <figcaption className="sr-only">
        Violations by WCAG level: {sortedData.map(d => `${d.level}: ${d.count}`).join(', ')}
      </figcaption>
      <div className="space-y-2" aria-hidden="true">
        {sortedData.map((d) => {
          const widthPercent = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <div key={d.level} className="flex items-center">
              <span className="w-24 text-base font-medium capitalize">{d.level}</span>
              <div className="flex-1 ml-2 h-6 rounded bg-muted/30">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${widthPercent}%`,
                    background: colors[d.level] || 'gray',
                    backgroundImage: patterns[d.level] || 'none',
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
