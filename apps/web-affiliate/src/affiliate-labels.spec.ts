import { earningStatusLabel, fullShareUrl } from './affiliate-labels';

describe('affiliate labels', () => {
  it('maps earning statuses', () => {
    expect(earningStatusLabel('PENDING')).toMatch(/Pending/i);
  });

  it('builds full customer share urls from configured base', () => {
    expect(
      fullShareUrl('/r/SAVE10?lid=abc', {
        NEXT_PUBLIC_CUSTOMER_URL: 'https://shop.example',
        NEXT_PUBLIC_APP_ENV: 'local',
      }),
    ).toBe('https://shop.example/r/SAVE10?lid=abc');
  });

  it('defaults local share base to customer :3000 not doctor :3002', () => {
    expect(
      fullShareUrl('/r/ABC', {
        NEXT_PUBLIC_APP_ENV: 'development',
      }),
    ).toBe('http://localhost:3000/r/ABC');
  });

  it('does not invent localhost share base in sandbox/production', () => {
    expect(
      fullShareUrl('/r/ABC', {
        NEXT_PUBLIC_APP_ENV: 'sandbox',
      }),
    ).toBe('/r/ABC');
    expect(
      fullShareUrl('/r/ABC', {
        NEXT_PUBLIC_APP_ENV: 'production',
        NEXT_PUBLIC_CUSTOMER_URL: 'http://localhost:3000',
      }),
    ).toBe('/r/ABC');
  });
});
