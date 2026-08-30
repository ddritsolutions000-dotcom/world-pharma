import { PaymentIntentStatus } from '@prisma/client';
import {
  assertIntentTransition,
  canTransitionIntent,
  TERMINAL_INTENTS,
} from './state-machine';

describe('payment state machine', () => {
  it('allows CREATED → CAPTURED and UNKNOWN → CAPTURED', () => {
    expect(canTransitionIntent(PaymentIntentStatus.CREATED, PaymentIntentStatus.CAPTURED)).toBe(true);
    expect(canTransitionIntent(PaymentIntentStatus.UNKNOWN, PaymentIntentStatus.CAPTURED)).toBe(true);
    expect(canTransitionIntent(PaymentIntentStatus.UNKNOWN, PaymentIntentStatus.FAILED)).toBe(true);
  });

  it('rejects CAPTURED → AUTHORIZED and other terminal regressions', () => {
    expect(canTransitionIntent(PaymentIntentStatus.CAPTURED, PaymentIntentStatus.AUTHORIZED)).toBe(false);
    expect(canTransitionIntent(PaymentIntentStatus.FAILED, PaymentIntentStatus.CAPTURED)).toBe(false);
    expect(() => assertIntentTransition(PaymentIntentStatus.CAPTURED, PaymentIntentStatus.AUTHORIZED)).toThrow(
      /Illegal payment transition/,
    );
  });

  it('treats same-status transitions as idempotent no-ops', () => {
    for (const status of Object.values(PaymentIntentStatus)) {
      expect(canTransitionIntent(status, status)).toBe(true);
    }
  });

  it('keeps CAPTURED, FAILED, CANCELLED, EXPIRED terminal', () => {
    for (const terminal of TERMINAL_INTENTS) {
      expect(canTransitionIntent(terminal, PaymentIntentStatus.CAPTURED)).toBe(terminal === PaymentIntentStatus.CAPTURED);
      expect(canTransitionIntent(terminal, PaymentIntentStatus.FAILED)).toBe(terminal === PaymentIntentStatus.FAILED);
    }
  });
});
