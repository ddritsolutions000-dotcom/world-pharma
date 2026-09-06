'use client';

import Link from 'next/link';
import { SITE_SERVICES } from '@world-pharma/shared/site-chrome';
import { MgBackLink, ServiceHero } from './ui/mg-ui';

export function ServicesPage() {
  return (
    <div className="mg-page">
      <MgBackLink href="/">← Back to store</MgBackLink>
      <ServiceHero
        kicker="One healthcare account"
        title="Our services"
        subtitle="Medicines, labs, doctors, imaging, and care programs — all in one place."
      />

      <ul className="mg-category-grid">
        {SITE_SERVICES.map((service) => (
          <li key={service.href + service.label}>
            <Link href={service.href} className="mg-category-card">
              <span className="mg-category-card-icon" aria-hidden>
                {service.icon ?? service.label.slice(0, 1)}
              </span>
              <span className="mg-category-card-body">
                <span className="mg-category-card-name">{service.label}</span>
                {service.description ? <span className="mg-category-card-desc">{service.description}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
