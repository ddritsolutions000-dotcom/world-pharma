import { policyDocumentSchema, countryCodeSchema, type PolicyDocumentParsed } from './document';
import type { PolicyDocument } from './empty-pack';

export interface PolicyValidationResult {
  ok: boolean;
  errors: string[];
  document?: PolicyDocumentParsed;
}

export function validateCountryCode(code: string): boolean {
  return countryCodeSchema.safeParse(code.toUpperCase()).success;
}

export function validatePolicyDocument(raw: unknown): PolicyValidationResult {
  const result = policyDocumentSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`),
    };
  }
  return { ok: true, errors: [], document: result.data };
}

export function assertSafeDefaults(document: PolicyDocument): string[] {
  const errors: string[] = [];
  for (const [key, enabled] of Object.entries(document.services)) {
    if (enabled) {
      errors.push(`services.${key} must be false in the empty pack`);
    }
  }
  if (document.payments.enabled) {
    errors.push('payments.enabled must be false in the empty pack');
  }
  if (document.payments.gateway_refs.length > 0) {
    errors.push('empty pack must not contain payment gateway refs');
  }
  for (const [code, row] of Object.entries(document.partner_types)) {
    if (row.join_public) {
      errors.push(`partner_types.${code}.join_public must be false in the empty pack`);
    }
    if (row.enabled) {
      errors.push(`partner_types.${code}.enabled must be false in the empty pack`);
    }
  }
  const healthcare = document.healthcare;
  if (healthcare.doctor_onboarding_enabled) {
    errors.push('healthcare.doctor_onboarding_enabled must be false in the empty pack');
  }
  if (healthcare.doctor_public_visibility) {
    errors.push('healthcare.doctor_public_visibility must be false in the empty pack');
  }
  if (healthcare.telemedicine_eligibility) {
    errors.push('healthcare.telemedicine_eligibility must be false in the empty pack');
  }
  if (healthcare.consultation_capability) {
    errors.push('healthcare.consultation_capability must be false in the empty pack');
  }
  if (healthcare.appointments_enabled) {
    errors.push('healthcare.appointments_enabled must be false in the empty pack');
  }
  if (healthcare.booking_requires_consent) {
    errors.push('healthcare.booking_requires_consent must be false in the empty pack');
  }
  if (healthcare.required_credential_types.length > 0) {
    errors.push('empty pack must not invent required credential types');
  }
  return errors;
}
