export const PAGE_HERO: Record<string, string> = {
  'about-worldpharma':
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1400&q=80',
  'privacy-policy':
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80',
  'terms-and-conditions':
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1400&q=80',
  'return-policy':
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80',
  'careers-at-worldpharma':
    'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=80',
};

export const ABOUT_GALLERY = [
  {
    src: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=80',
    label: 'Licensed pharmacy partners',
  },
  {
    src: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80',
    label: 'Labs & home collection',
  },
  {
    src: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=800&q=80',
    label: 'Online doctor consults',
  },
] as const;

export function pageHeroImage(slug: string): string | null {
  return PAGE_HERO[slug] ?? null;
}
