import type { INestApplication } from '@nestjs/common';
import type { PolicyDocument } from '../policy/empty-pack';
import request from 'supertest';
import { LAB_PARTNER_ATTESTATION_CODE } from '../lab/lab-capability.service';

/** Enable fail-closed lab services + LAB partner type on a pack document (tests only). */
export function enableLabPartnerPack(
  doc: PolicyDocument,
  opts?: { home?: boolean; center?: boolean; physicalReport?: boolean },
): void {
  const home = opts?.home ?? true;
  const center = opts?.center ?? false;
  const physicalReport = opts?.physicalReport ?? false;
  doc.services.lab_home = home;
  doc.services.lab_center = center;
  doc.services.physical_report_delivery = physicalReport;
  doc.partner_types.LAB.enabled = true;
  const services: string[] = [];
  if (home) {
    services.push('lab_home');
  }
  if (center) {
    services.push('lab_center');
  }
  doc.partner_types.LAB.allowed_services = services.length ? services : ['lab_home'];
  doc.partner_types.LAB.join_public = false;
}

/** Lab attestation + company acceptance → ELIGIBLE (sandbox booking enabled in R7-B). */
export async function activateLabPartner(
  app: INestApplication,
  input: { labToken: string; adminToken: string; labOrgId: string },
): Promise<void> {
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const attested = await request(app.getHttpServer())
    .post('/api/v1/lab/capabilities/attest')
    .set(auth(input.labToken))
    .send({
      lab_org_id: input.labOrgId,
      attestation_code: LAB_PARTNER_ATTESTATION_CODE,
    });
  if (attested.status >= 300) {
    throw new Error(`lab attest failed: ${attested.status} ${JSON.stringify(attested.body)}`);
  }
  const accepted = await request(app.getHttpServer())
    .post('/api/v1/admin/lab/acceptance')
    .set(auth(input.adminToken))
    .send({ lab_org_id: input.labOrgId, action: 'accept' });
  if (accepted.status >= 300) {
    throw new Error(`lab accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  }
}
