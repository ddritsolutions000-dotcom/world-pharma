import { Injectable } from '@nestjs/common';
import { CmsContentStatus, CmsContentType, Prisma } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { requireCountryCode } from '../catalog/catalog-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const HEALTH_ARTICLE_FALLBACK = [
  {
    id: 'fallback-diabetes',
    slug: 'understanding-diabetes',
    title: 'Understanding diabetes: symptoms, tests, and daily care',
    summary: 'How HbA1c, medicines, and lifestyle work together — plus when to see a doctor.',
    category: 'diseases',
    body: 'Diabetes needs a clinician for diagnosis. This guide covers warning signs, common lab tests (fasting glucose, HbA1c), and how WorldPharma helps with medicines, home collection, and consults. Always follow your doctor’s advice.',
    locale: 'en',
  },
  {
    id: 'fallback-heart',
    slug: 'heart-health-tips',
    title: 'Heart health: lipids, BP, and when to book a checkup',
    summary: 'Practical steps for blood pressure, cholesterol tests, and cardiology consults.',
    category: 'wellness',
    body: 'Keep a record of BP readings, know your lipid panel, and book a full body checkup if you have family history. Use lab home collection and online consults when you cannot visit a clinic.',
    locale: 'en',
  },
  {
    id: 'fallback-immunity',
    slug: 'immune-boosting-foods',
    title: 'Immunity, vitamins, and winter wellness',
    summary: 'Food, Vitamin D, and when a deficiency test is worth booking.',
    category: 'nutrition',
    body: 'Diet comes first. Vitamin D and B12 tests are common in winter. Pair OTC vitamins with a published lab offer and talk to a pharmacist or GP if you take other medicines.',
    locale: 'en',
  },
  {
    id: 'fallback-stress',
    slug: 'stress-management',
    title: 'Stress, sleep, and mental wellness support',
    summary: 'Simple routines plus when to book a psychiatrist or counsellor consult.',
    category: 'mental-health',
    body: 'Sleep, movement, and limits on caffeine help. If mood or anxiety lasts more than two weeks, book a mental health consult. This is education, not a crisis service.',
    locale: 'en',
  },
  {
    id: 'fallback-thyroid',
    slug: 'thyroid-tests-explained',
    title: 'Thyroid tests: TSH, T3, T4 and when to consult',
    summary: 'What a thyroid panel covers and how to book home collection.',
    category: 'lab-tests',
    body: 'TSH is the usual first test. Abnormal results need a clinician. Book a thyroid profile on WorldPharma, upload prior reports, and use a consult if symptoms persist.',
    locale: 'en',
  },
  {
    id: 'fallback-fever',
    slug: 'fever-and-infection-care',
    title: 'Fever, dengue, and infection workups',
    summary: 'When to test, hydrate, and see a doctor — not a substitute for emergency care.',
    category: 'diseases',
    body: 'High fever with bleeding, breathlessness, or confusion needs emergency care. For milder illness, a doctor may order CBC, dengue NS1, or malaria tests. Use home collection when you cannot travel.',
    locale: 'en',
  },
  {
    id: 'fallback-pregnancy',
    slug: 'pregnancy-lab-essentials',
    title: 'Pregnancy care: common labs and supplements',
    summary: 'Typical prenatal tests and how to order OTC vitamins with medical advice.',
    category: 'parenting',
    body: 'Prenatal care is clinician-led. Common labs include CBC, TSH, and glucose screening. Pair prescribed medicines with a valid Rx upload. Educational content only.',
    locale: 'en',
  },
] as const;

const HEALTH_CATEGORY_SLUGS = [
  'medicines',
  'diseases',
  'lab-tests',
  'wellness',
  'nutrition',
  'first-aid',
  'parenting',
  'mental-health',
  'ayurveda',
  'homeopathy',
  'blog',
] as const;

function articleImageUrl(slug: string, category?: string | null) {
  const bySlug: Record<string, string> = {
    'understanding-diabetes':
      'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80',
    'heart-health-tips':
      'https://images.unsplash.com/photo-1505751172876-fa1923c5c738?auto=format&fit=crop&w=1200&q=80',
    'immune-boosting-foods':
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=80',
    'stress-management':
      'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80',
    'thyroid-tests-explained':
      'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80',
    'fever-and-infection-care':
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80',
    'pregnancy-lab-essentials':
      'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=1200&q=80',
    'health-tips-seasonal':
      'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80',
    'vitamin-d-benefits':
      'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?auto=format&fit=crop&w=1200&q=80',
  };
  const byCategory: Record<string, string> = {
    diseases: bySlug['understanding-diabetes'],
    wellness: bySlug['heart-health-tips'],
    nutrition: bySlug['immune-boosting-foods'],
    'mental-health': bySlug['stress-management'],
    'lab-tests': bySlug['thyroid-tests-explained'],
    parenting: bySlug['pregnancy-lab-essentials'],
    blog: bySlug['health-tips-seasonal'],
    medicines: bySlug['fever-and-infection-care'],
  };
  return (
    bySlug[slug] ??
    (category ? byCategory[category] : undefined) ??
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80'
  );
}

function presentFallback(row: (typeof HEALTH_ARTICLE_FALLBACK)[number], includeBody = false) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    image_url: articleImageUrl(row.slug, row.category),
    published_at: new Date().toISOString(),
    locale: row.locale,
    ...(includeBody ? { body: row.body } : {}),
  };
}

/**
 * 1mg-style health content service
 * Provides customer-facing health information, articles, and medical guides
 */
@Injectable()
export class HealthContentService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCountry(code: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: code.toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country is not available.');
    }
    return country;
  }

  /**
   * Get health articles with filtering (1mg-style)
   */
  async listHealthArticles(
    principal: Principal | null,
    query: {
      country_code?: string;
      category?: string;
      search?: string;
      limit?: number;
    }
  ) {
    const country = await this.resolveCountry(requireCountryCode(query.country_code));
    const limit = Math.min(50, Math.max(1, query.limit || 20));

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const where: Prisma.CmsContentItemWhereInput = {
          countryId: country.id,
          status: CmsContentStatus.PUBLISHED,
          contentType: CmsContentType.ARTICLE,
        };

        if (query.category) {
          where.categorySlug = query.category;
        } else {
          where.categorySlug = { in: [...HEALTH_CATEGORY_SLUGS] };
        }

        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { summary: { contains: query.search, mode: 'insensitive' } },
            { body: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const items = await this.prisma.cmsContentItem.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            categorySlug: true,
            createdAt: true,
            locale: true,
          },
        });

        const articles = items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          category: item.categorySlug,
          image_url: articleImageUrl(item.slug, item.categorySlug),
          published_at: item.createdAt.toISOString(),
          locale: item.locale,
        }));
        if (!articles.length && !query.search && !query.category) {
          return {
            articles: HEALTH_ARTICLE_FALLBACK.map((row) => presentFallback(row)),
            pagination: { limit, total: HEALTH_ARTICLE_FALLBACK.length },
          };
        }
        return {
          articles,
          pagination: {
            limit,
            total: articles.length,
          },
        };
      }
    );
  }

  /**
   * Get health article by slug (1mg-style detailed view)
   */
  async getHealthArticle(
    principal: Principal | null,
    slug: string,
    countryCode?: string
  ) {
    const country = await this.resolveCountry(requireCountryCode(countryCode));

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const item = await this.prisma.cmsContentItem.findFirst({
          where: {
            countryId: country.id,
            slug,
            status: CmsContentStatus.PUBLISHED,
            contentType: CmsContentType.ARTICLE,
          },
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            body: true,
            categorySlug: true,
            createdAt: true,
            locale: true,
          },
        });

        if (!item) {
          const fallback = HEALTH_ARTICLE_FALLBACK.find((row) => row.slug === slug);
          if (fallback) {
            return presentFallback(fallback, true);
          }
          throw Errors.notFound('Health article not found');
        }

        return {
          id: item.id,
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          body: item.body,
          category: item.categorySlug,
          image_url: articleImageUrl(item.slug, item.categorySlug),
          published_at: item.createdAt.toISOString(),
          locale: item.locale,
        };
      }
    );
  }

  /**
   * Get health categories (1mg-style categories)
   */
  async getHealthCategories() {
    const categories = [
      { slug: 'medicines', name: 'Medicines', description: 'Information about medicines, uses, side effects' },
      { slug: 'diseases', name: 'Diseases', description: 'Disease information, symptoms, treatments' },
      { slug: 'lab-tests', name: 'Lab Tests', description: 'Lab test information, preparation, results' },
      { slug: 'wellness', name: 'Wellness', description: 'Health tips, nutrition, fitness' },
      { slug: 'nutrition', name: 'Nutrition', description: 'Diet, supplements, vitamins' },
      { slug: 'first-aid', name: 'First Aid', description: 'Emergency care and first aid' },
      { slug: 'parenting', name: 'Parenting', description: 'Child health, parenting tips' },
      { slug: 'mental-health', name: 'Mental Health', description: 'Mental wellness, stress management' },
      { slug: 'ayurveda', name: 'Ayurveda', description: 'Ayurvedic medicine and remedies' },
      { slug: 'homeopathy', name: 'Homeopathy', description: 'Homeopathic treatments' },
    ];

    return { categories };
  }

  /**
   * Search health content (1mg-style search)
   */
  async searchHealthContent(
    principal: Principal | null,
    query: string,
    countryCode?: string,
    limit: number = 10
  ) {
    if (!query || query.trim().length < 2) {
      return { query, results: [] };
    }

    const country = await this.resolveCountry(requireCountryCode(countryCode));
    const parsedLimit = Math.min(20, Math.max(1, limit));

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const items = await this.prisma.cmsContentItem.findMany({
          where: {
            countryId: country.id,
            status: CmsContentStatus.PUBLISHED,
            contentType: CmsContentType.ARTICLE,
            categorySlug: { in: [...HEALTH_CATEGORY_SLUGS] },
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { summary: { contains: query, mode: 'insensitive' } },
              { body: { contains: query, mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: parsedLimit,
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            categorySlug: true,
            createdAt: true,
          },
        });

        return {
          query,
          results: items.map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            summary: item.summary,
            category: item.categorySlug,
            image_url: articleImageUrl(item.slug, item.categorySlug),
            published_at: item.createdAt.toISOString(),
          })),
        };
      }
    );
  }

  /**
   * Get featured health articles (1mg-style homepage)
   */
  async getFeaturedArticles(principal: Principal | null, countryCode?: string) {
    const country = await this.resolveCountry(requireCountryCode(countryCode));

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        const items = await this.prisma.cmsContentItem.findMany({
          where: {
            countryId: country.id,
            status: CmsContentStatus.PUBLISHED,
            contentType: CmsContentType.ARTICLE,
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            categorySlug: true,
            createdAt: true,
          },
        });

        const featured = items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          category: item.categorySlug,
          image_url: articleImageUrl(item.slug, item.categorySlug),
          published_at: item.createdAt.toISOString(),
        }));
        return {
          featured: featured.length ? featured : HEALTH_ARTICLE_FALLBACK.map((row) => presentFallback(row)),
        };
      }
    );
  }
}
