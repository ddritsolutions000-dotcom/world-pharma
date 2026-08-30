import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationStore {
  requestId: string;
  correlationId: string;
  actorId?: string;
}

const als = new AsyncLocalStorage<CorrelationStore>();

export function runWithCorrelation<T>(store: CorrelationStore, fn: () => T): T {
  return als.run(store, fn);
}

export function getCorrelation(): CorrelationStore | undefined {
  return als.getStore();
}

export function correlationId(): string | undefined {
  return als.getStore()?.correlationId;
}

export function newCorrelation(incomingRequestId?: string, incomingCorrelation?: string): CorrelationStore {
  const requestId =
    incomingRequestId && incomingRequestId.length <= 128 ? incomingRequestId : randomUUID();
  const correlationId =
    incomingCorrelation && incomingCorrelation.length <= 128 ? incomingCorrelation : requestId;
  return { requestId, correlationId };
}
