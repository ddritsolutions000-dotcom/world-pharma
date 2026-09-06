import { Card, Heading, Text } from '@world-pharma/ui-kit/web';
import type { JoinBenefit, JoinFaqItem } from '@world-pharma/shared/join-page-blocks';

export function JoinBenefitsSection(props: {
  title: string;
  benefits: JoinBenefit[];
}) {
  if (!props.benefits.length) {
    return null;
  }
  return (
    <section>
      <Heading level={2}>{props.title}</Heading>
      <div className="join-grid">
        {props.benefits.map((item) => (
          <Card key={item.title}>
            <Heading level={3}>{item.title}</Heading>
            <Text tone="secondary">{item.body}</Text>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function JoinStepsSection(props: { title: string; steps: string[] }) {
  if (!props.steps.length) {
    return null;
  }
  return (
    <section>
      <Heading level={2}>{props.title}</Heading>
      <ol className="join-steps">
        {props.steps.map((step) => (
          <li key={step}>
            <Text>{step}</Text>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function JoinFaqSection(props: { title?: string; faq: JoinFaqItem[] }) {
  if (!props.faq.length) {
    return null;
  }
  return (
    <section>
      <Heading level={2}>{props.title ?? 'FAQs'}</Heading>
      <div className="wp-stack">
        {props.faq.map((item) => (
          <Card key={item.q}>
            <Heading level={3}>{item.q}</Heading>
            <Text tone="secondary">{item.a}</Text>
          </Card>
        ))}
      </div>
    </section>
  );
}
