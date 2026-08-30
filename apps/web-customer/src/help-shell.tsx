'use client';

import Link from 'next/link';
import { useCountries } from '@world-pharma/shell-web';
import { Button, HeaderBar, Heading, Text } from '@world-pharma/ui-kit/web';

export function HelpShell({
  title,
  children,
  backHref = '/help',
}: {
  title: string;
  children: React.ReactNode;
  backHref?: string;
}) {
  const { countries } = useCountries();
  const country = countries[0]?.iso_alpha2 ?? 'XX';
  const locale = 'en';

  return (
    <>
      <HeaderBar title="Help Center" />
      <main className="shell-main">
        <div className="wp-stack">
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href={backHref}>
              <Button variant="secondary" size="sm">
                Back
              </Button>
            </Link>
            <Link href="/help">
              <Button variant="tertiary" size="sm">
                Help home
              </Button>
            </Link>
            <Link href={`/help/search?country=${country}&locale=${locale}`}>
              <Button variant="tertiary" size="sm">
                Search
              </Button>
            </Link>
            <Link href="/">
              <Button variant="tertiary" size="sm">
                Store
              </Button>
            </Link>
          </div>
          <Heading level={1}>{title}</Heading>
          <Text size="caption" tone="secondary">
            Country: {country} · Locale: {locale}
          </Text>
          {children}
        </div>
      </main>
    </>
  );
}
