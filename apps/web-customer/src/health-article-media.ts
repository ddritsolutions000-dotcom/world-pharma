/** Demo/editorial hero images for health blog cards (Unsplash). */

const BY_SLUG: Record<string, string> = {
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

const BY_CATEGORY: Record<string, string> = {
  diseases: BY_SLUG['understanding-diabetes'],
  wellness: BY_SLUG['heart-health-tips'],
  nutrition: BY_SLUG['immune-boosting-foods'],
  'mental-health': BY_SLUG['stress-management'],
  'lab-tests': BY_SLUG['thyroid-tests-explained'],
  parenting: BY_SLUG['pregnancy-lab-essentials'],
  blog: BY_SLUG['health-tips-seasonal'],
  medicines: BY_SLUG['fever-and-infection-care'],
};

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80';

export function healthArticleImage(slug: string, category?: string | null): string {
  return BY_SLUG[slug] ?? (category ? BY_CATEGORY[category] : undefined) ?? DEFAULT_IMAGE;
}
