'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { addCartItem, notifyCartChanged } from './commerce-api';
import { addGuestCartLine } from './guest-cart';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, Section } from './ui/mg-ui';

type Substitute = {
  id: string;
  slug: string;
  name: string;
  brand?: string | null;
  savings_percent?: number | null;
  is_generic?: boolean;
  offer_id?: string | null;
  sell_minor?: string | null;
  currency?: string | null;
  original_price?: number | null;
  image_url?: string | null;
};

const PLACEHOLDER = 'https://placehold.co/200x200/F7FAFC/1A365D/png?text=Medicine';

const MARKET_CURRENCY: Record<string, string> = { IN: 'INR', AE: 'AED', US: 'USD' };

function savingsLabel(percent: number | null | undefined): number | null {
  if (percent == null || !Number.isFinite(percent) || percent <= 0) return null;
  return Math.round(percent);
}

export function MedicineSubstitutesSection({
  itemId,
  itemName,
  images,
}: {
  itemId: string;
  itemName: string;
  images?: Map<string, string>;
}) {
  const { country } = useSelectedCountry();
  const { session, getAccessToken } = useSession();
  const [substitutes, setSubstitutes] = useState<Substitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
    void fetch(
      `${base}/api/v1/public/catalog/items/${encodeURIComponent(itemId)}/substitutes?country_code=${encodeURIComponent(country)}`,
    )
      .then((res) => (res.ok ? res.json() : { substitutes: [] }))
      .then((body: { substitutes?: Substitute[] }) => {
        if (!cancelled) {
          setSubstitutes(body.substitutes ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubstitutes([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [country, itemId]);

  const addOffer = useCallback(
    async (row: Substitute) => {
      if (!row.offer_id) {
        window.location.href = `/p/${row.slug}`;
        return;
      }
      setBusyId(row.id);
      setMessage(null);
      try {
        const token = getAccessToken();
        if (token && session.status === 'authenticated') {
          await addCartItem(token, country, row.offer_id, 1, crypto.randomUUID());
        } else {
          addGuestCartLine({
            offer_id: row.offer_id,
            qty: 1,
            title: row.name,
            currency: row.currency ?? MARKET_CURRENCY[country] ?? 'USD',
            sell_minor: String(row.sell_minor ?? '0'),
            country,
          });
          notifyCartChanged();
        }
        setMessage(`${row.name} added to cart.`);
      } catch (err) {
        setMessage((err as Error).message ?? 'Could not add substitute.');
      } finally {
        setBusyId(null);
      }
    },
    [country, getAccessToken, session.status],
  );

  if (loading) {
    return <LoadingState label="Loading substitutes" />;
  }
  if (!substitutes.length) {
    return null;
  }

  const cheaper = substitutes.filter((row) => (savingsLabel(row.savings_percent) ?? 0) > 0);
  const rows = cheaper.length ? cheaper : substitutes;
  const maxSave = Math.max(...rows.map((row) => savingsLabel(row.savings_percent) ?? 0), 0);

  return (
    <Section
      title={cheaper.length ? 'Cheaper alternatives available' : 'Similar products'}
      description={
        maxSave > 0
          ? `Save up to ${maxSave}% versus ${itemName}`
          : `Other options in the same category as ${itemName}`
      }
    >
      {message ? <p className="mg-text-muted">{message}</p> : null}
      <div className="mg-substitutes-container">
        <div className="mg-substitutes-list">
          {rows.map((substitute) => {
            const save = savingsLabel(substitute.savings_percent);
            const href = `/p/${encodeURIComponent(substitute.slug)}`;
            return (
              <div key={substitute.id} className="mg-substitute-item">
                <Link href={href} className="mg-substitute-media">
                  <img src={substitute.image_url || images?.get(substitute.slug) || PLACEHOLDER} alt="" className="mg-substitute-img" />
                </Link>
                <div className="mg-substitute-header">
                  <div className="mg-substitute-brand">{substitute.brand ?? 'Generic'}</div>
                  {substitute.is_generic ? <span className="mg-substitute-badge">Generic</span> : null}
                </div>
                <h4 className="mg-substitute-name">
                  <Link href={href}>{substitute.name}</Link>
                </h4>
                <div className="mg-substitute-pricing">
                  {substitute.sell_minor && substitute.currency ? (
                    <div className="mg-substitute-price">
                      <span className="mg-substitute-current">
                        {formatMoney(substitute.sell_minor, substitute.currency)}
                      </span>
                    </div>
                  ) : null}
                  {save ? <div className="mg-substitute-savings">Save {save}%</div> : null}
                </div>
                <div className="mg-substitute-actions">
                  <MgBtn href={href} size="sm" variant="secondary">
                    View
                  </MgBtn>
                  {substitute.offer_id ? (
                    <MgBtn
                      size="sm"
                      className="mg-substitute-action"
                      disabled={busyId === substitute.id}
                      onClick={() => void addOffer(substitute)}
                    >
                      {busyId === substitute.id ? 'Adding…' : 'Add'}
                    </MgBtn>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
