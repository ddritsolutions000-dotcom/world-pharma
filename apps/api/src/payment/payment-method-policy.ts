import { PaymentMethodFamily } from '@prisma/client';

const FAMILIES = new Set<string>(Object.values(PaymentMethodFamily));

/** Policy document may use UPI; gateway + enum use MOBILE_PAYMENT. */
const POLICY_METHOD_ALIASES: Record<string, PaymentMethodFamily> = {
  UPI: PaymentMethodFamily.MOBILE_PAYMENT,
};

const INDIA_LABELS: Partial<Record<PaymentMethodFamily, string>> = {
  [PaymentMethodFamily.MOBILE_PAYMENT]: 'UPI — PhonePe / Google Pay / Paytm',
  [PaymentMethodFamily.CARD]: 'Debit / Credit Card',
  [PaymentMethodFamily.COD]: 'Cash on Delivery',
};

const US_LABELS: Partial<Record<PaymentMethodFamily, string>> = {
  [PaymentMethodFamily.CARD]: 'Debit / Credit Card',
  [PaymentMethodFamily.WALLET]: 'Apple Pay / Google Pay',
};

const UAE_LABELS: Partial<Record<PaymentMethodFamily, string>> = {
  [PaymentMethodFamily.CARD]: 'Debit / Credit Card',
  [PaymentMethodFamily.COD]: 'Cash on Delivery',
};

const INDIA_METHOD_ORDER: PaymentMethodFamily[] = [
  PaymentMethodFamily.MOBILE_PAYMENT,
  PaymentMethodFamily.CARD,
  PaymentMethodFamily.COD,
];

export function normalizePolicyPaymentMethod(raw: string): PaymentMethodFamily | null {
  const mapped = POLICY_METHOD_ALIASES[raw.trim().toUpperCase()] ?? raw.trim().toUpperCase();
  if (!FAMILIES.has(mapped)) {
    return null;
  }
  return mapped as PaymentMethodFamily;
}

export function policyAllowsPaymentMethod(policyMethods: string[], requested: string): boolean {
  const normalized = normalizePolicyPaymentMethod(requested);
  if (!normalized) {
    return false;
  }
  return policyMethods.some((m) => normalizePolicyPaymentMethod(m) === normalized);
}

export function resolvePaymentMethodFromInput(
  input: string | undefined,
  policyMethods: string[],
): PaymentMethodFamily {
  const raw = (input ?? policyMethods[0] ?? PaymentMethodFamily.CARD).trim();
  const normalized = normalizePolicyPaymentMethod(raw);
  if (!normalized || !policyAllowsPaymentMethod(policyMethods, raw)) {
    throw new Error('PAYMENT_METHOD_UNAVAILABLE');
  }
  return normalized;
}

export function allowedPaymentFamilies(policyMethods: string[]): PaymentMethodFamily[] {
  const families = new Set<PaymentMethodFamily>();
  for (const method of policyMethods) {
    const normalized = normalizePolicyPaymentMethod(method);
    if (normalized) {
      families.add(normalized);
    }
  }
  return [...families];
}

export function paymentMethodLabel(countryCode: string, family: PaymentMethodFamily, fallback: string): string {
  const code = countryCode.toUpperCase();
  if (code === 'IN') {
    return INDIA_LABELS[family] ?? fallback;
  }
  if (code === 'US') {
    return US_LABELS[family] ?? fallback;
  }
  if (code === 'AE') {
    return UAE_LABELS[family] ?? fallback;
  }
  return fallback;
}

export function sortPaymentMethodsForCountry<T extends { family: PaymentMethodFamily }>(
  countryCode: string,
  methods: T[],
): T[] {
  if (countryCode.toUpperCase() !== 'IN') {
    return methods;
  }
  const rank = (family: PaymentMethodFamily) => {
    const index = INDIA_METHOD_ORDER.indexOf(family);
    return index === -1 ? INDIA_METHOD_ORDER.length : index;
  };
  return [...methods].sort((a, b) => rank(a.family) - rank(b.family));
}
