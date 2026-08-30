/** Integer minor-unit helpers. Never use number division for money. */

export function toMinor(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new Error('money_not_integer');
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error('money_not_integer');
  }
  return BigInt(value.trim());
}

export function minorJson(value: bigint): string {
  return value.toString();
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => (typeof current === 'bigint' ? current.toString() : current)),
  ) as T;
}

export function takeAmount(sellMinor: bigint, takeBps: number, takeFlatMinor: bigint): bigint {
  if (takeBps < 0 || takeFlatMinor < 0n || sellMinor < 0n) {
    throw new Error('money_negative');
  }
  return takeFlatMinor + (sellMinor * BigInt(takeBps)) / 10000n;
}
