# Sprint 63 — Legal / regulatory launch gate

Software cannot self-certify production healthcare/commerce legality.

Until the responsible parties complete country-specific approvals, classify:

**LEGAL/REGULATORY = EXTERNAL_GATED**

Required outside software (non-exhaustive; use local counsel):

- Pharmacy / wholesale / distribution licenses
- Healthcare provider credentialing & accreditation
- KYC / AML for partners and payouts
- Privacy / data protection (e.g. patient health data)
- Payments / PSP compliance & merchant agreements
- eRx / telemedicine / imaging regulatory permissions where applicable
- Cross-border medicine rules if multi-country
- Affiliate marketing / payout compliance

Evidence belongs in regulatory control plane / legal desk — not fake certificates in code.

Related software: country production activation, partner review, launch-readiness LEGAL dimension (S49/S50).
