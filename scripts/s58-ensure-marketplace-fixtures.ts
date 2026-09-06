/**
 * Sprint 58 — marketplace fixtures (multi-seller + sandbox promo + CMS marker).
 * Idempotent. Sandbox-only synthetic data.
 *
 *   npx tsx scripts/s58-ensure-marketplace-fixtures.ts
 */
import {
  CmsContentStatus,
  InventoryLotStatus,
  LocationKind,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  OrganizationStatus,
  PrismaClient,
  PromoCampaignStatus,
  PromoFunding,
  PromoKind,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const API = process.env.WP_API_BASE ?? 'http://127.0.0.1:4000/api/v1';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';

const ALT_VENDOR_LEGAL = 'Demo Marketplace Pharmacy B';
const ALT_VENDOR_DISPLAY = 'Demo Care Pharmacy';
const MARKER_SLUG = 'demo-paracetamol-500';
const PROMO_CODE = 'SAVE10SBX';
const CMS_MARKER = 'S58-SANDBOX-CMS-MARKER';
const MARKETPLACE_ATTESTATION_CODE = 'MARKETPLACE_SELLER_SANDBOX_V1';

function id(): string {
  return randomUUID();
}

async function login(email: string, audience: string): Promise<string> {
  const s = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'LOGIN' }),
  });
  const j = (await s.json()) as { challenge_id?: string; dev_code?: string };
  const v = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: j.challenge_id, code: j.dev_code, audience }),
  });
  const t = (await v.json()) as { access_token?: string; detail?: string };
  if (!t.access_token) throw new Error(`Login failed ${email}: ${t.detail ?? v.status}`);
  return t.access_token;
}

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  idem?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

async function ensureMembership(personId: string, roleCode: string, organizationId: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const existing = await prisma.membership.findFirst({
    where: { personId, roleId: role.id, organizationId },
  });
  if (!existing) {
    await prisma.membership.create({
      data: {
        id: id(),
        personId,
        roleId: role.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
  }
}

async function markSellerEligible(sellerOrgId: string, actorPersonId: string) {
  const Redis = (await import('ioredis')).default;
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
  const key = `marketplace:seller:${sellerOrgId}`;
  const record = {
    acceptance: 'ACCEPTED',
    attested_at: new Date().toISOString(),
    attested_by: actorPersonId,
    attestation_code: MARKETPLACE_ATTESTATION_CODE,
    accepted_at: new Date().toISOString(),
    accepted_by: actorPersonId,
    updated_at: new Date().toISOString(),
  };
  await client.set(key, JSON.stringify(record));
  await client.quit();
  console.log('marketplace eligibility set', sellerOrgId.slice(0, 8));
}

async function ensureAltVendorForCountry(iso: string, vendorTok: string, vendorPersonId: string) {
  const country = await prisma.country.findUnique({ where: { isoAlpha2: iso } });
  if (!country) {
    console.warn('skip country', iso);
    return null;
  }

  let org = await prisma.organization.findFirst({
    where: { countryId: country.id, kind: OrganizationKind.VENDOR, legalName: ALT_VENDOR_LEGAL },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: id(),
        countryId: country.id,
        kind: OrganizationKind.VENDOR,
        legalName: ALT_VENDOR_LEGAL,
        displayName: ALT_VENDOR_DISPLAY,
        status: OrganizationStatus.ACTIVE,
      },
    });
    console.log('created alt vendor', iso, org.id);
  }

  await ensureMembership(vendorPersonId, 'org_owner', org.id);
  await markSellerEligible(org.id, vendorPersonId);

  let warehouse = await prisma.location.findFirst({
    where: { organizationId: org.id, kind: LocationKind.VENDOR_WAREHOUSE },
  });
  if (!warehouse) {
    warehouse = await prisma.location.create({
      data: {
        id: id(),
        organizationId: org.id,
        countryId: country.id,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Demo Care Warehouse',
        timezone: 'UTC',
      },
    });
  }

  const item = await prisma.catalogItem.findFirst({
    where: { slug: MARKER_SLUG },
    include: { variants: true },
  });
  if (!item?.variants[0]) {
    console.warn('marker item missing', MARKER_SLUG);
    return { orgId: org.id };
  }
  const variant = item.variants[0];

  const primary = await prisma.catalogOffer.findFirst({
    where: {
      variantId: variant.id,
      countryId: country.id,
      status: OfferStatus.PUBLISHED,
      sellerOrg: { legalName: 'Demo Vendor' },
    },
    include: { prices: { where: { isCurrent: true }, take: 1 } },
  });
  const primarySell = primary?.prices[0]?.sellMinor ?? 4999n;
  const altSell = primarySell + 500n;
  const altList = (primary?.prices[0]?.listMinor ?? primarySell + 1500n) + 200n;
  const currency = (primary?.currency ?? country.defaultCurrency ?? 'INR').toUpperCase();

  let altOffer = await prisma.catalogOffer.findFirst({
    where: {
      variantId: variant.id,
      countryId: country.id,
      sellerOrgId: org.id,
    },
    include: { prices: { where: { isCurrent: true }, take: 1 } },
  });

  if (!altOffer) {
    // Prefer legitimate vendor API create+publish
    const created = await api(
      'POST',
      '/vendor/catalog/offers',
      vendorTok,
      {
        variant_id: variant.id,
        seller_org_id: org.id,
        country_code: iso,
        ownership: 'VENDOR_OWNED',
        currency,
        cost_minor: String((altSell * 60n) / 100n),
        sell_minor: String(altSell),
        list_minor: String(altList),
        location_id: warehouse.id,
      },
      `s58-offer-${iso}`,
    );
    console.log('vendor create offer', iso, created.status, created.body.id ?? created.body.code ?? created.body.detail);
    if (created.body.id) {
      const pub = await api(
        'POST',
        `/vendor/catalog/offers/${created.body.id}/publish`,
        vendorTok,
        { seller_org_id: org.id },
        `s58-offer-pub-${iso}`,
      );
      console.log('vendor publish offer', iso, pub.status, pub.body.code ?? '');
    }
    altOffer = await prisma.catalogOffer.findFirst({
      where: { variantId: variant.id, countryId: country.id, sellerOrgId: org.id },
    });
  }

  if (!altOffer) {
    // Prisma fallback
    const offerId = id();
    await prisma.catalogOffer.create({
      data: {
        id: offerId,
        variantId: variant.id,
        sellerOrgId: org.id,
        countryId: country.id,
        locationId: warehouse.id,
        ownership: OfferOwnership.VENDOR_OWNED,
        currency,
        status: OfferStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
    await prisma.priceVersion.create({
      data: {
        id: id(),
        offerId,
        version: 1,
        currency,
        costMinor: (altSell * 60n) / 100n,
        listMinor: altList,
        sellMinor: altSell,
        validFrom: new Date(),
        isCurrent: true,
      },
    });
    altOffer = await prisma.catalogOffer.findUniqueOrThrow({ where: { id: offerId } });
    console.log('prisma alt offer', iso, offerId);
  } else if (altOffer.status !== OfferStatus.PUBLISHED) {
    await prisma.catalogOffer.update({
      where: { id: altOffer.id },
      data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  // Inventory via goods receipt API when possible
  const grn = await api(
    'POST',
    '/vendor/inventory/grn',
    vendorTok,
    {
      location_id: warehouse.id,
      owner_org_id: org.id,
      idempotency_key: `s58-grn-${iso}-${MARKER_SLUG}`,
      lines: [
        {
          variant_id: variant.id,
          lot_code: `S58-ALT-${iso}`,
          expires_on: '2031-12-31',
          qty: 40,
        },
      ],
    },
    `s58-grn-${iso}`,
  );
  console.log('grn create', iso, grn.status, grn.body.id ?? grn.body.code ?? '');
  if (grn.body.id) {
    await api('POST', `/vendor/inventory/grn/${grn.body.id}/receive`, vendorTok, {}, `s58-grn-recv-${iso}`);
    const posted = await api(
      'POST',
      `/vendor/inventory/grn/${grn.body.id}/post`,
      vendorTok,
      {},
      `s58-grn-post-${iso}`,
    );
    console.log('grn post', iso, posted.status, posted.body.code ?? '');
  } else {
    // Prisma inventory fallback
    let lot = await prisma.inventoryLot.findFirst({
      where: { variantId: variant.id, locationId: warehouse.id, ownerOrgId: org.id, lotCode: `S58-ALT-${iso}` },
    });
    if (!lot) {
      lot = await prisma.inventoryLot.create({
        data: {
          id: id(),
          variantId: variant.id,
          locationId: warehouse.id,
          ownerOrgId: org.id,
          countryId: country.id,
          lotCode: `S58-ALT-${iso}`,
          expiresOn: new Date('2031-12-31'),
          status: InventoryLotStatus.ACTIVE,
        },
      });
      await prisma.inventoryBalance.create({
        data: { id: id(), lotId: lot.id, onHand: 40, reserved: 0 },
      });
      console.log('prisma lot+balance', iso);
    }
  }

  return { orgId: org.id, offerId: altOffer.id, slug: MARKER_SLUG };
}

async function ensurePromo(iso: string) {
  const country = await prisma.country.findUnique({ where: { isoAlpha2: iso } });
  if (!country) return null;

  const code = iso === 'IN' ? PROMO_CODE : `${PROMO_CODE}-${iso}`;
  const existing = await prisma.promoCampaign.findUnique({ where: { code } });
  if (existing) {
    if (existing.status !== PromoCampaignStatus.ACTIVE) {
      await prisma.promoCampaign.update({
        where: { id: existing.id },
        data: {
          status: PromoCampaignStatus.ACTIVE,
          percentBps: 1000,
          minBasketMinor: 1000n,
          expiresAt: new Date(Date.now() + 90 * 86400_000),
        },
      });
      console.log('reactivated promo', code);
    } else {
      console.log('promo ok', code);
    }
    return existing.id;
  }

  const row = await prisma.promoCampaign.create({
    data: {
      id: id(),
      code,
      kind: PromoKind.PERCENT,
      percentBps: 1000,
      fixedMinor: 0n,
      minBasketMinor: 1000n,
      funding: PromoFunding.PLATFORM,
      countryId: country.id,
      status: PromoCampaignStatus.ACTIVE,
      maxRedemptions: 10_000,
      expiresAt: new Date(Date.now() + 90 * 86400_000),
    },
  });
  console.log('created promo', code, row.id);
  return row.id;
}

async function ensureCmsSandboxTouch() {
  const article = await prisma.cmsContentItem.findFirst({
    where: { slug: 'how-to-order-medicines', status: CmsContentStatus.PUBLISHED },
    orderBy: { updatedAt: 'desc' },
  });
  if (!article) {
    console.warn('CMS article how-to-order-medicines not found');
    return null;
  }
  if (article.body.includes(CMS_MARKER)) {
    console.log('cms marker already present');
    return article.slug;
  }
  const nextBody = `${article.body}\n\n<p data-s58="${CMS_MARKER}">Sandbox help tip: compare pharmacy sellers on the product page before checkout.</p>\n`;
  await prisma.cmsContentItem.update({
    where: { id: article.id },
    data: { body: nextBody, summary: article.summary || 'How to order medicines on World Pharma (sandbox).' },
  });
  const pub = await prisma.cmsContentPublication.findFirst({
    where: { contentItemId: article.id },
    orderBy: { publicationVersion: 'desc' },
  });
  if (pub) {
    await prisma.cmsContentPublication.update({
      where: { id: pub.id },
      data: { body: nextBody },
    });
  }
  const search = await prisma.cmsContentSearchDocument.findFirst({
    where: { contentItemId: article.id },
  });
  if (search) {
    await prisma.cmsContentSearchDocument.update({
      where: { id: search.id },
      data: { body: nextBody },
    });
  }
  console.log('cms marker applied', article.slug);
  return article.slug;
}

async function main() {
  console.log('S58 marketplace fixtures…');
  const vendorIdent = await prisma.accountIdentifier.findFirstOrThrow({
    where: { type: 'EMAIL', valueNormalized: 'sandbox-vendor@dev.local' },
  });
  const vendorTok = await login('sandbox-vendor@dev.local', 'customer');

  for (const iso of ['IN', 'AE', 'US'] as const) {
    try {
      await ensureAltVendorForCountry(iso, vendorTok, vendorIdent.personId);
    } catch (e) {
      console.warn('alt vendor', iso, (e as Error).message);
    }
    try {
      await ensurePromo(iso);
    } catch (e) {
      console.warn('promo', iso, (e as Error).message);
    }
  }
  try {
    await ensureCmsSandboxTouch();
  } catch (e) {
    console.warn('cms', (e as Error).message);
  }
  console.log('S58 fixture run complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
