'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, FormField, Heading, Input, Select } from '@world-pharma/ui-kit/web';
import { MARKET_COUNTRY_CODES, workingCountry } from './working-country';

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
      <header className="wp-page-header">
        <Heading level={1}>Analytics</Heading>
        <p className="wp-page-intro">
          Operational commerce and marketing rollups only. Country-scoped, non-clinical aggregates from R13-E.
        </p>
      </header>

      <nav aria-label="Analytics views" className="wp-toolbar">
        {VIEWS.map((view) => {
          const active = pathname === view.href;
          return (
            <Link key={view.href} href={view.href} aria-current={active ? 'page' : undefined}>
              <Button size="sm" variant={active ? 'primary' : 'secondary'}>
                {view.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="wp-toolbar">
        <FormField label="Country" hint="Sandbox markets only — no silent India default">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Country code"
              value={workingCountry(countryCode)}
              onChange={(e) => onCountryCodeChange(workingCountry(e.target.value))}
            >
              <option value="">Select market…</option>
              {MARKET_COUNTRY_CODES.map((iso) => (
                <option key={iso} value={iso}>
                  {iso}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="From (UTC date)">
          {({ id }) => <Input id={id} type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />}
        </FormField>
        <FormField label="To (UTC date)">
          {({ id }) => <Input id={id} type="date" value={to} onChange={(e) => onToChange(e.target.value)} />}
        </FormField>
        <Button onClick={onRefresh}>Refresh</Button>
      </div>
    </div>
  );
}
