'use client';

import {
  DEFAULT_LANDING_DOCUMENT,
  newLandingBlock,
  stringifyLandingDocument,
  type LandingBlock,
  type LandingDocument,
} from '@world-pharma/shared/site-page-blocks';
import { Button, FormField, Heading, Input, Select, Text, TextArea } from '@world-pharma/ui-kit/web';

export function CmsLandingEditor({
  document,
  disabled,
  onChange,
}: {
  document: LandingDocument;
  disabled: boolean;
  onChange: (next: LandingDocument) => void;
}) {
  const setBlock = (index: number, next: LandingBlock) => {
    const blocks = document.blocks.slice();
    blocks[index] = next;
    onChange({ ...document, blocks });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= document.blocks.length) {
      return;
    }
    const blocks = document.blocks.slice();
    const [row] = blocks.splice(index, 1);
    blocks.splice(target, 0, row);
    onChange({ ...document, blocks });
  };

  return (
    <div className="wp-stack">
      <Heading level={3}>Landing blocks</Heading>
      <Text tone="secondary">
        Reusable hero, FAQ, CTA, and banner blocks. No script injection. Publish to appear on customer /l/slug.
      </Text>
      <FormField label="SEO title">
        {({ id }) => (
          <Input
            id={id}
            disabled={disabled}
            value={document.seo.title ?? ''}
            onChange={(event) => onChange({ ...document, seo: { ...document.seo, title: event.target.value } })}
          />
        )}
      </FormField>
      <FormField label="SEO description">
        {({ id }) => (
          <TextArea
            id={id}
            rows={2}
            disabled={disabled}
            value={document.seo.description ?? ''}
            onChange={(event) => onChange({ ...document, seo: { ...document.seo, description: event.target.value } })}
          />
        )}
      </FormField>
      <FormField label="Canonical URL">
        {({ id }) => (
          <Input
            id={id}
            disabled={disabled}
            value={document.seo.canonical ?? ''}
            onChange={(event) => onChange({ ...document, seo: { ...document.seo, canonical: event.target.value } })}
          />
        )}
      </FormField>
      <FormField label="OG image URL">
        {({ id }) => (
          <Input
            id={id}
            disabled={disabled}
            value={document.seo.ogImage ?? ''}
            onChange={(event) => onChange({ ...document, seo: { ...document.seo, ogImage: event.target.value } })}
          />
        )}
      </FormField>
      <label className="wp-text-muted">
        <input
          type="checkbox"
          disabled={disabled}
          checked={document.seo.noindex === true}
          onChange={(event) => onChange({ ...document, seo: { ...document.seo, noindex: event.target.checked } })}
        />{' '}
        noindex this landing page
      </label>
      <FormField label="Go live at (ISO, optional)">
        {({ id }) => (
          <Input
            id={id}
            disabled={disabled}
            placeholder="2026-09-02T09:00:00.000Z"
            value={document.scheduledFrom ?? ''}
            onChange={(event) => onChange({ ...document, scheduledFrom: event.target.value || undefined })}
          />
        )}
      </FormField>
      {document.blocks.map((block, index) => (
        <div key={block.id} className="wp-stack" style={{ border: '1px solid var(--wp-border, #e5e7eb)', padding: 12, borderRadius: 8 }}>
          <Text>
            {block.type} · {block.enabled ? 'on' : 'off'}
          </Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => move(index, -1)}>
              Up
            </Button>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => move(index, 1)}>
              Down
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...document,
                  blocks: document.blocks.map((row, i) => (i === index ? { ...row, enabled: !row.enabled } : row)),
                })
              }
            >
              {block.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...document,
                  blocks: [
                    ...document.blocks.slice(0, index + 1),
                    { ...block, id: `b-${Date.now()}` },
                    ...document.blocks.slice(index + 1),
                  ],
                })
              }
            >
              Duplicate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange({ ...document, blocks: document.blocks.filter((_, i) => i !== index) })
              }
            >
              Delete
            </Button>
          </div>
          {block.type === 'hero' ? (
            <>
              <FormField label="Hero title">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.title} onChange={(e) => setBlock(index, { ...block, title: e.target.value })} />
                )}
              </FormField>
              <FormField label="Hero body">
                {({ id }) => (
                  <TextArea id={id} rows={3} disabled={disabled} value={block.body} onChange={(e) => setBlock(index, { ...block, body: e.target.value })} />
                )}
              </FormField>
              <FormField label="CTA label">
                {({ id }) => (
                  <Input
                    id={id}
                    disabled={disabled}
                    value={block.ctaLabel ?? ''}
                    onChange={(e) => setBlock(index, { ...block, ctaLabel: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="CTA href">
                {({ id }) => (
                  <Input
                    id={id}
                    disabled={disabled}
                    value={block.ctaHref ?? ''}
                    onChange={(e) => setBlock(index, { ...block, ctaHref: e.target.value })}
                  />
                )}
              </FormField>
            </>
          ) : null}
          {block.type === 'rich' ? (
            <FormField label="Copy">
              {({ id }) => (
                <TextArea id={id} rows={6} disabled={disabled} value={block.body} onChange={(e) => setBlock(index, { ...block, body: e.target.value })} />
              )}
            </FormField>
          ) : null}
          {block.type === 'banner' ? (
            <>
              <FormField label="Banner title">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.title} onChange={(e) => setBlock(index, { ...block, title: e.target.value })} />
                )}
              </FormField>
              <FormField label="Banner body">
                {({ id }) => (
                  <TextArea id={id} rows={3} disabled={disabled} value={block.body} onChange={(e) => setBlock(index, { ...block, body: e.target.value })} />
                )}
              </FormField>
              <FormField label="Href">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.href ?? ''} onChange={(e) => setBlock(index, { ...block, href: e.target.value })} />
                )}
              </FormField>
            </>
          ) : null}
          {block.type === 'cta' ? (
            <>
              <FormField label="CTA title">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.title} onChange={(e) => setBlock(index, { ...block, title: e.target.value })} />
                )}
              </FormField>
              <FormField label="CTA label">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.ctaLabel} onChange={(e) => setBlock(index, { ...block, ctaLabel: e.target.value })} />
                )}
              </FormField>
              <FormField label="CTA href">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.ctaHref} onChange={(e) => setBlock(index, { ...block, ctaHref: e.target.value })} />
                )}
              </FormField>
            </>
          ) : null}
          {block.type === 'links' ? (
            <>
              <FormField label="Grid title">
                {({ id }) => (
                  <Input id={id} disabled={disabled} value={block.title} onChange={(e) => setBlock(index, { ...block, title: e.target.value })} />
                )}
              </FormField>
              {block.items.map((item, linkIndex) => (
                <div key={`${block.id}-link-${linkIndex}`} className="wp-form-grid">
                  <FormField label={`Label ${linkIndex + 1}`}>
                    {({ id }) => (
                      <Input
                        id={id}
                        disabled={disabled}
                        value={item.label}
                        onChange={(e) => {
                          const items = block.items.slice();
                          items[linkIndex] = { ...item, label: e.target.value };
                          setBlock(index, { ...block, items });
                        }}
                      />
                    )}
                  </FormField>
                  <FormField label="Href">
                    {({ id }) => (
                      <Input
                        id={id}
                        disabled={disabled}
                        value={item.href}
                        onChange={(e) => {
                          const items = block.items.slice();
                          items[linkIndex] = { ...item, href: e.target.value };
                          setBlock(index, { ...block, items });
                        }}
                      />
                    )}
                  </FormField>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => setBlock(index, { ...block, items: [...block.items, { label: '', href: '/' }] })}
              >
                Add link
              </Button>
            </>
          ) : null}
          {block.type === 'faq' ? (
            <>
              <FormField label="FAQ heading">
                {({ id }) => (
                  <Input
                    id={id}
                    disabled={disabled}
                    value={block.title ?? ''}
                    onChange={(e) => setBlock(index, { ...block, title: e.target.value })}
                  />
                )}
              </FormField>
              {block.items.map((item, faqIndex) => (
                <div key={`${block.id}-faq-${faqIndex}`} className="wp-stack">
                  <FormField label={`Question ${faqIndex + 1}`}>
                    {({ id }) => (
                      <Input
                        id={id}
                        disabled={disabled}
                        value={item.q}
                        onChange={(e) => {
                          const items = block.items.slice();
                          items[faqIndex] = { ...item, q: e.target.value };
                          setBlock(index, { ...block, items });
                        }}
                      />
                    )}
                  </FormField>
                  <FormField label="Answer">
                    {({ id }) => (
                      <TextArea
                        id={id}
                        rows={2}
                        disabled={disabled}
                        value={item.a}
                        onChange={(e) => {
                          const items = block.items.slice();
                          items[faqIndex] = { ...item, a: e.target.value };
                          setBlock(index, { ...block, items });
                        }}
                      />
                    )}
                  </FormField>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => setBlock(index, { ...block, items: [...block.items, { q: '', a: '' }] })}
              >
                Add FAQ
              </Button>
            </>
          ) : null}
        </div>
      ))}
      <FormField label="Add block">
        {({ id }) => (
          <Select
            id={id}
            disabled={disabled}
            defaultValue=""
            onChange={(event) => {
              const type = event.target.value as LandingBlock['type'];
              if (!type) {
                return;
              }
              onChange({ ...document, blocks: [...document.blocks, newLandingBlock(type)] });
              event.target.value = '';
            }}
          >
            <option value="">Choose type…</option>
            <option value="hero">Hero</option>
            <option value="banner">Banner</option>
            <option value="rich">Rich copy</option>
            <option value="faq">FAQ</option>
            <option value="cta">CTA</option>
            <option value="links">Link grid</option>
          </Select>
        )}
      </FormField>
    </div>
  );
}

export function landingBodyOrDefault(body: string): string {
  return body.trim() ? body : stringifyLandingDocument(DEFAULT_LANDING_DOCUMENT);
}
