/**
 * API tests must not share Postgres outbox rows or BullMQ keys with a live `nx serve api`.
 * Production claim/concurrency semantics are unchanged.
 */

function rewritePostgres(url) {
  const [base, query] = url.split('?');
  if (base.endsWith('_test')) {
    return url;
  }
  const next = `${base}_test`;
  return query ? `${next}?${query}` : next;
}

function rewriteRedis(url) {
  const cleaned = url.trim().replace(/\r/g, '');
  if (/\/1(\?|$)/.test(cleaned)) {
    return cleaned;
  }
  const hash = cleaned.indexOf('#');
  const withoutHash = hash === -1 ? cleaned : cleaned.slice(0, hash);
  const q = withoutHash.indexOf('?');
  if (q === -1) {
    return `${withoutHash.replace(/\/$/, '')}/1`;
  }
  return `${withoutHash.slice(0, q)}/1${withoutHash.slice(q)}`;
}

function toAdminUrl(testUrl) {
  return testUrl.replace(/_test(\?|$)/, '$1');
}

function testDatabaseName(url) {
  const [base] = url.split('?');
  const parts = base.split('/');
  return parts[parts.length - 1];
}

function applyTestIsolation() {
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.trim();
  }
  if (process.env.REDIS_URL) {
    process.env.REDIS_URL = process.env.REDIS_URL.trim();
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      process.env.CI === 'true'
        ? 'postgresql://worldpharma:worldpharma@127.0.0.1:5432/worldpharma'
        : 'postgresql://worldpharma:worldpharma@127.0.0.1:55432/worldpharma';
  }
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required');
  }
  process.env.DATABASE_URL = rewritePostgres(process.env.DATABASE_URL);
  process.env.REDIS_URL = rewriteRedis(process.env.REDIS_URL);
  process.env.BULLMQ_PREFIX = process.env.BULLMQ_PREFIX ?? 'wp-test';
  process.env.WP_TEST_ISOLATED = '1';
}

module.exports = {
  applyTestIsolation,
  rewritePostgres,
  rewriteRedis,
  toAdminUrl,
  testDatabaseName,
};
