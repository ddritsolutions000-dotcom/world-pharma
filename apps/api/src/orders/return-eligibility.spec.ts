import { OrderStatus, ReturnReason } from '@prisma/client';
import { assessReturnEligibility, RETURN_WINDOW_HOURS } from './return-eligibility';

describe('return-eligibility', () => {
  const deliveredAt = new Date('2026-09-06T10:00:00.000Z');

  it('allows delivered order within window', () => {
    const result = assessReturnEligibility({
      orderStatus: OrderStatus.DELIVERED,
      history: [{ toStatus: OrderStatus.DELIVERED, createdAt: deliveredAt }],
      hasColdChain: false,
      rxInventoryConsumedAtDispense: false,
      openReturnExists: false,
      now: new Date('2026-09-06T20:00:00.000Z'),
    });
    expect(result.eligible).toBe(true);
    expect(result.window_hours).toBe(RETURN_WINDOW_HOURS);
  });

  it('blocks after window and cold chain', () => {
    const late = assessReturnEligibility({
      orderStatus: OrderStatus.DELIVERED,
      history: [{ toStatus: OrderStatus.DELIVERED, createdAt: deliveredAt }],
      hasColdChain: false,
      rxInventoryConsumedAtDispense: false,
      openReturnExists: false,
      now: new Date('2026-09-10T10:00:00.000Z'),
    });
    expect(late.eligible).toBe(false);
    expect(late.reasons.some((r) => r.includes(`${RETURN_WINDOW_HOURS}`))).toBe(true);

    const cold = assessReturnEligibility({
      orderStatus: OrderStatus.DELIVERED,
      history: [{ toStatus: OrderStatus.DELIVERED, createdAt: deliveredAt }],
      hasColdChain: true,
      rxInventoryConsumedAtDispense: false,
      openReturnExists: false,
      now: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(cold.eligible).toBe(false);
  });

  it('requires note for OTHER_POLICY_ALLOWED', () => {
    const result = assessReturnEligibility({
      orderStatus: OrderStatus.DELIVERED,
      history: [{ toStatus: OrderStatus.DELIVERED, createdAt: deliveredAt }],
      hasColdChain: false,
      rxInventoryConsumedAtDispense: false,
      openReturnExists: false,
      reason: ReturnReason.OTHER_POLICY_ALLOWED,
      note: 'short',
      now: new Date('2026-09-06T12:00:00.000Z'),
    });
    expect(result.eligible).toBe(false);
  });
});
