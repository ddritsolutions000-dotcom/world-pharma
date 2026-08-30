'use client';

import { Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';

export function GovernancePlaceholder(props: { title: string; description: string }) {
  return (
    <section className="wp-stack">
      <Heading level={2}>{props.title}</Heading>
      <Text tone="secondary">
        Company control-plane boundary only. This is not a finished ERP module.
      </Text>
      <Card>
        <EmptyState title="Foundation" description={props.description} />
      </Card>
    </section>
  );
}
