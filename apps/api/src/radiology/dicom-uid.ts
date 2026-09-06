import { uuidv7 } from '@world-pharma/shared';

/**
 * Sandbox DICOM UID generation (PS3.5 UI, max 64 chars).
 *
 * Primary strategy: registered sandbox OID root + timestamp + entropy.
 * Backfill/alternate: DICOM UUID encoding prefix 2.25.{uuid-as-decimal} per DICOM Part 5.
 *
 * Production deployments must replace SANDBOX_OID_ROOT with a registered organization OID.
 */
const SANDBOX_OID_ROOT = '1.2.840.9999.1';

export function generateDicomUid(): string {
  const ts = Date.now();
  const entropy = Math.floor(Math.random() * 1_000_000_000);
  return `${SANDBOX_OID_ROOT}.${ts}.${entropy}`.slice(0, 64);
}

/** Deterministic UID from internal UUID (used for migration backfill and idempotent labels). */
export function dicomUidFromUuid(id: string): string {
  const hex = id.replace(/-/g, '');
  const decimal = BigInt(`0x${hex}`).toString();
  return `2.25.${decimal}`.slice(0, 64);
}

/** Fresh series/instance UIDs for sandbox ingestion. */
export function generateSeriesInstanceUid(): string {
  return generateDicomUid();
}

export function generateSopInstanceUid(): string {
  return generateDicomUid();
}

/** Minimal sandbox DICOM-like payload (not a full Part 10 file). */
export function buildSandboxDicomPayload(input: {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  accessionNumber: string;
  modalityCode: string;
}): Buffer {
  const body = JSON.stringify({
    sandbox: true,
    transfer_syntax: 'SANDBOX_JSON',
    study_instance_uid: input.studyInstanceUid,
    series_instance_uid: input.seriesInstanceUid,
    sop_instance_uid: input.sopInstanceUid,
    accession_number: input.accessionNumber,
    modality: input.modalityCode,
    note: 'Sandbox imaging object — not a clinical DICOM Part 10 dataset.',
    generated_at: new Date().toISOString(),
    trace: uuidv7(),
  });
  return Buffer.from(body, 'utf8');
}
