import { HttpException, HttpStatus } from '@nestjs/common';

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  request_id?: string;
}

export class ProblemException extends HttpException {
  readonly code: string;
  readonly title: string;
  readonly detail: string;

  constructor(status: number, code: string, title: string, detail: string) {
    const body: ProblemBody = {
      type: `https://worldpharma.example/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      detail,
      code,
    };
    super(body, status);
    this.code = code;
    this.title = title;
    this.detail = detail;
  }
}

export const Errors = {
  validation: (detail: string) =>
    new ProblemException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid request', detail),
  unauthorized: (detail = 'Authentication is required.') =>
    new ProblemException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Unauthorized', detail),
  forbidden: (detail = 'You cannot perform this action.') =>
    new ProblemException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Forbidden', detail),
  otpInvalid: () =>
    new ProblemException(HttpStatus.UNAUTHORIZED, 'OTP_INVALID', 'Verification failed', 'Verification failed.'),
  otpExpired: () =>
    new ProblemException(HttpStatus.UNAUTHORIZED, 'OTP_EXPIRED', 'Verification failed', 'Verification failed.'),
  otpLocked: () =>
    new ProblemException(
      HttpStatus.TOO_MANY_REQUESTS,
      'OTP_LOCKED',
      'Too many attempts',
      'Please request a new code later.',
    ),
  rateLimited: (retryAfterSeconds: number) =>
    new ProblemException(
      HttpStatus.TOO_MANY_REQUESTS,
      'OTP_RATE_LIMITED',
      'Too many requests',
      `Retry after ${retryAfterSeconds} seconds.`,
    ),
  accountDenied: () =>
    new ProblemException(HttpStatus.FORBIDDEN, 'AUTH_DENIED', 'Sign-in unavailable', 'Sign-in is unavailable.'),
  refreshInvalid: () =>
    new ProblemException(HttpStatus.UNAUTHORIZED, 'REFRESH_INVALID', 'Session expired', 'Please sign in again.'),
  notFound: (detail = 'Not found.') =>
    new ProblemException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found', detail),
  serviceDisabled: (detail = 'This service is not available in this country.') =>
    new ProblemException(HttpStatus.FORBIDDEN, 'SERVICE_DISABLED', 'Service disabled', detail),
  conflict: (detail = 'The resource already exists.') =>
    new ProblemException(HttpStatus.CONFLICT, 'CONFLICT', 'Conflict', detail),
  problem: (status: number, code: string, title: string, detail: string) =>
    new ProblemException(status, code, title, detail),
};
