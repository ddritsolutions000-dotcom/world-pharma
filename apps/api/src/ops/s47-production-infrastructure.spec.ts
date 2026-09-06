import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateProductionConfigInventory, listOperationalSignals } from './production-config';
import { redactRecord, redactSecretValue, isSensitiveConfigKey, assertNoSecretLeak } from './secret-redaction';
import { evaluateProductionStorageAvailable, assertProductionStorageAvailable } from './production-storage-gate';
import { evaluateProductionFileScanningAvailable, assertProductionFileScanningAvailable } from './production-file-scanning-gate';
import { evaluateProductionInfrastructureAvailable, assertProductionInfrastructureAvailable } from './production-infrastructure-gate';
import { listBackupCatalog, verifyBackupMetadata } from './backup-catalog';
import {
  AllowAllMalwareScanner,
  DeterministicSandboxMalwareScanner,
  GatedMalwareScanner,
  GatedPrivateObjectStore,
  LocalPrivateObjectStore,
  assertValidPrivateUpload,
} from '../partner/object-store';

const SNAP: Record<string, string | undefined> = {};

function snap(keys: string[]) {
  for (const key of keys) {
    SNAP[key] = process.env[key];
  }
}

function restore(keys: string[]) {
  for (const key of keys) {
    const prev = SNAP[key];
    if (prev === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev;
    }
  }
}

const ENV_KEYS = [
  'INFRASTRUCTURE_ENVIRONMENT',
  'OBJECT_STORAGE_ENVIRONMENT',
  'OBJECT_STORAGE_LIVE_ENABLED',
  'OBJECT_STORAGE_BACKEND',
  'OBJECT_STORAGE_BUCKET_REF',
  'OBJECT_STORAGE_SECRET_REF',
  'FILE_SCANNING_ENVIRONMENT',
  'FILE_SCANNING_LIVE_ENABLED',
  'MALWARE_SCANNER',
  'MALWARE_SCANNER_PROVIDER',
  'MALWARE_SCANNER_ENDPOINT_REF',
  'MALWARE_SCANNER_SECRET_REF',
  'SECRET_MANAGER_REF',
  'KMS_KEY_REF',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'OTP_PEPPER',
  'METRICS_TOKEN',
  'AUTH_DEV_REVEAL_OTP',
  'BACKUP_DIR',
  'FILE_SCANNER_FORCE_FAIL',
];

describe('Sprint 47 production config', () => {
  beforeEach(() => snap(ENV_KEYS));
  afterEach(() => restore(ENV_KEYS));

  it('marks sandbox object storage CONFIGURED without requiring S3', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'sandbox';
    process.env['OBJECT_STORAGE_ENVIRONMENT'] = 'sandbox';
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://worldpharma:worldpharma@127.0.0.1:5432/worldpharma';
    process.env['REDIS_URL'] = 'redis://127.0.0.1:56379';
    const inv = evaluateProductionConfigInventory();
    expect(inv.items.find((i) => i.name === 'object_storage')?.status).toBe('CONFIGURED');
    expect(inv.never_expose_secrets).toBe(true);
  });

  it('does not return secret values in inventory details', () => {
    process.env['DATABASE_URL'] = 'postgresql://user:super-secret-pass@db.internal:5432/wp';
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['REDIS_URL'] = 'redis://:hunter2@127.0.0.1:6379';
    const inv = evaluateProductionConfigInventory();
    const blob = JSON.stringify(inv);
    expect(blob).not.toContain('super-secret-pass');
    expect(blob).not.toContain('hunter2');
    expect(assertNoSecretLeak(blob)).toBe(true);
  });

  it('marks missing JWT as MISSING', () => {
    delete process.env['JWT_ACCESS_SECRET'];
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://x@127.0.0.1/db';
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    const inv = evaluateProductionConfigInventory();
    expect(inv.items.find((i) => i.name === 'jwt_access_secret')?.status).toBe('MISSING');
    expect(inv.items.find((i) => i.name === 'jwt_access_secret')?.secret_present).toBe('MISSING');
    expect(inv.overall).toBe('BLOCKED');
  });

  it('marks short JWT as INVALID', () => {
    process.env['JWT_ACCESS_SECRET'] = 'short';
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://x@127.0.0.1/db';
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    expect(evaluateProductionConfigInventory().items.find((i) => i.name === 'jwt_access_secret')?.status).toBe(
      'INVALID',
    );
  });

  it('marks kms as EXTERNAL_GATED without faking a manager', () => {
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://x@127.0.0.1/db';
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    expect(evaluateProductionConfigInventory().items.find((i) => i.name === 'kms_secrets')?.status).toBe(
      'EXTERNAL_GATED',
    );
  });

  it('invalidates loopback DATABASE_URL only in production infrastructure env', () => {
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    process.env['DATABASE_URL'] = 'postgresql://worldpharma:worldpharma@127.0.0.1:5432/worldpharma';
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'sandbox';
    expect(evaluateProductionConfigInventory().items.find((i) => i.name === 'database')?.status).toBe('CONFIGURED');
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    expect(evaluateProductionConfigInventory().items.find((i) => i.name === 'database')?.status).toBe('INVALID');
  });

  it('treats AUTH_DEV_REVEAL_OTP as INVALID in production infrastructure env', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://user:x@prod-db:5432/wp';
    process.env['REDIS_URL'] = 'redis://redis.internal';
    expect(evaluateProductionConfigInventory().items.find((i) => i.name === 'auth_dev_reveal_otp')?.status).toBe(
      'INVALID',
    );
  });

  it('marks malware scanner EXTERNAL_GATED', () => {
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://x@127.0.0.1/db';
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    expect(evaluateProductionConfigInventory().items.find((i) => i.name === 'malware_scanner')?.status).toBe(
      'EXTERNAL_GATED',
    );
  });

  it('lists operational signals without claiming pager integration', () => {
    const signals = listOperationalSignals();
    expect(signals.length).toBeGreaterThanOrEqual(12);
    expect(signals.find((s) => s.code === 'DLQ_GROWTH')?.monitoring_integration).toBe('SOFTWARE_READY');
    expect(signals.find((s) => s.code === 'DATABASE_UNAVAILABLE')?.monitoring_integration).toBe('EXTERNAL_GATED');
  });
});

describe('Sprint 47 secret redaction', () => {
  it('detects sensitive keys', () => {
    expect(isSensitiveConfigKey('JWT_ACCESS_SECRET')).toBe(true);
    expect(isSensitiveConfigKey('otp_pepper')).toBe(true);
    expect(isSensitiveConfigKey('country_code')).toBe(false);
  });

  it('redacts SET vs MISSING without values', () => {
    expect(redactSecretValue('abc')).toBe('SET');
    expect(redactSecretValue('')).toBe('MISSING');
  });

  it('redacts nested records', () => {
    const out = redactRecord({ JWT_ACCESS_SECRET: 'leak-me', nested: { redis_url: 'redis://x' }, ok: 1 });
    expect(out['JWT_ACCESS_SECRET']).toBe('[redacted]');
    expect((out['nested'] as Record<string, unknown>)['redis_url']).toBe('[redacted]');
    expect(out['ok']).toBe(1);
  });

  it('assertNoSecretLeak rejects postgres URIs with credentials', () => {
    expect(assertNoSecretLeak('postgresql://u:p@host/db')).toBe(false);
    expect(assertNoSecretLeak('status=ready')).toBe(true);
  });
});

describe('Sprint 47 storage gate', () => {
  beforeEach(() => snap(ENV_KEYS));
  afterEach(() => restore(ENV_KEYS));

  it('never reports available without a production adapter', () => {
    process.env['OBJECT_STORAGE_ENVIRONMENT'] = 'production';
    process.env['OBJECT_STORAGE_LIVE_ENABLED'] = 'true';
    process.env['OBJECT_STORAGE_BACKEND'] = 'S3';
    process.env['OBJECT_STORAGE_BUCKET_REF'] = 'vault:bucket';
    process.env['OBJECT_STORAGE_SECRET_REF'] = 'vault:secret';
    const result = evaluateProductionStorageAvailable();
    expect(result.available).toBe(false);
    expect(result.never_fallback_to_local_disk).toBe(true);
    expect(result.blockers).toContain('NO_PRODUCTION_STORAGE_ADAPTER');
  });

  it('forbids local disk when production flags are set', () => {
    process.env['OBJECT_STORAGE_ENVIRONMENT'] = 'production';
    process.env['OBJECT_STORAGE_LIVE_ENABLED'] = 'true';
    process.env['OBJECT_STORAGE_BACKEND'] = 'LOCAL';
    expect(evaluateProductionStorageAvailable().blockers).toContain('LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN');
  });

  it('assertProductionStorageAvailable throws', () => {
    expect(() => assertProductionStorageAvailable()).toThrow();
  });
});

describe('Sprint 47 file scanning gate', () => {
  beforeEach(() => snap(ENV_KEYS));
  afterEach(() => restore(ENV_KEYS));

  it('never treats noop as production scanning', () => {
    process.env['FILE_SCANNING_ENVIRONMENT'] = 'production';
    process.env['FILE_SCANNING_LIVE_ENABLED'] = 'true';
    process.env['MALWARE_SCANNER_PROVIDER'] = 'ALLOW_ALL';
    process.env['MALWARE_SCANNER_ENDPOINT_REF'] = 'https://scanner.example';
    const result = evaluateProductionFileScanningAvailable();
    expect(result.available).toBe(false);
    expect(result.never_trust_unscanned).toBe(true);
    expect(result.blockers).toContain('NO_PRODUCTION_SCANNER_ADAPTER');
    expect(result.blockers).toContain('MOCK_SCANNER_PRODUCTION_FORBIDDEN');
  });

  it('assertProductionFileScanningAvailable throws', () => {
    expect(() => assertProductionFileScanningAvailable()).toThrow();
  });
});

describe('Sprint 47 infrastructure gate', () => {
  beforeEach(() => snap(ENV_KEYS));
  afterEach(() => restore(ENV_KEYS));

  it('does not claim READY merely because the app compiled', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'sandbox';
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://x@127.0.0.1/db';
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    const infra = evaluateProductionInfrastructureAvailable();
    expect(infra.status).not.toBe('READY');
    expect(infra.storage).toBe('EXTERNAL_GATED');
    expect(infra.malware_scanning).toBe('EXTERNAL_GATED');
    expect(infra.pitr).toBe('EXTERNAL_GATED');
    expect(infra.rpo).toBe('TARGET_DEFINED');
    expect(infra.rto).toBe('TARGET_DEFINED');
    expect(infra.rpo_target).toBe('15m');
    expect(infra.rto_target).toBe('4h');
    expect(infra.recovery_infrastructure_status).toBe('RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED');
  });

  it('blocks production infrastructure env with invalid loopback database', () => {
    process.env['INFRASTRUCTURE_ENVIRONMENT'] = 'production';
    process.env['JWT_ACCESS_SECRET'] = 'x'.repeat(32);
    process.env['OTP_PEPPER'] = 'y'.repeat(32);
    process.env['DATABASE_URL'] = 'postgresql://x@127.0.0.1/db';
    process.env['REDIS_URL'] = 'redis://127.0.0.1';
    expect(evaluateProductionInfrastructureAvailable().status).toBe('BLOCKED');
  });

  it('assertProductionInfrastructureAvailable throws until adapters exist', () => {
    expect(() => assertProductionInfrastructureAvailable()).toThrow();
  });
});

describe('Sprint 47 private object store', () => {
  let root: string;
  let store: LocalPrivateObjectStore;

  beforeEach(() => {
    root = join(tmpdir(), `wp-obj-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    store = new LocalPrivateObjectStore(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('stores private objects with content-type metadata', async () => {
    const put = await store.put({
      bytes: Buffer.from('rx-bytes'),
      contentType: 'application/pdf',
      prefix: 'health-uploads/person-a',
    });
    const got = await store.get(put.key);
    expect(got.contentType).toBe('application/pdf');
    expect(got.bytes.toString()).toBe('rx-bytes');
    const st = await store.stat(put.key);
    expect(st?.byteSize).toBe(8);
  });

  it('rejects path traversal on get', async () => {
    await expect(store.get('../secret')).rejects.toThrow('invalid_object_key');
  });

  it('rejects path traversal on put prefix', async () => {
    await expect(
      store.put({ bytes: Buffer.from('x'), contentType: 'text/plain', prefix: '../escape' }),
    ).rejects.toThrow('invalid_object_key');
  });

  it('returns object_not_found without filesystem paths', async () => {
    await expect(store.get('missing/key')).rejects.toThrow('object_not_found');
  });

  it('deletes objects', async () => {
    const put = await store.put({ bytes: Buffer.from('x'), contentType: 'text/plain', prefix: 't' });
    await store.delete(put.key);
    expect(await store.stat(put.key)).toBeNull();
  });

  it('expired tickets do not resolve', async () => {
    const put = await store.put({ bytes: Buffer.from('x'), contentType: 'text/plain', prefix: 't' });
    const signed = await store.signAccess(put.key, -1);
    expect(store.resolveTicket(signed.ticket)).toBeNull();
  });

  it('does not expose one tenant object via another prefix guess', async () => {
    const a = await store.put({ bytes: Buffer.from('phi-a'), contentType: 'application/pdf', prefix: 'rx/a' });
    await expect(store.get(`rx/b/${a.key.split('/').pop()}`)).rejects.toThrow('object_not_found');
  });

  it('issues opaque access tickets not URLs', async () => {
    const put = await store.put({ bytes: Buffer.from('x'), contentType: 'text/plain', prefix: 't' });
    const signed = await store.signAccess(put.key, 60);
    expect(signed.ticket).not.toMatch(/^https?:/);
    expect(signed.ticket).not.toContain(root);
    expect(store.resolveTicket(signed.ticket)).toBe(put.key);
  });

  it('isolates tenant prefixes', async () => {
    const a = await store.put({ bytes: Buffer.from('a'), contentType: 'text/plain', prefix: 'kyc/tenant-a' });
    const b = await store.put({ bytes: Buffer.from('b'), contentType: 'text/plain', prefix: 'kyc/tenant-b' });
    expect(a.key.startsWith('kyc/tenant-a/')).toBe(true);
    expect(b.key.startsWith('kyc/tenant-b/')).toBe(true);
    expect(a.key).not.toBe(b.key);
  });

  it('validates content type and size', () => {
    expect(() =>
      assertValidPrivateUpload({
        bytes: Buffer.from('x'),
        contentType: 'application/x-msdownload',
        allowedTypes: new Set(['application/pdf']),
        maxBytes: 10,
      }),
    ).toThrow('invalid_content_type');
    expect(() =>
      assertValidPrivateUpload({
        bytes: Buffer.alloc(11),
        contentType: 'application/pdf',
        allowedTypes: new Set(['application/pdf']),
        maxBytes: 10,
      }),
    ).toThrow('invalid_object_size');
  });

  it('fails closed on production storage env instead of writing local disk', async () => {
    const prev = process.env['OBJECT_STORAGE_ENVIRONMENT'];
    process.env['OBJECT_STORAGE_ENVIRONMENT'] = 'production';
    const gated = new GatedPrivateObjectStore(store);
    await expect(
      gated.put({ bytes: Buffer.from('x'), contentType: 'text/plain', prefix: 'prod' }),
    ).rejects.toThrow();
    if (prev === undefined) {
      delete process.env['OBJECT_STORAGE_ENVIRONMENT'];
    } else {
      process.env['OBJECT_STORAGE_ENVIRONMENT'] = prev;
    }
  });
});

describe('Sprint 47 malware scanner', () => {
  it('AllowAll is sandbox noop CLEAN', async () => {
    const scan = await new AllowAllMalwareScanner().scan(Buffer.from('x'), 'text/plain');
    expect(scan.status).toBe('CLEAN');
    expect(scan.engine).toBe('noop');
  });

  it('deterministic scanner marks infected fixture', async () => {
    const scan = await new DeterministicSandboxMalwareScanner().scan(
      Buffer.from('WP_INFECTED_FIXTURE'),
      'text/plain',
    );
    expect(scan.status).toBe('INFECTED');
    expect(scan.clean).toBe(false);
  });

  it('deterministic scanner can fail closed', async () => {
    process.env['FILE_SCANNER_FORCE_FAIL'] = 'true';
    const scan = await new DeterministicSandboxMalwareScanner().scan(Buffer.from('ok'), 'text/plain');
    expect(scan.status).toBe('SCAN_FAILED');
    delete process.env['FILE_SCANNER_FORCE_FAIL'];
  });

  it('rejects eicar content type as infected', async () => {
    const scan = await new DeterministicSandboxMalwareScanner().scan(Buffer.from('x'), 'application/x-eicar');
    expect(scan.status).toBe('INFECTED');
  });

  it('clean sandbox bytes are CLEAN', async () => {
    const scan = await new DeterministicSandboxMalwareScanner().scan(Buffer.from('lab-report'), 'application/pdf');
    expect(scan.status).toBe('CLEAN');
  });

  it('production scanning env does not trust gated noop', async () => {
    process.env['FILE_SCANNING_ENVIRONMENT'] = 'production';
    const gated = new GatedMalwareScanner(new AllowAllMalwareScanner());
    await expect(gated.scan(Buffer.from('rx'), 'application/pdf')).rejects.toThrow();
    delete process.env['FILE_SCANNING_ENVIRONMENT'];
  });
});

describe('Sprint 47 backup catalog', () => {
  it('verifyBackupMetadata requires checksum and size', () => {
    expect(verifyBackupMetadata({})).toEqual({ ok: false, reason: 'sha256_missing' });
    expect(
      verifyBackupMetadata({
        sha256: 'a'.repeat(64),
        byte_size: 100,
        created_at: '2026-09-04T00:00:00.000Z',
      }),
    ).toEqual({ ok: true, reason: null });
  });

  it('lists metadata without filesystem path leakage', () => {
    const dir = join(tmpdir(), `wp-bak-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'worldpharma-1.sql.gz.meta.json'),
      JSON.stringify({
        created_at: '2026-09-04T00:00:00.000Z',
        environment: 'sandbox',
        database: 'worldpharma_test',
        byte_size: 2048,
        sha256: 'b'.repeat(64),
        outfile: 'H:\\\\secrets\\\\worldpharma-1.sql.gz',
      }),
    );
    const prev = process.env['BACKUP_DIR'];
    process.env['BACKUP_DIR'] = dir;
    const catalog = listBackupCatalog(5);
    expect(catalog.pitr).toBe('EXTERNAL_GATED');
    expect(catalog.last_verified_restore).toBeNull();
    expect(catalog.data[0]?.artifact_name).toBe('worldpharma-1.sql.gz');
    expect(JSON.stringify(catalog)).not.toContain('H:\\\\secrets');
    if (prev === undefined) delete process.env['BACKUP_DIR'];
    else process.env['BACKUP_DIR'] = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('empty backup dir is safe', () => {
    const dir = join(tmpdir(), `wp-bak-empty-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const prev = process.env['BACKUP_DIR'];
    process.env['BACKUP_DIR'] = dir;
    expect(listBackupCatalog().data).toEqual([]);
    if (prev === undefined) delete process.env['BACKUP_DIR'];
    else process.env['BACKUP_DIR'] = prev;
    rmSync(dir, { recursive: true, force: true });
  });
});
