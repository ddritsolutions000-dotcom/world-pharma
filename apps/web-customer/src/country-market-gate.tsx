'use client';

import { countryDisplayName, countryFlagEmoji } from './use-selected-country';
import type { CountryOption } from '@world-pharma/shell-web';
import { MgCard, Page, ServiceHero } from './ui/mg-ui';

export function CountryMarketGate({
  countries,
  onSelect,
}: {
  countries: CountryOption[];
  onSelect: (iso: string) => void;
}) {
  return (
    <Page>
      <ServiceHero kicker="Delivery country" title="Choose your market" compact />
      <MgCard className="mg-country-gate">
        <p className="mg-text-muted">
          Prices, taxes, payment methods, and delivery options depend on your country. Select where you are shopping
          before browsing products.
        </p>
        <ul className="mg-country-gate-list" role="list">
          {countries.map((row) => {
            const iso = row.iso_alpha2.toUpperCase();
            return (
              <li key={iso}>
                <button type="button" className="mg-country-gate-option" onClick={() => onSelect(iso)}>
                  <span className="mg-country-gate-flag" aria-hidden>
                    {countryFlagEmoji(iso)}
                  </span>
                  <span>
                    <strong>{countryDisplayName(row)}</strong>
                    <span className="mg-text-muted"> · {iso}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mg-text-muted mg-country-gate-note">
          You can change your market anytime from the header. We never assume a country without your choice.
        </p>
      </MgCard>
    </Page>
  );
}

export function countryGateBlocksCommerce(country: string, needsSelection: boolean): boolean {
  return needsSelection || !country.trim();
}
