import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
}

/** Integration point only. Phase 0 does not call a real AV engine. */
export abstract class MalwareScanner {
  abstract scan(bytes: Buffer, contentType: string): Promise<{ clean: boolean; engine: string }>;
}

export class AllowAllMalwareScanner extends MalwareScanner {
  async scan(): Promise<{ clean: boolean; engine: string }> {
    return { clean: true, engine: 'noop' };
  }
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
    const key = `${input.prefix}/${randomBytes(16).toString('hex')}`;
    const abs = join(this.root, key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.bytes, { mode: 0o600 });
    return {
      key,
      contentType: input.contentType,
      byteSize: input.bytes.length,
      checksumSha256: createHash('sha256').update(input.bytes).digest('hex'),
    };
  }

  async get(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
      throw new Error('invalid_object_key');
    }
    const bytes = await readFile(join(this.root, key));
    return { bytes, contentType: 'application/octet-stream' };
  }

  async signAccess(key: string, ttlSeconds: number): Promise<{ ticket: string; expiresAt: Date }> {
    const ticket = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.tickets.set(ticket, { key, expiresAt: expiresAt.getTime() });
    return { ticket, expiresAt };
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
