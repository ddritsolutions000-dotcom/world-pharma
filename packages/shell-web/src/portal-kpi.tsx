import './portal-shell.css';

export type PortalKpiItem = { label: string; value: number };

export function PortalKpiChart({ items }: { items: PortalKpiItem[] }) {
  if (!items.length) return null;
  const max = Math.max(1, ...items.map((row) => row.value));
  return (
    <div className="wp-kpi-bars" aria-hidden>
      {items.map((row) => (
        <span key={row.label}>
          <i style={{ height: `${Math.max(8, (row.value / max) * 100)}%` }} />
          {row.label}
        </span>
      ))}
    </div>
  );
}

export function PortalKpiCards({ items }: { items: Array<{ label: string; value: number | string }> }) {
  const numeric = items.filter((row): row is PortalKpiItem => typeof row.value === 'number');
  const max = Math.max(1, ...numeric.map((row) => row.value));
  return (
    <>
      <PortalKpiChart items={numeric} />
      <dl className="wp-kpi-grid">
        {items.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
            {typeof row.value === 'number' ? (
              <div className="wp-kpi-meter" aria-hidden>
                <i style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </dl>
    </>
  );
}
