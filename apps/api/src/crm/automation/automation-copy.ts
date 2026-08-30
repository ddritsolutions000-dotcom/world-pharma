const FORBIDDEN_CLINICAL_TOKENS = [
  'diagnosis',
  'dosage',
  'prescription_version',
  'eligibility_snapshot',
  'consult_note',
  'lab_result',
  'analyte',
  'imaging_finding',
  'health_timeline',
  'break_glass',
  'consent_scope',
  'artifact_payload',
  'medication_name',
  'rx_image',
] as const;

export function assertMarketingCopySafe(title: string, body: string): void {
  const raw = `${title} ${body}`.toLowerCase();
  for (const token of FORBIDDEN_CLINICAL_TOKENS) {
    if (raw.includes(token)) {
      throw new Error(`Clinical token rejected in marketing copy: ${token}`);
    }
  }
}

export function reorderReminderCopy(productTitle: string): { title: string; body: string } {
  const safeTitle = productTitle.trim().slice(0, 80) || 'your recent order';
  const title = 'Time to reorder';
  const body = `You ordered ${safeTitle}. Visit the store to reorder.`;
  assertMarketingCopySafe(title, body);
  return { title, body };
}

export function refillStatusNudgeCopy(): { title: string; body: string } {
  const title = 'Refill request update';
  const body = 'Your refill request needs attention. Open prescriptions to continue.';
  assertMarketingCopySafe(title, body);
  return { title, body };
}

export function subscriptionReminderCopy(): { title: string; body: string } {
  const title = 'Subscription reminder';
  const body = 'Review your subscription settings in prescriptions.';
  assertMarketingCopySafe(title, body);
  return { title, body };
}

export function abandonedCartRecoveryCopy(): { title: string; body: string } {
  const title = 'Items waiting in your cart';
  const body = 'You left items in your cart. Return to checkout when you are ready.';
  assertMarketingCopySafe(title, body);
  return { title, body };
}
