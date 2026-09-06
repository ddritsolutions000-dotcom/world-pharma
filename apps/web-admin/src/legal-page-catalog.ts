export type LegalSitePage = {
  slug: string;
  title: string;
  summary: string;
  customerPath: string;
  starterBody: string;
};

/** Slugs customer CmsPage already loads from published CMS Help articles. */
export const LEGAL_SITE_PAGES: LegalSitePage[] = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    summary: 'How we collect, use, and protect personal and health information.',
    customerPath: '/legal/privacy',
    starterBody: `Last updated: September 2026. Edit this page in Main Admin, then Publish so customer 3000 shows this copy instead of the built-in fallback.

## Information we collect

- Account details: name, email, phone, delivery addresses
- Order and payment metadata (we do not store full card numbers)
- Health records only with explicit consent for clinical services

## Contact

Privacy questions: privacy@worldpharma.com`,
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    summary: 'Rules for using the WorldPharma marketplace.',
    customerPath: '/legal/terms',
    starterBody: `By using WorldPharma you agree to these terms. Edit this LEGAL_NOTICE in Main Admin and publish it to replace the fallback on /legal/terms.

## Eligibility

You must be at least 18 years old (or the age of majority in your country) to create an account.

## Marketplace role

WorldPharma connects you with independently licensed sellers and clinicians.`,
  },
  {
    slug: 'return-policy',
    title: 'Return & Refund Policy',
    summary: 'Returns for medicines, lab bookings, and consultations.',
    customerPath: '/legal/returns',
    starterBody: `Edit this page in Main Admin and publish it. Customer site reads slug return-policy.

## Medicine orders

Report damaged, wrong, or expired products within 48 hours of delivery.

## Refund timing

Approved refunds typically take 5–7 business days to the original payment method.`,
  },
  {
    slug: 'about-worldpharma',
    title: 'About WorldPharma',
    summary: 'Company story shown on the About page.',
    customerPath: '/about',
    starterBody: `WorldPharma connects people with licensed pharmacies, labs, and doctors. Edit and publish this LEGAL_NOTICE to replace the About fallback.`,
  },
  {
    slug: 'careers-at-worldpharma',
    title: 'Careers',
    summary: 'Hiring copy on the Careers page.',
    customerPath: '/careers',
    starterBody: `We're hiring. Edit this page in Main Admin and publish it so /careers shows your copy.

Email careers@worldpharma.com with your CV.`,
  },
];
