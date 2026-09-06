/**
 * Sprint 59 — public UX fixtures (CMS sandbox marker on help article).
 * Idempotent. Does not invent medical/business claims.
 *
 *   npx tsx scripts/s59-ensure-public-ux-fixtures.ts
 */
import { CmsContentStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CMS_MARKER = 'S59-SANDBOX-CMS-MARKER';
const SLUG = 'how-to-order-medicines';

async function ensureCmsSandboxTouch() {
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
  const nextBody = `${article.body}\n\n<p data-s59="${CMS_MARKER}">S59 sandbox tip: use Help search if a specialty page looks thin — partner acquisition lives on the Join portal.</p>\n`;
  await prisma.cmsContentItem.update({
    where: { id: article.id },
    data: {
      body: nextBody,
      summary: article.summary || 'How to order medicines on World Pharma (sandbox).',
    },
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
      data: { body: `${search.body ?? ''}\n${CMS_MARKER}` },
    });
  }
  console.log('cms marker applied', SLUG);
  return SLUG;
}

async function main() {
  const slug = await ensureCmsSandboxTouch();
  console.log(JSON.stringify({ ok: true, cms_slug: slug, marker: CMS_MARKER }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
