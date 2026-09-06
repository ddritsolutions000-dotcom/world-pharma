import Link from 'next/link';
import { landingIsLive, parseLandingDocument, type LandingBlock, type LandingDocument } from '@world-pharma/shared/site-page-blocks';
import { MgCard } from './ui/mg-ui';

function BlockView({ block }: { block: LandingBlock }) {
  if (!block.enabled) {
    return null;
  }
  if (block.type === 'hero') {
    return (
      <section className="mg-landing-hero">
        <h2>{block.title}</h2>
        {block.body ? <p>{block.body}</p> : null}
        {block.ctaLabel && block.ctaHref ? (
          <Link className="mg-btn-primary" href={block.ctaHref}>
            {block.ctaLabel}
          </Link>
        ) : null}
      </section>
    );
  }
  if (block.type === 'banner') {
    const inner = (
      <>
        <h3>{block.title}</h3>
        {block.body ? <p>{block.body}</p> : null}
      </>
    );
    return (
      <section className="mg-landing-banner">
        {block.href ? <Link href={block.href}>{inner}</Link> : inner}
      </section>
    );
  }
  if (block.type === 'rich') {
    return (
      <div className="mg-prose">
        {block.body.split(/\n\n+/).filter(Boolean).map((para) => (
          <p key={para.slice(0, 24)}>{para}</p>
        ))}
      </div>
    );
  }
  if (block.type === 'faq') {
    return (
      <section className="mg-landing-faq">
        {block.title ? <h3>{block.title}</h3> : null}
        {block.items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>
    );
  }
  if (block.type === 'links') {
    return (
      <section className="mg-landing-links">
        <h3>{block.title}</h3>
        <ul className="mg-order-list">
          {block.items.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="mg-landing-cta">
      <h3>{block.title}</h3>
      {block.body ? <p>{block.body}</p> : null}
      <Link className="mg-btn-primary" href={block.ctaHref}>
        {block.ctaLabel}
      </Link>
    </section>
  );
}

export function LandingBlocks({ document }: { document: LandingDocument }) {
  if (!landingIsLive(document)) {
    return null;
  }
  return (
    <div className="mg-landing-stack">
      {document.blocks.map((block) => (
        <MgCard key={block.id} flat>
          <BlockView block={block} />
        </MgCard>
      ))}
    </div>
  );
}

export function tryParseLiveLanding(body: string | undefined): LandingDocument | null {
  const parsed = parseLandingDocument(body);
  if (!parsed || !landingIsLive(parsed)) {
    return null;
  }
  return parsed;
}
