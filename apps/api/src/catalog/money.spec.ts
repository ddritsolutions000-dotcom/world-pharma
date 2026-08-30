import { takeAmount, toMinor } from './money';

describe('catalog money', () => {
  it('rejects non-integer amounts', () => {
    expect(() => toMinor(1.5)).toThrow();
    expect(() => toMinor('12.0')).toThrow();
  });

  it('computes take with integer basis points', () => {
    expect(takeAmount(10000n, 250, 0n)).toBe(250n);
    expect(takeAmount(10000n, 250, 15n)).toBe(265n);
  });
});
