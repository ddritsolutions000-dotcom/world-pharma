import type { INestApplication } from '@nestjs/common';
import type { PolicyDocument } from '../policy/empty-pack';
import request from 'supertest';
import { RADIOLOGY_PARTNER_ATTESTATION_CODE } from '../radiology/radiology-capability.service';

/** Enable fail-closed imaging services + IMAGING_CENTER partner type on a pack document (tests only). */
export function enableImagingPartnerPack(doc: PolicyDocument, opts?: { physicalReport?: boolean }): void {
  doc.services.imaging_center = true;
  doc.services.physical_report_delivery = opts?.physicalReport ?? false;
  doc.partner_types.IMAGING_CENTER.enabled = true;
  doc.partner_types.IMAGING_CENTER.allowed_services = ['imaging_center'];
  doc.partner_types.IMAGING_CENTER.join_public = false;
}

/** Sandbox onboarding — imaging partners can apply via web-join. */
export function enableImagingPartnerPackForSandbox(doc: PolicyDocument): void {
  enableImagingPartnerPack(doc);
  doc.partner_types.IMAGING_CENTER.join_public = true;
}

/** Imaging attestation + company acceptance → ELIGIBLE (catalog + booking when R8-B pack enabled). */
export async function activateImagingPartner(
  app: INestApplication,
  input: { imagingToken: string; adminToken: string; imagingOrgId: string },
): Promise<void> {
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const attested = await request(app.getHttpServer())
    .post('/api/v1/radiology/capabilities/attest')
    .set(auth(input.imagingToken))
    .send({
      imaging_org_id: input.imagingOrgId,
      attestation_code: RADIOLOGY_PARTNER_ATTESTATION_CODE,
    });
  if (attested.status >= 300) {
    throw new Error(`imaging attest failed: ${attested.status} ${JSON.stringify(attested.body)}`);
  }
  const accepted = await request(app.getHttpServer())
    .post('/api/v1/admin/imaging/acceptance')
    .set(auth(input.adminToken))
    .send({ imaging_org_id: input.imagingOrgId, action: 'accept' });
  if (accepted.status >= 300) {
    throw new Error(`imaging accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  }
}
