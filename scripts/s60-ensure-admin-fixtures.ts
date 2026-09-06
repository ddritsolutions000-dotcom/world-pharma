/**
 * Sprint 60 — Admin control-plane fixtures (sandbox only).
 * - CMS marker on help article
 * - One partner application in DOCUMENTS_SUBMITTED for operator review UI
 *
 *   npx tsx scripts/s60-ensure-admin-fixtures.ts
 */
import { CmsContentStatus, PartnerStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CMS_MARKER = 'S60-SANDBOX-CMS-MARKER';
const SLUG = 'how-to-order-medicines';

async function ensureCmsMarker() {
  const article = await prisma.cmsContentItem.findFirst({
    where: { slug: SLUG, status: CmsContentStatus.PUBLISHED },
    orderBy: { updatedAt: 'desc' },
  });
  if (!article) {
    console.warn(`CMS article ${SLUG} not found`);
    return null;
  }
  if (article.body.includes(CMS_MARKER)) {
    console.log('cms marker already present');
    return article.slug;
  }
  const nextBody = `${article.body}\n\n<p data-s60="${CMS_MARKER}">S60 sandbox tip: Main Admin operators manage catalog, partners, and orders from the control plane.</p>\n`;
  await prisma.cmsContentItem.update({ where: { id: article.id }, data: { body: nextBody } });
  const pub = await prisma.cmsContentPublication.findFirst({
    where: { contentItemId: article.id },
    orderBy: { publicationVersion: 'desc' },
  });
  if (pub) {
    await prisma.cmsContentPublication.update({ where: { id: pub.id }, data: { body: nextBody } });
  }
  const search = await prisma.cmsContentSearchDocument.findFirst({
    where: { contentItemId: article.id },
  });
  if (search) {
    await prisma.cmsContentSearchDocument.update({ where: { id: search.id }, data: { body: nextBody } });
  }
  console.log('cms marker applied', SLUG);
  return SLUG;
}

async function ensureReviewablePartner() {
  let reviewable = await prisma.partnerApplication.findFirst({
    where: { status: { in: [PartnerStatus.DOCUMENTS_SUBMITTED, PartnerStatus.UNDER_REVIEW] } },
    orderBy: { updatedAt: 'desc' },
  });
  if (reviewable) {
    console.log('reviewable partner ok', reviewable.id, reviewable.status);
    return { id: reviewable.id, status: reviewable.status, type: reviewable.partnerTypeCode };
  }

  const draft = await prisma.partnerApplication.findFirst({
    where: { status: PartnerStatus.DRAFT, partnerTypeCode: 'VENDOR' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!draft) {
    console.warn('no DRAFT VENDOR application to advance');
    return null;
  }

  // Advance via legal lifecycle steps for sandbox QA — does not claim KYC verification.
  await prisma.partnerApplication.update({
    where: { id: draft.id },
    data: { status: PartnerStatus.REGISTERED },
  });
  await prisma.partnerApplication.update({
    where: { id: draft.id },
    data: { status: PartnerStatus.DOCUMENTS_REQUIRED },
  });
  reviewable = await prisma.partnerApplication.update({
    where: { id: draft.id },
    data: { status: PartnerStatus.DOCUMENTS_SUBMITTED },
  });
  console.log('advanced draft → DOCUMENTS_SUBMITTED', draft.id);
  return { id: reviewable.id, status: reviewable.status, type: reviewable.partnerTypeCode };
}

async function main() {
  const cms = await ensureCmsMarker();
  const partner = await ensureReviewablePartner();
  console.log(JSON.stringify({ ok: true, cms_slug: cms, marker: CMS_MARKER, partner }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
