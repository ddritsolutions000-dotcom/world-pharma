import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingReq = req.header('x-request-id');
  const incomingCorr = req.header('x-correlation-id');
  const requestId = incomingReq && incomingReq.length <= 128 ? incomingReq : randomUUID();
  const correlationId =
    incomingCorr && incomingCorr.length <= 128 ? incomingCorr : requestId;
  req.headers['x-request-id'] = requestId;
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);
  next();
}
