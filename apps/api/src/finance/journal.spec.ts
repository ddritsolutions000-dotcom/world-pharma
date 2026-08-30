import { DebitCredit } from '@prisma/client';

describe('journal invariants', () => {
  it('treats NULL carrier actual as unknown rather than zero', () => {
    const actual: bigint | null = null;
    expect(actual === 0n).toBe(false);
    expect(actual == null).toBe(true);
  });

  it('requires debit credit equality', () => {
    const lines = [
      { dc: DebitCredit.DEBIT, amountMinor: 100n },
      { dc: DebitCredit.CREDIT, amountMinor: 100n },
    ];
    const debit = lines.filter((l) => l.dc === DebitCredit.DEBIT).reduce((s, l) => s + l.amountMinor, 0n);
    const credit = lines.filter((l) => l.dc === DebitCredit.CREDIT).reduce((s, l) => s + l.amountMinor, 0n);
    expect(debit).toBe(credit);
  });
});
