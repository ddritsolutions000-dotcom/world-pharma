import { Injectable } from '@nestjs/common';

type Labels = Record<string, string>;

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly durations: number[] = [];

  increment(name: string, labels: Labels = {}, by = 1): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  setGauge(name: string, value: number, labels: Labels = {}): void {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
  }

  observeHttp(durationMs: number): void {
    this.durations.push(durationMs);
    if (this.durations.length > 5000) {
      this.durations.shift();
    }
  }

  snapshot(): Record<string, number | string> {
    const out: Record<string, number | string> = {};
    for (const [key, value] of this.counters) {
      out[key] = value;
    }
    for (const [key, value] of this.gauges) {
      out[key] = value;
    }
    if (this.durations.length) {
      const sorted = [...this.durations].sort((a, b) => a - b);
      out['http_request_duration_ms_p95'] = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    }
    return out;
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(this.snapshot())) {
      const safe = key.replace(/[^a-zA-Z0-9_:]/g, '_');
      lines.push(`${safe} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private key(name: string, labels: Labels): string {
    const parts = Object.entries(labels)
      .filter(([k]) => !['userId', 'email', 'phone', 'url', 'documentId'].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return parts ? `${name}{${parts}}` : name;
  }
}
