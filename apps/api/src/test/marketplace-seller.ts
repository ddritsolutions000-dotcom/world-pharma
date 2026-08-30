import type { INestApplication } from '@nestjs/common';
import type { PolicyDocument } from '../policy/empty-pack';
import request from 'supertest';
import { MARKETPLACE_ATTESTATION_CODE } from '../catalog/marketplace-eligibility.service';

/** Enable fail-closed marketplace + VENDOR partner type on a pack document (tests only). */
export function enableMarketplaceVendorPack(doc: PolicyDocument): void {
  doc.services.marketplace = true;
  doc.partner_types.VENDOR.enabled = true;
  doc.partner_types.VENDOR.allowed_services = ['marketplace'];
  doc.partner_types.VENDOR.join_public = false;
}

/** Seller attestation + company acceptance → ELIGIBLE (sandbox; not live payout). */
export async function activateMarketplaceSeller(
  app: INestApplication,
  input: { vendorToken: string; adminToken: string; sellerOrgId: string },
): Promise<void> {
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const attested = await request(app.getHttpServer())
    .post('/api/v1/vendor/marketplace/attest')
    .set(auth(input.vendorToken))
    .send({
      seller_org_id: input.sellerOrgId,
      attestation_code: MARKETPLACE_ATTESTATION_CODE,
    });
  if (attested.status >= 300) {
    throw new Error(`marketplace attest failed: ${attested.status} ${JSON.stringify(attested.body)}`);
  }
  const accepted = await request(app.getHttpServer())
    .post('/api/v1/admin/marketplace/acceptance')
    .set(auth(input.adminToken))
    .send({ seller_org_id: input.sellerOrgId, action: 'accept' });
  if (accepted.status >= 300) {
    throw new Error(`marketplace accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  }
}
