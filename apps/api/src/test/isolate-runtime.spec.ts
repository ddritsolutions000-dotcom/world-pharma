const {
  rewritePostgres,
  rewriteRedis,
  toAdminUrl,
} = require('./isolate-runtime.cjs') as {
  rewritePostgres: (url: string) => string;
  rewriteRedis: (url: string) => string;
  toAdminUrl: (url: string) => string;
};

describe('test data-plane isolation', () => {
  it('routes Postgres to a sibling _test database', () => {
    expect(
      rewritePostgres('postgresql://worldpharma:worldpharma@127.0.0.1:55432/worldpharma'),
    ).toBe('postgresql://worldpharma:worldpharma@127.0.0.1:55432/worldpharma_test');
    expect(
      rewritePostgres(
        'postgresql://worldpharma:worldpharma@127.0.0.1:55432/worldpharma_test',
      ),
    ).toBe('postgresql://worldpharma:worldpharma@127.0.0.1:55432/worldpharma_test');
  });

  it('routes Redis to logical database 1', () => {
    expect(rewriteRedis('redis://127.0.0.1:56379')).toBe('redis://127.0.0.1:56379/1');
    expect(rewriteRedis('redis://127.0.0.1:56379/1')).toBe('redis://127.0.0.1:56379/1');
    expect(rewriteRedis('redis://127.0.0.1:56379\r')).toBe('redis://127.0.0.1:56379/1');
  });

  it('derives the admin URL from the test database URL', () => {
    expect(toAdminUrl('postgresql://x:y@127.0.0.1:55432/worldpharma_test')).toBe(
      'postgresql://x:y@127.0.0.1:55432/worldpharma',
    );
  });
});
