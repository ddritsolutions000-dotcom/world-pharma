'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Button,
  Card,
  FormField,
  Heading,
  Input,
  Text,
} from '@world-pharma/ui-kit/web';

export type AnalyticsScopeProps = {
  countryCode: string;
  from: string;
  to: string;
  onCountryCodeChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onRefresh: () => void;
};

const VIEWS = [
  { href: '/analytics', label: 'Overview' },
  { href: '/analytics/commerce', label: 'Commerce' },
  { href: '/analytics/marketing', label: 'Marketing' },
] as const;

export function AnalyticsScopeBar({
  countryCode,
  from,
  to,
  onCountryCodeChange,
  onFromChange,
  onToChange,
  onRefresh,
}: AnalyticsScopeProps) {
  const pathname = usePathname();

  return (
    <div className="wp-stack">
      <Heading level={1}>Analytics</Heading>
      <Text tone="secondary">
        Operational commerce and marketing rollups only. Country-scoped, non-clinical aggregates from R13-E.
      </Text>

      <nav aria-label="Analytics views" className="wp-stack">
        <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: 0, margin: 0 }}>
          {VIEWS.map((view) => {
            const active = pathname === view.href;
            return (
              <li key={view.href}>
                <Link
                  href={view.href}
                  aria-current={active ? 'page' : undefined}
                  style={{ fontWeight: active ? 600 : 400 }}
                >
                  {view.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Card>
        <div className="wp-stack">
          <FormField label="Country code" hint="Two-letter ISO country scope for analytics reads">
            {({ id }) => (
              <Input
                id={id}
                value={countryCode}
                maxLength={2}
                autoComplete="off"
                onChange={(e) => onCountryCodeChange(e.target.value.toUpperCase())}
              />
            )}
          </FormField>
          <FormField label="From (UTC date)">
            {({ id }) => (
              <Input id={id} type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
            )}
          </FormField>
          <FormField label="To (UTC date)">
            {({ id }) => <Input id={id} type="date" value={to} onChange={(e) => onToChange(e.target.value)} />}
          </FormField>
          <Button onClick={onRefresh}>Refresh</Button>
        </div>
      </Card>
    </div>
  );
}
