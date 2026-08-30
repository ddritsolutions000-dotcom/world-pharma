import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProblemBody } from './problem';
import { redactText } from './redact';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? undefined;
    const correlationId = (request.headers['x-correlation-id'] as string | undefined) ?? requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ProblemBody = {
      type: 'https://worldpharma.example/problems/internal-error',
      title: 'Internal error',
      status,
      detail: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
      instance: request.path,
      request_id: requestId,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload && 'code' in payload) {
        body = {
          ...(payload as ProblemBody),
          status,
          instance: request.path,
          request_id: requestId,
        };
      } else {
        body = {
          ...body,
          status,
          title: exception.message,
          detail: exception.message,
          code: status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR',
        };
      }
    } else if (exception instanceof Error && /entity too large/i.test(exception.message)) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      body = {
        type: 'https://worldpharma.example/problems/payload-too-large',
        title: 'Payload too large',
        status,
        detail: 'Request body is too large.',
        code: 'PAYLOAD_TOO_LARGE',
        instance: request.path,
        request_id: requestId,
      };
    } else {
      const raw = exception instanceof Error ? exception.message : String(exception);
      this.logger.error(
        redactText(
          JSON.stringify({
            msg: 'unhandled_exception',
            request_id: requestId,
            correlation_id: correlationId,
            error: process.env['NODE_ENV'] === 'production' ? 'internal' : raw,
          }),
        ),
      );
    }

    if (looksInternal(body.detail)) {
      body = { ...body, detail: 'An unexpected error occurred.' };
    }

    response.status(status).type('application/problem+json').json(body);
  }
}

function looksInternal(detail: string | undefined): boolean {
  if (!detail) {
    return false;
  }
  return /prisma|redis|econnrefused|password|token|otp|sql/i.test(detail);
}
