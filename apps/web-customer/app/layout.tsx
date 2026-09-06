import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '../src/providers';
import { CustomerLayout } from '../src/customer-layout';
import { loadPublishedSeo } from '../src/load-published-seo';
import '../src/ui/theme.css';
import '../src/shell.css';
import '../src/store.css';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await loadPublishedSeo();
  return {
    title: seo.siteTitle,
    description: seo.defaultDescription,
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const seo = await loadPublishedSeo();
  const jsonLd =
    seo.organizationName && seo.organizationUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: seo.organizationName,
          url: seo.organizationUrl,
          description: seo.defaultDescription,
        }
      : null;

  return (
    <html lang="en" data-theme="light" className="mg-customer-site">
      <body>
        {jsonLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        ) : null}
        <AppProviders>
          <CustomerLayout>{children}</CustomerLayout>
        </AppProviders>
      </body>
    </html>
  );
}
