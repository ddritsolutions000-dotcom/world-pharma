'use client';

import { Text } from '@world-pharma/ui-kit/web';
import { MgCard, Section } from './ui/mg-ui';

export type SpecialtyGuideItem = {
  title: string;
  body: string;
};

/** Honest first-visit framing — no stats, claims, or invented availability. */
export function SpecialtyLandingGuide({
  title = 'At a glance',
  items,
}: {
  title?: string;
  items: SpecialtyGuideItem[];
}) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <ul className="mg-landing-guide">
        {items.map((item) => (
          <li key={item.title}>
            <MgCard className="mg-landing-guide-card">
              <strong className="mg-landing-guide-title">{item.title}</strong>
              <Text size="caption" tone="secondary">
                {item.body}
              </Text>
            </MgCard>
          </li>
        ))}
      </ul>
    </Section>
  );
}
