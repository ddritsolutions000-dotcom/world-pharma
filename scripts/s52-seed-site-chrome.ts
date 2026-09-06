/**
 * One-shot Sprint 52 seed: publish site-nav/footer/hero/seo PACK_STRING CMS chrome
 * for demo markets when missing. Safe to re-run (skips existing slugs).
 */
import { CmsContentStatus, CmsContentType, PrismaClient } from '@prisma/client';
import {
  DEFAULT_SITE_FOOTER,
  DEFAULT_SITE_HERO,
  DEFAULT_SITE_NAV,
  DEFAULT_SITE_SEO,
  SITE_FOOTER_SLUG,
  SITE_HERO_SLUG,
  SITE_NAV_SLUG,
  SITE_SEO_SLUG,
} from '../packages/shared/src/site-chrome';
import { createHash, randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

function uuidv7(): string {
  const now = Date.now();
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(now, 0, 6);
  randomUUID().replace(/-/g, '').slice(0, 20);
  const rand = createHash('sha1').update(`${now}-${Math.random()}`).digest();
  rand.copy(bytes, 6, 0, 10);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const PACKS = [
  { slug: SITE_NAV_SLUG, title: 'Storefront navigation', summary: 'Primary menu JSON', body: DEFAULT_SITE_NAV },
  { slug: SITE_FOOTER_SLUG, title: 'Storefront footer', summary: 'Footer JSON', body: DEFAULT_SITE_FOOTER },
  { slug: SITE_HERO_SLUG, title: 'Storefront hero', summary: 'Home hero JSON', body: DEFAULT_SITE_HERO },
  { slug: SITE_SEO_SLUG, title: 'Storefront SEO', summary: 'SEO pack JSON', body: DEFAULT_SITE_SEO },
] as const;

async function main() {
  const admin =
    (await prisma.person.findFirst({ where: { identifiers: { some: { type: 'EMAIL', valueNormalized: 'sandbox-admin@dev.local' } } } })) ??
    (await prisma.person.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!admin) {
    throw new Error('No person found to author CMS chrome packs');
  }
  const countries = await prisma.country.findMany({
    where: { isoAlpha2: { in: ['IN', 'AE', 'US', 'XX'] } },
    select: { id: true, isoAlpha2: true },
  });
  let inserted = 0;
  for (const country of countries) {
    for (const pack of PACKS) {
      let item = await prisma.cmsContentItem.findFirst({
        where: { countryId: country.id, slug: pack.slug, locale: 'en' },
      });
      const body = JSON.stringify(pack.body);
      const now = new Date();
      if (!item) {
        const id = uuidv7();
        item = await prisma.cmsContentItem.create({
          data: {
            id,
            countryId: country.id,
            contentType: CmsContentType.PACK_STRING,
            slug: pack.slug,
            locale: 'en',
            status: CmsContentStatus.PUBLISHED,
            categorySlug: 'site-chrome',
            title: pack.title,
            summary: pack.summary,
            body,
            authorPersonId: admin.id,
            publishedVersion: 1,
          },
        });
        inserted += 1;
        console.log(`created ${pack.slug} for ${country.isoAlpha2}`);
      }
      const revision = await prisma.cmsContentRevision.findFirst({ where: { contentItemId: item.id } });
      if (!revision) {
        await prisma.cmsContentRevision.create({
          data: {
            id: uuidv7(),
            contentItemId: item.id,
            revisionNumber: 1,
            title: pack.title,
            summary: pack.summary,
            body,
            createdByPersonId: admin.id,
          },
        });
      }
      const pub = await prisma.cmsContentPublication.findFirst({ where: { contentItemId: item.id } });
      if (!pub) {
        await prisma.cmsContentPublication.create({
          data: {
            id: uuidv7(),
            contentItemId: item.id,
            publicationVersion: Math.max(1, item.publishedVersion || 1),
            revisionNumber: 1,
            title: pack.title,
            summary: pack.summary,
            body,
            publishedByPersonId: admin.id,
            publishedAt: now,
            idempotencyKey: `s52-chrome-${country.isoAlpha2}-${pack.slug}`,
          },
        });
      }
      const search = await prisma.cmsContentSearchDocument.findFirst({
        where: { countryId: country.id, locale: 'en', slug: pack.slug },
      });
      if (!search) {
        await prisma.cmsContentSearchDocument.create({
          data: {
            id: uuidv7(),
            contentItemId: item.id,
            countryId: country.id,
            locale: 'en',
            slug: pack.slug,
            contentType: CmsContentType.PACK_STRING,
            categorySlug: 'site-chrome',
            title: pack.title,
            body,
            published: true,
            publishedAt: now,
          },
        });
      } else if (!search.published || search.contentItemId !== item.id) {
        await prisma.cmsContentSearchDocument.update({
          where: { id: search.id },
          data: {
            contentItemId: item.id,
            contentType: CmsContentType.PACK_STRING,
            title: pack.title,
            body,
            published: true,
            publishedAt: now,
          },
        });
      }
    }
  }
  console.log(`done inserted=${inserted}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
