import { barPercents, sparklinePath } from './admin-chart-geometry';

describe('admin-charts', () => {
  it('builds a sparkline path from daily values', () => {
    const path = sparklinePath([0, 10, 5], 100, 50, 0);
    expect(path.line.startsWith('M ')).toBe(true);
    expect(path.area.endsWith('Z')).toBe(true);
  });

  it('scales bars against the max value', () => {
    expect(barPercents([{ label: 'A', value: 50 }, { label: 'B', value: 100 }])).toEqual([
      { label: 'A', value: 50, pct: 50 },
      { label: 'B', value: 100, pct: 100 },
    ]);
  });
});
