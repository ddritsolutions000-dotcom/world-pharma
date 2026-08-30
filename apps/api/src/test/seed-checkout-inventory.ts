import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/** Post vendor GRN stock so checkout reservation sees inventory under RLS (not direct Prisma seed). */
export async function seedCheckoutInventory(
  app: INestApplication,
  input: {
    vendorToken: string;
    locationId: string;
    ownerOrgId: string;
    variantId: string;
    qty?: number;
    lotCode?: string;
    expiresOn?: string;
  },
): Promise<{ lotId: string; available: number }> {
  const qty = input.qty ?? 20;
  const grn = await request(app.getHttpServer())
    .post('/api/v1/vendor/inventory/grn')
    .set('Authorization', `Bearer ${input.vendorToken}`)
    .send({
      location_id: input.locationId,
      owner_org_id: input.ownerOrgId,
      idempotency_key: `grn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lines: [
        {
          variant_id: input.variantId,
          lot_code: input.lotCode ?? `CO-LOT-${Date.now()}`,
          expires_on: input.expiresOn ?? '2030-01-01',
          qty,
          qty_accepted: qty,
        },
      ],
    });
  if (grn.status >= 300) {
    throw new Error(`GRN create failed: ${grn.status} ${JSON.stringify(grn.body)}`);
  }
  const posted = await request(app.getHttpServer())
    .post(`/api/v1/vendor/inventory/grn/${grn.body.id}/post`)
    .set('Authorization', `Bearer ${input.vendorToken}`);
  if (posted.status >= 300) {
    throw new Error(`GRN post failed: ${posted.status} ${JSON.stringify(posted.body)}`);
  }
  const lots = await request(app.getHttpServer())
    .get(`/api/v1/vendor/inventory/lots?owner_org_id=${input.ownerOrgId}`)
    .set('Authorization', `Bearer ${input.vendorToken}`);
  if (lots.status >= 300 || !lots.body.data?.length) {
    throw new Error(`GRN lot lookup failed: ${lots.status} ${JSON.stringify(lots.body)}`);
  }
  const lot = lots.body.data[0] as { id: string; available: number };
  if (lot.available <= 0) {
    throw new Error(`GRN seed produced no available stock: ${JSON.stringify(lots.body)}`);
  }
  return { lotId: lot.id, available: lot.available };
}
