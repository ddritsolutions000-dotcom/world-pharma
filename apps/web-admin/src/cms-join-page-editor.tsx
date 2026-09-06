'use client';

import {
  DEFAULT_JOIN_HOME_PARTNER_CARDS,
  JOIN_PAGE_DEFAULTS,
  parseJoinPageDocument,
  stringifyJoinPageDocument,
  type JoinPageDocument,
} from '@world-pharma/shared/join-page-blocks';
import { Button, FormField, Heading, Input, Text, TextArea } from '@world-pharma/ui-kit/web';

export function CmsJoinPageEditor({
  slug,
  body,
  disabled,
  onChange,
}: {
  slug: string;
  body: string;
  disabled: boolean;
  onChange: (nextBody: string) => void;
}) {
  const defaults = JOIN_PAGE_DEFAULTS[slug as keyof typeof JOIN_PAGE_DEFAULTS] ?? JOIN_PAGE_DEFAULTS['join-home'];
  const doc: JoinPageDocument = parseJoinPageDocument(body) ?? defaults;
  const partnerCards = doc.partnerCards ?? defaults.partnerCards ?? DEFAULT_JOIN_HOME_PARTNER_CARDS;

  const setDoc = (next: JoinPageDocument) => onChange(stringifyJoinPageDocument(next));

  return (
    <div className="wp-stack">
      <Heading level={3}>Join page blocks</Heading>
      <Text tone="secondary">
        Benefits, onboarding steps, and FAQ for join portal <code>{slug}</code>. Title and summary stay in the fields
        above.
      </Text>

      <FormField label="Optional hero paragraph (heroExtra)">
        {({ id }) => (
          <TextArea
            id={id}
            value={doc.heroExtra ?? ''}
            disabled={disabled}
            onChange={(event) => setDoc({ ...doc, heroExtra: event.target.value })}
          />
        )}
      </FormField>

      {slug === 'join-home' ? (
        <>
          <Heading level={4}>Partner type cards</Heading>
          <Text tone="secondary">Cards on the join homepage “Choose your partner type” grid.</Text>
          {partnerCards.map((row, index) => (
            <div key={`partner-${index}`} className="wp-stack">
              <FormField label={`Card ${index + 1} title`}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={row.title}
                    disabled={disabled}
                    onChange={(event) => {
                      const cards = partnerCards.slice();
                      cards[index] = { ...row, title: event.target.value };
                      setDoc({ ...doc, partnerCards: cards });
                    }}
                  />
                )}
              </FormField>
              <FormField label="Link path">
                {({ id }) => (
                  <Input
                    id={id}
                    value={row.href}
                    disabled={disabled}
                    onChange={(event) => {
                      const cards = partnerCards.slice();
                      cards[index] = { ...row, href: event.target.value };
                      setDoc({ ...doc, partnerCards: cards });
                    }}
                  />
                )}
              </FormField>
              <FormField label="Icon (emoji)">
                {({ id }) => (
                  <Input
                    id={id}
                    value={row.icon}
                    disabled={disabled}
                    onChange={(event) => {
                      const cards = partnerCards.slice();
                      cards[index] = { ...row, icon: event.target.value };
                      setDoc({ ...doc, partnerCards: cards });
                    }}
                  />
                )}
              </FormField>
              <FormField label="Body">
                {({ id }) => (
                  <TextArea
                    id={id}
                    value={row.body}
                    disabled={disabled}
                    onChange={(event) => {
                      const cards = partnerCards.slice();
                      cards[index] = { ...row, body: event.target.value };
                      setDoc({ ...doc, partnerCards: cards });
                    }}
                  />
                )}
              </FormField>
              {!disabled ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() =>
                    setDoc({
                      ...doc,
                      partnerCards: partnerCards.map((card, i) =>
                        i === index ? { ...card, enabled: card.enabled === false ? true : false } : card,
                      ),
                    })
                  }
                >
                  {row.enabled === false ? 'Enable card' : 'Disable card'}
                </Button>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      <Heading level={4}>Benefits</Heading>
      {doc.benefits.map((row, index) => (
        <div key={`benefit-${index}`} className="wp-stack">
          <FormField label={`Benefit ${index + 1} title`}>
            {({ id }) => (
              <Input
                id={id}
                value={row.title}
                disabled={disabled}
                onChange={(event) => {
                  const benefits = doc.benefits.slice();
                  benefits[index] = { ...row, title: event.target.value };
                  setDoc({ ...doc, benefits });
                }}
              />
            )}
          </FormField>
          <FormField label="Body">
            {({ id }) => (
              <TextArea
                id={id}
                value={row.body}
                disabled={disabled}
                onChange={(event) => {
                  const benefits = doc.benefits.slice();
                  benefits[index] = { ...row, body: event.target.value };
                  setDoc({ ...doc, benefits });
                }}
              />
            )}
          </FormField>
          {!disabled ? (
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => setDoc({ ...doc, benefits: doc.benefits.filter((_, i) => i !== index) })}
            >
              Remove benefit
            </Button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setDoc({
              ...doc,
              benefits: [...doc.benefits, { title: 'New benefit', body: 'Describe the partner value.' }],
            })
          }
        >
          Add benefit
        </Button>
      ) : null}

      <Heading level={4}>Onboarding steps</Heading>
      {doc.steps.map((step, index) => (
        <div key={`step-${index}`} className="wp-toolbar">
          <Input
            aria-label={`Step ${index + 1}`}
            value={step}
            disabled={disabled}
            onChange={(event) => {
              const steps = doc.steps.slice();
              steps[index] = event.target.value;
              setDoc({ ...doc, steps });
            }}
          />
          {!disabled ? (
            <Button size="sm" variant="tertiary" onClick={() => setDoc({ ...doc, steps: doc.steps.filter((_, i) => i !== index) })}>
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <Button size="sm" variant="secondary" onClick={() => setDoc({ ...doc, steps: [...doc.steps, 'New step'] })}>
          Add step
        </Button>
      ) : null}

      <Heading level={4}>FAQ</Heading>
      {doc.faq.map((row, index) => (
        <div key={`faq-${index}`} className="wp-stack">
          <FormField label="Question">
            {({ id }) => (
              <Input
                id={id}
                value={row.q}
                disabled={disabled}
                onChange={(event) => {
                  const faq = doc.faq.slice();
                  faq[index] = { ...row, q: event.target.value };
                  setDoc({ ...doc, faq });
                }}
              />
            )}
          </FormField>
          <FormField label="Answer">
            {({ id }) => (
              <TextArea
                id={id}
                value={row.a}
                disabled={disabled}
                onChange={(event) => {
                  const faq = doc.faq.slice();
                  faq[index] = { ...row, a: event.target.value };
                  setDoc({ ...doc, faq });
                }}
              />
            )}
          </FormField>
          {!disabled ? (
            <Button size="sm" variant="tertiary" onClick={() => setDoc({ ...doc, faq: doc.faq.filter((_, i) => i !== index) })}>
              Remove FAQ
            </Button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDoc({ ...doc, faq: [...doc.faq, { q: 'New question', a: 'Answer text' }] })}
        >
          Add FAQ
        </Button>
      ) : null}
    </div>
  );
}
