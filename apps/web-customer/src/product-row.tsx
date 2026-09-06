'use client';

import type { CatalogCard } from './store-api';
import { ProductCard } from './product-card';
import { Section } from './ui/mg-ui';

export function ProductRow({
  title,
  items,
  seeAllHref,
}: {
  title: string;
  items: CatalogCard[];
  seeAllHref?: string;
}) {
  if (!items.length) return null;
  return (
    <Section title={title} seeAllHref={seeAllHref}>
      <ul className="mg-product-row">
        {items.map((item) => (
          <li key={item.id}>
            <ProductCard item={item} compact />
          </li>
        ))}
      </ul>
    </Section>
  );
}
