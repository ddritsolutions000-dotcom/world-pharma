import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { correlationId, getCorrelation, newCorrelation, runWithCorrelation } from './correlation';
import { MetricsService } from './metrics.service';
import { redactText } from './redact';

@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const incomingReq = req.header('x-request-id') ?? req.header('x-correlation-id');
    const incomingCorr = req.header('x-correlation-id');
    const store = newCorrelation(incomingReq, incomingCorr);
    req.headers['x-request-id'] = store.requestId;
    req.headers['x-correlation-id'] = store.correlationId;
    res.setHeader('x-request-id', store.requestId);
    res.setHeader('x-correlation-id', store.correlationId);
    const started = Date.now();
    const method = req.method;
    const route = req.route?.path ?? req.path;

    return new Observable((subscriber) => {
      runWithCorrelation(store, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    }).pipe(
      tap({
        next: () => this.finish(method, route, res.statusCode || 200, started),
        error: () => this.finish(method, route, res.statusCode || 500, started),
      }),
    );
  }

  private finish(method: string, route: string, status: number, started: number): void {
    const duration = Date.now() - started;
    this.metrics.observeHttp(duration);
    this.metrics.increment('http_requests_total', { method, status: String(status) });
    if (status >= 400) {
      this.metrics.increment('http_errors_total', { status: String(status) });
    }
    this.logger.log(
      redactText(
        JSON.stringify({
          msg: 'http_request',
          method,
          route,
          status,
          duration_ms: duration,
          request_id: getCorrelation()?.requestId,
          correlation_id: correlationId(),
        }),
      ),
    );
  }
}
