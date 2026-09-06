'use client';

import { Text } from '@world-pharma/ui-kit/web';
import type { CheckoutQuotePayload } from './commerce-api';
import { formatMoney } from './format-money';

function line(currency: string, label: string, minor: string | undefined, emphasize = false) {
  if (!minor || minor === '0') {
    return null;
  }
  return (
    <div className="checkout-fee-row">
      <Text size={emphasize ? 'body' : 'caption'}>{label}</Text>
      <Text size={emphasize ? 'body' : 'caption'}>{formatMoney(minor, currency)}</Text>
    </div>
  );
}

export function CheckoutPriceBreakdown({
  currency,
  quote,
  payload,
}: {
  currency: string;
  quote?: { sell_minor?: string; discount_minor?: string; tax_minor?: string; shipping_minor?: string };
  payload?: CheckoutQuotePayload | null;
}) {
  const fees: CheckoutQuotePayload = { ...quote, ...(payload ?? {}) };
  const itemsMinor = fees.subtotal_minor ?? fees.sell_minor ?? quote?.sell_minor;
  const loyaltyMinor = fees.loyalty?.discount_minor;
  const promoMinor = fees.promo?.discount_minor;
  const discountMinor = fees.discount_minor ?? quote?.discount_minor;
  const totalMinor = fees.total_minor;

  return (
    <div className="checkout-price-breakdown wp-stack">
      {line(currency, 'Items (subtotal)', itemsMinor)}
      {line(currency, 'Promo discount', promoMinor)}
      {line(currency, 'Rewards points', loyaltyMinor)}
      {line(currency, fees.care_plan?.name ? `${fees.care_plan.name} discount` : 'Care Plan discount', fees.care_plan?.discount_minor)}
      {!promoMinor && !loyaltyMinor ? line(currency, 'Discount', discountMinor) : null}
      {line(currency, 'Tax', fees.tax_minor ?? quote?.tax_minor)}
      {line(currency, 'Platform / service fee', fees.platform_fee_minor)}
      {line(currency, 'Delivery fee', fees.delivery_fee_minor ?? fees.shipping_minor ?? quote?.shipping_minor)}
      {line(currency, 'Packaging', fees.packaging_fee_minor)}
      {line(currency, 'Handling', fees.handling_fee_minor)}
      {line(currency, 'Payment / convenience fee', fees.payment_convenience_fee_minor)}
      {fees.delivery_subsidy_minor && fees.delivery_subsidy_minor !== '0' ? (
        <Text size="caption" tone="secondary">
          Company delivery subsidy (not charged to you): {formatMoney(fees.delivery_subsidy_minor, currency)}
        </Text>
      ) : null}
      <div className="checkout-fee-row checkout-fee-total">
        <Text>Total payable</Text>
        <Text>{formatMoney(totalMinor, currency)}</Text>
      </div>
    </div>
  );
}
