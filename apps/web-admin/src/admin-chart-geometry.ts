export function sparklinePath(values: number[], width = 320, height = 96, pad = 4): { line: string; area: string } {
  const safe = values.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0));
  if (safe.length === 0) {
    return { line: '', area: '' };
  }
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = safe.length === 1 ? 0 : innerW / (safe.length - 1);
  const points = safe.map((value, index) => {
    const x = pad + index * step;
    const y = pad + innerH - ((value - min) / span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(' L ')}`;
  const last = points[points.length - 1];
  const firstX = pad.toFixed(1);
  const baseY = (pad + innerH).toFixed(1);
  const lastX = last?.split(',')[0] ?? firstX;
  return {
    line,
    area: `${line} L ${lastX},${baseY} L ${firstX},${baseY} Z`,
  };
}

export type BarDatum = { label: string; value: number };

export function barPercents(rows: BarDatum[]): Array<BarDatum & { pct: number }> {
  const max = Math.max(0, ...rows.map((row) => (Number.isFinite(row.value) ? row.value : 0)));
  return rows.map((row) => ({
    ...row,
    pct: max <= 0 ? 0 : Math.round((Math.max(0, row.value) / max) * 100),
  }));
}
