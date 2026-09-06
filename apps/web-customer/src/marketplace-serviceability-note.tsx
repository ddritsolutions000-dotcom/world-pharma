'use client';

import { useEffect } from 'react';
import { useServiceability } from './use-serviceability';
import { medicineEtaLabel } from './delivery-eta';

export function MarketplaceServiceabilityNote({
  countryCode,
  postalCode,
  rxRequired,
}: {
  countryCode: string;
  postalCode: string;
  rxRequired?: boolean;
}) {
  const { serviceability, loading, refresh } = useServiceability(countryCode);

  useEffect(() => {
    if (postalCode.trim()) {
      void refresh(postalCode);
    }
  }, [postalCode, refresh]);

  if (!postalCode.trim()) {
    return (
      <p className="mg-text-muted">
        Enter your delivery pincode in the header to check medicine delivery to your area.
      </p>
    );
  }

  if (loading) {
    return <p className="mg-text-muted">Checking delivery to {postalCode}…</p>;
  }

  if (!serviceability) {
    return <p className="mg-text-muted">Could not verify delivery for {postalCode}. Try again from the header.</p>;
  }

  if (!serviceability.serviceable || !serviceability.medicine_delivery) {
    return (
      <p className="mg-serviceability-warn" role="status">
        {serviceability.message || 'Medicine delivery is not available for this destination.'}
      </p>
    );
  }

  return (
    <p className="mg-text-muted" role="status">
      Delivers to {serviceability.city ?? postalCode}
      {serviceability.medicine_eta
        ? ` · ${medicineEtaLabel(serviceability, !!rxRequired)}`
        : ''}
    </p>
  );
}
