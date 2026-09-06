import { z } from 'zod';
import { PARTNER_TYPE_CODES, SERVICE_KEYS } from '@world-pharma/shared';

const iso2 = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/);
const iso4217 = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/);
const bcp47 = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/);
const iana = z.string().min(1).max(64);

const partnerTypePolicy = z
  .object({
    enabled: z.boolean(),
    join_public: z.boolean(),
    allowed_services: z.array(z.string()),
    required_fields: z.array(z.string()),
    required_documents: z.array(z.string()),
    approval_workflow: z.enum(['none', 'single', 'dual']),
    auto_approve_after_verify: z.boolean(),
    clinical_categories: z.boolean().optional(),
  })
  .superRefine((row, ctx) => {
    if (row.join_public && !row.enabled) {
      ctx.addIssue({
        code: 'custom',
        message: 'join_public cannot be true when the partner type is disabled',
      });
    }
  });

const partnerTypes = z
  .record(z.string(), partnerTypePolicy)
  .superRefine((value, ctx) => {
    const keys = Object.keys(value);
    const unique = new Set(keys);
    if (unique.size !== keys.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate partner type' });
    }
    for (const code of PARTNER_TYPE_CODES) {
      if (!(code in value)) {
        ctx.addIssue({ code: 'custom', message: `missing partner type ${code}` });
      }
    }
  });

const services = z.object(
  Object.fromEntries(SERVICE_KEYS.map((key) => [key, z.boolean()])) as Record<
    (typeof SERVICE_KEYS)[number],
    z.ZodBoolean
  >,
);

export const policyDocumentSchema = z
  .object({
    identity: z.object({
      country_allowed: z.boolean(),
      phone_e164_required: z.boolean(),
      email_required: z.boolean(),
      verification_required: z.boolean(),
    }),
    i18n: z.object({
      default_locale: bcp47,
      locales: z.array(bcp47).min(1),
    }),
    currency: z.object({
      default: iso4217,
      allowed: z.array(iso4217).min(1),
    }),
    timezone: z.object({
      default: iana,
      allowed: z.array(iana).min(1),
    }),
    datetime: z.object({
      date_format: z.string().min(1),
      time_format: z.string().min(1),
      number_format: z.string().min(1),
    }),
    services,
    payments: z.object({
      enabled: z.boolean(),
      methods: z.array(z.string()),
      gateway_refs: z.array(z.string()),
      currencies: z.array(iso4217),
    }),
    tax_profile_id: z
      .string()
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/)
      .nullable()
      .optional(),
    ledger: z
      .object({
        legal_entity_id: z
          .string()
          .max(64)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/)
          .nullable()
          .default(null),
        accounting_currency: iso4217.nullable().default(null),
      })
      .optional()
      .default({ legal_entity_id: null, accounting_currency: null }),
    shipping: z
      .object({
        domestic: z.boolean(),
        international: z.boolean(),
        rx: z.boolean(),
        controlled: z.boolean(),
        cold_chain: z.boolean(),
      })
      .default({
        domestic: false,
        international: false,
        rx: false,
        controlled: false,
        cold_chain: false,
      }),
    commerce: z
      .object({
        platform_fee_bps: z.number().int().min(0).max(10_000).default(0),
        platform_fee_flat_minor: z.number().int().min(0).default(0),
        delivery_fee_minor: z.number().int().min(0).default(0),
        packaging_fee_minor: z.number().int().min(0).default(0),
        handling_fee_minor: z.number().int().min(0).default(0),
        payment_convenience_fee_minor: z.number().int().min(0).default(0),
        free_delivery_threshold_minor: z.number().int().min(0).nullable().default(null),
        carrier_cost_estimate_minor: z.number().int().min(0).default(0),
        affiliate_commission_bps: z.number().int().min(0).max(10_000).default(0),
        /** Partner take (doctor wallet / partner wallet) — distinct from customer checkout platform_fee_bps. */
        doctor_platform_fee_bps: z.number().int().min(0).max(10_000).optional(),
        lab_platform_fee_bps: z.number().int().min(0).max(10_000).optional(),
        delivery_platform_fee_bps: z.number().int().min(0).max(10_000).optional(),
        pharmacy_platform_fee_bps: z.number().int().min(0).max(10_000).optional(),
        partner_platform_fee_flat_minor: z.number().int().min(0).optional(),
      })
      .default({
        platform_fee_bps: 0,
        platform_fee_flat_minor: 0,
        delivery_fee_minor: 0,
        packaging_fee_minor: 0,
        handling_fee_minor: 0,
        payment_convenience_fee_minor: 0,
        free_delivery_threshold_minor: null,
        carrier_cost_estimate_minor: 0,
        affiliate_commission_bps: 0,
      }),
    partner_types: partnerTypes,
    data_residency_mode: z.enum(['shared', 'pinned_region', 'dedicated_db']),
    recording_allowed: z.boolean(),
    healthcare: z
      .object({
        doctor_onboarding_enabled: z.boolean(),
        doctor_public_visibility: z.boolean(),
        required_credential_types: z.array(z.string()),
        telemedicine_eligibility: z.boolean(),
        consultation_capability: z.boolean(),
        appointments_enabled: z.boolean().default(false),
        booking_requires_consent: z.boolean().default(false),
        rx_prescribe_enabled: z.boolean().default(false),
        rx_dispense_enabled: z.boolean().default(false),
        rx_erx_enabled: z.boolean().default(false),
        rx_erx_provider_code: z.string().max(32).optional(),
        rx_amend_enabled: z.boolean().default(false),
        rx_allowed_restriction_codes: z.array(z.string()).default([]),
        rx_refill_enabled: z.boolean().default(false),
        rx_refill_require_doctor_reauth: z.boolean().default(true),
        rx_subscription_enabled: z.boolean().default(false),
        rx_subscription_auto_execute: z.boolean().default(false),
        health_timeline_enabled: z.boolean().default(false),
        clinical_search_enabled: z.boolean().default(false),
        care_navigation_enabled: z.boolean().default(false),
      })
      .default({
        doctor_onboarding_enabled: false,
        doctor_public_visibility: false,
        required_credential_types: [],
        telemedicine_eligibility: false,
        consultation_capability: false,
        appointments_enabled: false,
        booking_requires_consent: false,
        rx_prescribe_enabled: false,
        rx_dispense_enabled: false,
        rx_erx_enabled: false,
        rx_erx_provider_code: undefined,
        rx_amend_enabled: false,
        rx_allowed_restriction_codes: [],
        rx_refill_enabled: false,
        rx_refill_require_doctor_reauth: true,
        rx_subscription_enabled: false,
        rx_subscription_auto_execute: false,
        health_timeline_enabled: false,
        clinical_search_enabled: false,
        care_navigation_enabled: false,
      }),
    legal: z.object({
      review_required: z.literal(true),
      notes: z.string(),
    }),
    crm: z
      .object({
        enabled: z.boolean().default(false),
        marketing: z
          .object({
            enabled: z.boolean().default(false),
            channels: z.array(z.string()).default(['in_app']),
            medicine_advertising: z.boolean().default(false),
          })
          .default({
            enabled: false,
            channels: ['in_app'],
            medicine_advertising: false,
          }),
        loyalty: z
          .object({
            enabled: z.boolean().default(false),
          })
          .default({
            enabled: false,
          }),
        reviews: z
          .object({
            enabled: z.boolean().default(true),
            verified_purchase_required: z.boolean().default(true),
          })
          .default({
            enabled: true,
            verified_purchase_required: true,
          }),
        personalization: z
          .object({
            retention_days: z.number().int().min(1).max(3650).default(90),
          })
          .default({
            retention_days: 90,
          }),
        automation: z
          .object({
            enabled: z.boolean().default(false),
            reorder_reminder_days: z.number().int().min(1).max(365).default(30),
          })
          .default({
            enabled: false,
            reorder_reminder_days: 30,
          }),
      })
      .default({
        enabled: false,
        marketing: {
          enabled: false,
          channels: ['in_app'],
          medicine_advertising: false,
        },
        loyalty: {
          enabled: false,
        },
        reviews: {
          enabled: true,
          verified_purchase_required: true,
        },
        personalization: {
          retention_days: 90,
        },
        automation: {
          enabled: false,
          reorder_reminder_days: 30,
        },
      }),
    search: z
      .object({
        discovery_enabled: z.boolean().default(true),
        blocklist_terms: z.array(z.string().min(1).max(64)).default([]),
      })
      .default({
        discovery_enabled: true,
        blocklist_terms: [],
      }),
    analytics: z
      .object({
        enabled: z.boolean().default(false),
        retention_days: z.number().int().min(1).max(3650).default(365),
      })
      .default({
        enabled: false,
        retention_days: 365,
      }),
  })
  .superRefine((doc, ctx) => {
    if (!doc.i18n.locales.includes(doc.i18n.default_locale)) {
      ctx.addIssue({ code: 'custom', path: ['i18n'], message: 'default_locale must be in locales' });
    }
    if (!doc.currency.allowed.includes(doc.currency.default)) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'default currency must be in allowed',
      });
    }
    if (!doc.timezone.allowed.includes(doc.timezone.default)) {
      ctx.addIssue({
        code: 'custom',
        path: ['timezone'],
        message: 'default timezone must be in allowed',
      });
    }
    if (doc.payments.enabled && doc.payments.gateway_refs.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['payments'],
        message: 'payments.enabled requires gateway_refs (no secrets — ids only)',
      });
    }
    if (doc.ledger?.accounting_currency && !doc.currency.allowed.includes(doc.ledger.accounting_currency)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ledger', 'accounting_currency'],
        message: 'accounting_currency must be in currency.allowed',
      });
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: doc.timezone.default });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['timezone', 'default'], message: 'invalid IANA timezone' });
    }
  });

export const countryCodeSchema = iso2;

export type PolicyDocumentParsed = z.infer<typeof policyDocumentSchema>;
