export type CarePlanId = 'diabetes' | 'family' | 'senior';

export type CarePlanDefinition = {
  id: CarePlanId;
  name: string;
  price_label: string;
  price_minor: string;
  currency: string;
  period: 'year';
  discount_bps: number;
  free_delivery: boolean;
  featured: boolean;
  perks: string[];
};

export const CARE_PLANS: CarePlanDefinition[] = [
  {
    id: 'diabetes',
    name: 'Diabetes Care Plan',
    price_label: '₹549/year',
    price_minor: '54900',
    currency: 'INR',
    period: 'year',
    discount_bps: 1500,
    free_delivery: false,
    featured: true,
    perks: ['15% off medicines at checkout', 'Free HbA1c credit (sandbox)', 'Doctor consults at member rate', 'Priority support'],
  },
  {
    id: 'family',
    name: 'Family Health Plan',
    price_label: '₹999/year',
    price_minor: '99900',
    currency: 'INR',
    period: 'year',
    discount_bps: 1000,
    free_delivery: true,
    featured: false,
    perks: ['10% off all orders', 'Free delivery on pharmacy orders', '2 checkup credits (sandbox)', 'Family profiles included'],
  },
  {
    id: 'senior',
    name: 'Senior Care Plan',
    price_label: '₹799/year',
    price_minor: '79900',
    currency: 'INR',
    period: 'year',
    discount_bps: 2000,
    free_delivery: true,
    featured: false,
    perks: ['20% off chronic medicines', 'Free delivery', 'Home sample collection priority', 'Dedicated support line'],
  },
];

export function carePlanById(id: string | null | undefined): CarePlanDefinition | null {
  if (!id) return null;
  return CARE_PLANS.find((row) => row.id === id) ?? null;
}

export function carePlanDiscountMinor(sellAfterPromo: bigint, discountBps: number): bigint {
  if (discountBps <= 0 || sellAfterPromo <= 0n) return 0n;
  return (sellAfterPromo * BigInt(discountBps)) / 10000n;
}

export function isCarePlanActive(status: string, expiresAt: Date, now = new Date()): boolean {
  return status === 'ACTIVE' && expiresAt.getTime() > now.getTime();
}
