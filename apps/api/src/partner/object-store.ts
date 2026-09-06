import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { assertProductionFileScanningAvailable } from '../ops/production-file-scanning-gate';
import { assertProductionStorageAvailable } from '../ops/production-storage-gate';
import { readFileScanningEnvironment, readObjectStorageEnvironment } from '../ops/infra-environment';
import {
  assertProductionMalwareScanAllowed,
  assertProductionPrivateStorageAllowed,
} from '../ops/private-storage-kms-malware-production-activation-path';

export interface StoredObject {
  key: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
}

export abstract class PrivateObjectStore {
  abstract put(input: {
    bytes: Buffer;
    contentType: string;
    prefix: string;
  }): Promise<StoredObject>;
  abstract get(key: string): Promise<{ bytes: Buffer; contentType: string }>;
  /** Opaque ticket — never a public URL or filesystem path. */
  abstract signAccess(key: string, ttlSeconds: number): Promise<{ ticket: string; expiresAt: Date }>;
  /** Resolve a previously signed ticket to an object key, or null if missing/expired. */
  abstract resolveTicket(ticket: string): string | null;
  abstract delete(key: string): Promise<void>;
  abstract stat(key: string): Promise<{ byteSize: number; contentType: string } | null>;
}

/** Integration point only. Phase 0 does not call a real AV engine. */
export abstract class MalwareScanner {
  abstract scan(bytes: Buffer, contentType: string): Promise<{ clean: boolean; engine: string; status: ScanStatus }>;
}

export type ScanStatus = 'CLEAN' | 'INFECTED' | 'SCAN_FAILED' | 'QUARANTINED';

export class AllowAllMalwareScanner extends MalwareScanner {
  async scan(_bytes: Buffer, _contentType: string): Promise<{ clean: boolean; engine: string; status: ScanStatus }> {
    return { clean: true, engine: 'noop', status: 'CLEAN' };
  }
}

/** Sandbox-only deterministic fixture. Not a real AV engine. */
export class DeterministicSandboxMalwareScanner extends MalwareScanner {
  async scan(bytes: Buffer, contentType: string): Promise<{ clean: boolean; engine: string; status: ScanStatus }> {
    if (process.env['FILE_SCANNER_FORCE_FAIL'] === 'true') {
      return { clean: false, engine: 'sandbox-deterministic', status: 'SCAN_FAILED' };
    }
    const marker = bytes.toString('utf8');
    if (contentType === 'application/x-eicar' || marker.includes('WP_INFECTED_FIXTURE')) {
      return { clean: false, engine: 'sandbox-deterministic', status: 'INFECTED' };
    }
    return { clean: true, engine: 'sandbox-deterministic', status: 'CLEAN' };
  }
}

export class GatedMalwareScanner extends MalwareScanner {
  constructor(private readonly inner: MalwareScanner) {
    super();
  }

  async scan(bytes: Buffer, contentType: string): Promise<{ clean: boolean; engine: string; status: ScanStatus }> {
    if (readFileScanningEnvironment() === 'production') {
      // S140 — production scanner fail-closed until genuine provider ENABLED.
      assertProductionMalwareScanAllowed('malware.scan');
      assertProductionFileScanningAvailable();
    }
    return this.inner.scan(bytes, contentType);
  }
}

export function assertValidPrivateUpload(input: {
  bytes: Buffer;
  contentType: string;
  allowedTypes: Set<string>;
  maxBytes: number;
}): void {
  if (!input.allowedTypes.has(input.contentType)) {
    throw new Error('invalid_content_type');
  }
  if (input.bytes.length <= 0 || input.bytes.length > input.maxBytes) {
    throw new Error('invalid_object_size');
  }
}

/** Reject path traversal, absolute paths, null bytes, Windows drive keys. */
export function assertSafeObjectKey(key: string): void {
  if (
    !key ||
    key.includes('..') ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0') ||
    /^[a-zA-Z]:/.test(key) ||
    key.includes('%2e') ||
    key.includes('%2E')
  ) {
    throw new Error('invalid_object_key');
  }
}

/** Resolve key under store root; fail closed if the result escapes the root. */
export function resolveObjectPathUnderRoot(root: string, key: string): string {
  assertSafeObjectKey(key);
  const rootResolved = resolve(root);
  const abs = resolve(rootResolved, key);
  const prefix = rootResolved.endsWith(sep) ? rootResolved : `${rootResolved}${sep}`;
  if (abs !== rootResolved && !abs.startsWith(prefix)) {
    throw new Error('invalid_object_key');
  }
  return abs;
}

/** Local private store. Paths are never exposed as HTTP URLs. */
export class LocalPrivateObjectStore extends PrivateObjectStore {
  private readonly tickets = new Map<string, { key: string; expiresAt: number }>();

  constructor(private readonly root = join(process.cwd(), 'var', 'private-objects')) {
    super();
  }

  async put(input: {
    bytes: Buffer;
    contentType: string;
    prefix: string;
  }): Promise<StoredObject> {
    if (
      input.prefix.includes('..') ||
      input.prefix.startsWith('/') ||
      input.prefix.includes('\\') ||
      input.prefix.includes('\0')
    ) {
      throw new Error('invalid_object_key');
    }
    const key = `${input.prefix}/${randomBytes(16).toString('hex')}`;
    const abs = resolveObjectPathUnderRoot(this.root, key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.bytes, { mode: 0o600 });
    await writeFile(
      `${abs}.meta.json`,
      JSON.stringify({ contentType: input.contentType, byteSize: input.bytes.length }),
      { mode: 0o600 },
    );
    return {
      key,
      contentType: input.contentType,
      byteSize: input.bytes.length,
      checksumSha256: createHash('sha256').update(input.bytes).digest('hex'),
    };
  }

  async get(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    assertSafeObjectKey(key);
    try {
      const abs = resolveObjectPathUnderRoot(this.root, key);
      const bytes = await readFile(abs);
      const meta = await this.readMeta(abs);
      return { bytes, contentType: meta?.contentType ?? 'application/octet-stream' };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error('object_not_found');
      }
      if ((err as Error).message === 'invalid_object_key') {
        throw err;
      }
      throw new Error('object_read_failed');
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeObjectKey(key);
    const abs = resolveObjectPathUnderRoot(this.root, key);
    try {
      await unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    try {
      await unlink(`${abs}.meta.json`);
    } catch {
      // meta is optional
    }
  }

  async stat(key: string): Promise<{ byteSize: number; contentType: string } | null> {
    assertSafeObjectKey(key);
    try {
      const abs = resolveObjectPathUnderRoot(this.root, key);
      const bytes = await readFile(abs);
      const meta = await this.readMeta(abs);
      return { byteSize: bytes.length, contentType: meta?.contentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  async signAccess(key: string, ttlSeconds: number): Promise<{ ticket: string; expiresAt: Date }> {
    assertSafeObjectKey(key);
    const ticket = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.tickets.set(ticket, { key, expiresAt: expiresAt.getTime() });
    return { ticket, expiresAt };
  }

  resolveTicket(ticket: string): string | null {
    const row = this.tickets.get(ticket);
    if (!row || row.expiresAt < Date.now()) {
      return null;
    }
    return row.key;
  }

  private async readMeta(abs: string): Promise<{ contentType: string } | null> {
    try {
      const raw = JSON.parse(await readFile(`${abs}.meta.json`, 'utf8')) as { contentType?: string };
      return raw.contentType ? { contentType: raw.contentType } : null;
    } catch {
      return null;
    }
  }
}

/** Fail-closed production wrapper — never uses local disk when production storage env is set. */
export class GatedPrivateObjectStore extends PrivateObjectStore {
  constructor(private readonly inner: LocalPrivateObjectStore) {
    super();
  }

  async put(input: { bytes: Buffer; contentType: string; prefix: string }): Promise<StoredObject> {
    if (readObjectStorageEnvironment() === 'production') {
      // S140 — production private storage fail-closed until genuine triad ENABLED.
      assertProductionPrivateStorageAllowed('storage.put');
      assertProductionStorageAvailable();
    }
    return this.inner.put(input);
  }

  async get(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    if (readObjectStorageEnvironment() === 'production') {
      assertProductionPrivateStorageAllowed('storage.get');
      assertProductionStorageAvailable();
    }
    return this.inner.get(key);
  }

  async delete(key: string): Promise<void> {
    if (readObjectStorageEnvironment() === 'production') {
      assertProductionPrivateStorageAllowed('storage.delete');
      assertProductionStorageAvailable();
    }
    return this.inner.delete(key);
  }

  async stat(key: string): Promise<{ byteSize: number; contentType: string } | null> {
    return this.inner.stat(key);
  }

  async signAccess(key: string, ttlSeconds: number): Promise<{ ticket: string; expiresAt: Date }> {
    if (readObjectStorageEnvironment() === 'production') {
      assertProductionPrivateStorageAllowed('storage.signAccess');
      assertProductionStorageAvailable();
    }
    return this.inner.signAccess(key, ttlSeconds);
  }

  resolveTicket(ticket: string): string | null {
    return this.inner.resolveTicket(ticket);
  }
}

export const ALLOWED_KYC_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const MAX_KYC_BYTES = 10 * 1024 * 1024;

export const ALLOWED_CMS_ASSET_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const MAX_CMS_ASSET_BYTES = 5 * 1024 * 1024;

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'document';
}
