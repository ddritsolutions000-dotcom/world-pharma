import { KycDocumentStatus } from '@prisma/client';

/** Extra document type codes allowed beyond country-pack required_documents (admin/legacy). */
export const OPTIONAL_JOIN_DOCUMENT_TYPES = new Set([
  'license',
  'LICENSE',
  'ID_PROOF',
  'ADDRESS_PROOF',
  'TAX_ID',
  'PHARMACY_LICENCE',
  'GST_CERTIFICATE',
  'PAN_CARD',
]);

const SUBMIT_OK = new Set<string>([
  KycDocumentStatus.UPLOADED,
  KycDocumentStatus.UNDER_REVIEW,
  KycDocumentStatus.VERIFIED,
]);

const ACTIVATE_OK = new Set<string>([KycDocumentStatus.VERIFIED]);

export type JoinDocMode = 'submit' | 'activate';

export function isAllowedJoinDocumentTypeCode(
  code: string,
  required: string[],
): { ok: boolean; reason?: string } {
  const normalized = code.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(normalized)) {
    return { ok: false, reason: 'document_type_code must be alphanumeric (2–64 chars).' };
  }
  if (!required.length) {
    return { ok: true };
  }
  if (required.includes(normalized) || OPTIONAL_JOIN_DOCUMENT_TYPES.has(normalized)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Document type ${normalized} is not allowed. Allowed: ${[...required].join(', ')}.`,
  };
}

export function missingRequiredDocuments(
  required: string[],
  docs: Array<{ documentTypeCode: string; status: string }>,
  mode: JoinDocMode,
): string[] {
  if (!required.length) {
    return [];
  }
  const acceptable = mode === 'activate' ? ACTIVATE_OK : SUBMIT_OK;
  const missing: string[] = [];
  for (const code of required) {
    const ok = docs.some(
      (doc) =>
        doc.documentTypeCode === code &&
        doc.status !== KycDocumentStatus.RETIRED &&
        acceptable.has(doc.status),
    );
    if (!ok) {
      missing.push(code);
    }
  }
  return missing;
}

/** Magic-byte sniff vs declared MIME — blocks trivial content-type spoofing. */
export function assertKycBytesMatchContentType(bytes: Buffer, contentType: string): void {
  if (contentType === 'application/pdf') {
    const head = bytes.subarray(0, 5).toString('utf8');
    if (!head.startsWith('%PDF-')) {
      throw new Error('pdf_magic_mismatch');
    }
    return;
  }
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error('jpeg_magic_mismatch');
    }
    return;
  }
  if (contentType === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < sig.length || sig.some((b, i) => bytes[i] !== b)) {
      throw new Error('png_magic_mismatch');
    }
  }
}
