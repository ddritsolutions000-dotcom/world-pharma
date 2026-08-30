import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe('PCI boundary', () => {
  it('does not store PAN, CVV, or gateway secret values in payment sources', () => {
    const files = walk(__dirname).filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'));
    const banned = /\b(pan|cvv|card_number|cardNumber|secret_value|sk_live)\b/i;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(banned);
    }
  });
});
