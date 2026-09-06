'use client';

import { barPercents, sparklinePath, type BarDatum } from './admin-chart-geometry';

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const width = 320;
  const height = 96;
  const path = sparklinePath(values, width, height);
  if (!path.line) {
    return <p className="wp-text-muted">No series yet.</p>;
  }
  return (
    <svg className="wp-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path className="wp-sparkline-fill" d={path.area} />
      <path className="wp-sparkline-line" d={path.line} />
    </svg>
  );
}

export function BarChart({ rows }: { rows: BarDatum[] }) {
  const scaled = barPercents(rows);
  if (!scaled.length) {
    return <p className="wp-text-muted">No bars yet.</p>;
  }
  return (
    <div className="wp-bar-chart">
      {scaled.map((row) => (
        <div key={row.label} className="wp-bar-row">
          <span>{row.label}</span>
          <div className="wp-bar-track">
            <div className="wp-bar-fill" style={{ width: `${row.pct}%` }} />
          </div>
          <span className="wp-bar-value">{row.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
