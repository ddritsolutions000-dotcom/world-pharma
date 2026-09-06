import { sanitizeHref } from './site-chrome';

export type LandingSeo = {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
};

export type LandingBlock =
  | {
      id: string;
      enabled: boolean;
      type: 'hero';
      title: string;
      body: string;
      ctaLabel?: string;
      ctaHref?: string;
      imageUrl?: string;
    }
  | {
      id: string;
      enabled: boolean;
      type: 'rich';
      body: string;
    }
  | {
      id: string;
      enabled: boolean;
      type: 'faq';
      title?: string;
      items: Array<{ q: string; a: string }>;
    }
  | {
      id: string;
      enabled: boolean;
      type: 'cta';
      title: string;
      body?: string;
      ctaLabel: string;
      ctaHref: string;
    }
  | {
      id: string;
      enabled: boolean;
      type: 'banner';
      title: string;
      body: string;
      href?: string;
    }
  | {
      id: string;
      enabled: boolean;
      type: 'links';
      title: string;
      items: Array<{ label: string; href: string }>;
    };

export type LandingDocument = {
  version: 1;
  seo: LandingSeo;
  scheduledFrom?: string;
  blocks: LandingBlock[];
};

function clip(raw: unknown, max: number): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().slice(0, max);
}

function asId(raw: unknown, fallback: string): string {
  const id = clip(raw, 80);
  return id || fallback;
}

function parseFaqItems(raw: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const item = row as Record<string, unknown>;
      const q = clip(item.q, 400);
      const a = clip(item.a, 4000);
      if (!q || !a) {
        return null;
      }
      return { q, a };
    })
    .filter((row): row is { q: string; a: string } => Boolean(row));
}

function parseBlock(raw: unknown, index: number): LandingBlock | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const id = asId(row.id, `block-${index}`);
  const enabled = row.enabled !== false;
  const type = row.type;
  if (type === 'hero') {
    const title = clip(row.title, 200);
    if (!title) {
      return null;
    }
    const ctaHref = sanitizeHref(row.ctaHref) ?? undefined;
    const imageUrl = sanitizeHref(row.imageUrl) ?? undefined;
    return {
      id,
      enabled,
      type: 'hero',
      title,
      body: clip(row.body, 4000),
      ctaLabel: clip(row.ctaLabel, 80) || undefined,
      ctaHref,
      imageUrl,
    };
  }
  if (type === 'rich') {
    return { id, enabled, type: 'rich', body: clip(row.body, 20000) };
  }
  if (type === 'faq') {
    return {
      id,
      enabled,
      type: 'faq',
      title: clip(row.title, 200) || undefined,
      items: parseFaqItems(row.items),
    };
  }
  if (type === 'cta') {
    const title = clip(row.title, 200);
    const ctaLabel = clip(row.ctaLabel, 80);
    const ctaHref = sanitizeHref(row.ctaHref);
    if (!title || !ctaLabel || !ctaHref) {
      return null;
    }
    return { id, enabled, type: 'cta', title, body: clip(row.body, 2000) || undefined, ctaLabel, ctaHref };
  }
  if (type === 'banner') {
    const title = clip(row.title, 200);
    if (!title) {
      return null;
    }
    return {
      id,
      enabled,
      type: 'banner',
      title,
      body: clip(row.body, 2000),
      href: sanitizeHref(row.href) ?? undefined,
    };
  }
  if (type === 'links') {
    const title = clip(row.title, 200);
    if (!title) {
      return null;
    }
    const items = Array.isArray(row.items)
      ? row.items
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }
            const rec = item as Record<string, unknown>;
            const href = sanitizeHref(rec.href);
            const label = clip(rec.label, 80);
            if (!href || !label) {
              return null;
            }
            return { label, href };
          })
          .filter((item): item is { label: string; href: string } => Boolean(item))
          .slice(0, 24)
      : [];
    return { id, enabled, type: 'links', title, items };
  }
  return null;
}

export const DEFAULT_LANDING_DOCUMENT: LandingDocument = {
  version: 1,
  seo: {},
  blocks: [
    {
      id: 'hero-1',
      enabled: true,
      type: 'hero',
      title: 'New landing page',
      body: 'Publish from Main Admin. This copy is editable without a code change.',
      ctaLabel: 'Shop medicines',
      ctaHref: '/',
    },
    {
      id: 'faq-1',
      enabled: true,
      type: 'faq',
      title: 'Questions',
      items: [{ q: 'Can operators edit this later?', a: 'Yes. Open CMS, edit blocks, then publish.' }],
    },
  ],
};

export function stringifyLandingDocument(doc: LandingDocument): string {
  return JSON.stringify(doc);
}

export function parseLandingDocument(body: string | null | undefined): LandingDocument | null {
  if (!body || !body.trim().startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.blocks)) {
      return null;
    }
    const seoRaw = parsed.seo && typeof parsed.seo === 'object' ? (parsed.seo as Record<string, unknown>) : {};
    const canonical = sanitizeHref(seoRaw.canonical);
    const ogImage = sanitizeHref(seoRaw.ogImage);
    const seo: LandingSeo = {
      title: clip(seoRaw.title, 200) || undefined,
      description: clip(seoRaw.description, 500) || undefined,
      canonical: canonical && (canonical.startsWith('/') || canonical.startsWith('http')) ? canonical : undefined,
      noindex: seoRaw.noindex === true,
      ogTitle: clip(seoRaw.ogTitle, 200) || undefined,
      ogDescription: clip(seoRaw.ogDescription, 500) || undefined,
      ogImage: ogImage || undefined,
    };
    const scheduledFrom = clip(parsed.scheduledFrom, 40) || undefined;
    const blocks = parsed.blocks
      .map((row, index) => parseBlock(row, index))
      .filter((row): row is LandingBlock => Boolean(row));
    return { version: 1, seo, scheduledFrom, blocks };
  } catch {
    return null;
  }
}

export function landingIsLive(doc: LandingDocument, now = Date.now()): boolean {
  if (!doc.scheduledFrom) {
    return true;
  }
  const at = Date.parse(doc.scheduledFrom);
  if (Number.isNaN(at)) {
    return true;
  }
  return now >= at;
}

export function newLandingBlock(type: LandingBlock['type']): LandingBlock {
  const id = `b-${Date.now()}`;
  if (type === 'hero') {
    return { id, enabled: true, type, title: 'Headline', body: '', ctaLabel: 'Learn more', ctaHref: '/' };
  }
  if (type === 'rich') {
    return { id, enabled: true, type, body: '' };
  }
  if (type === 'faq') {
    return { id, enabled: true, type, title: 'FAQ', items: [{ q: '', a: '' }] };
  }
  if (type === 'cta') {
    return { id, enabled: true, type, title: 'Call to action', ctaLabel: 'Continue', ctaHref: '/' };
  }
  if (type === 'links') {
    return { id, enabled: true, type, title: 'Explore', items: [{ label: 'Medicines', href: '/c/medicines' }] };
  }
  return { id, enabled: true, type: 'banner', title: 'Promotion', body: '', href: '/' };
}
