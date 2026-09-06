import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  CatalogItemKind,
  CmsContentStatus,
  CmsContentType,
  CountryStatus,
  IdentifierType,
  InventoryLotStatus,
  LocationKind,
  LoyaltyLedgerEntryKind,
  LoyaltyProgramStatus,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PersonStatus,
  PolicyPackStatus,
  AffiliateReferralCodeStatus,
  LabSampleCocStatus,
  LabProcessingStatus,
  LabReportVersionStatus,
  ImagingStudyStatus,
  ImagingAcquisitionStatus,
  ImagingReportVersionStatus,
} from '@prisma/client';
import { JOIN_PAGE_DEFAULTS, stringifyJoinPageDocument } from '@world-pharma/shared/join-page-blocks';
import {
  DEFAULT_SITE_FOOTER,
  DEFAULT_SITE_HERO,
  DEFAULT_SITE_NAV,
  DEFAULT_SITE_SEO,
} from '@world-pharma/shared/site-chrome';
import { normalizeEmail, normalizePhone, hashPassword, uuidv7 } from '@world-pharma/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../app/prisma.service';
import { shouldSkipDemoFixtureSeed } from '../ops/demo-fixture-guard';
import { CatalogService } from '../catalog/catalog.service';
import { MARKETPLACE_ATTESTATION_CODE, MarketplaceEligibilityService } from '../catalog/marketplace-eligibility.service';
import type { Principal } from '../identity/current-principal';
import { InventoryService } from '../inventory/inventory.service';
import { PolicyCache } from '../policy/cache';
import { validatePolicyDocument } from '../policy/validator';
import { LAB_PARTNER_ATTESTATION_CODE, LabCapabilityService } from '../lab/lab-capability.service';
import { CmsSearchService } from '../cms/cms-search.service';
import { DevTransactionalSeedService } from './dev-transactional.seed.service';
import {
  RADIOLOGY_PARTNER_ATTESTATION_CODE,
  RadiologyCapabilityService,
} from '../radiology/radiology-capability.service';
import { buildSandboxPolicyDocument } from './sandbox-policy';
import { buildIndiaPolicyDocument, INDIA_COUNTRY } from './india-policy';
import { buildUsPolicyDocument, US_COUNTRY } from './us-policy';
import { buildUaePolicyDocument, UAE_COUNTRY } from './uae-policy';
import { MARKET_MIRROR_CONFIGS, type MarketSeedSpec } from './market-country';
import { nextPolicyPackVersion } from '../test/next-policy-pack-version';
import { seedDoctorPartner } from '../test/publish-lab-health-artifact';

const MARKER_SLUG = 'demo-paracetamol-500';

const FOOTER_CATEGORIES = [
  { slug: 'vitamins', name: 'Vitamins & Supplements', productSlugs: ['demo-vitamin-d3'] },
  { slug: 'pain-relief', name: 'Pain Relief', productSlugs: [MARKER_SLUG] },
  { slug: 'cough-cold', name: 'Cough & Cold', productSlugs: ['demo-cough-syrup'] },
  { slug: 'diabetes', name: 'Diabetes Care', productSlugs: ['demo-glucose-strips'] },
  { slug: 'skin-care', name: 'Skin Care', productSlugs: ['demo-skin-moisturizer'] },
] as const;

const ECOSYSTEM_CMS: Array<{
  slug: string;
  title: string;
  summary?: string;
  body: string;
  contentType: CmsContentType;
  categorySlug: string;
}> = [
  {
    slug: 'about-worldpharma',
    title: 'About WorldPharma',
    summary: 'Global online pharmacy & healthcare platform.',
    categorySlug: 'legal',
    contentType: CmsContentType.LEGAL_NOTICE,
    body: 'WorldPharma connects customers worldwide with licensed pharmacies, certified labs, and verified doctors. Order medicines, book lab tests, consult online, and track deliveries from one account.',
  },
  {
    slug: 'careers-at-worldpharma',
    title: 'Careers at WorldPharma',
    summary: 'Join teams building digital healthcare infrastructure.',
    categorySlug: 'legal',
    contentType: CmsContentType.LEGAL_NOTICE,
    body: 'We hire engineers, operators, and partnership managers. Email careers@worldpharma.com with your CV.',
  },
  {
    slug: 'seasonal-wellness-blog',
    title: 'Seasonal wellness: labs, vitamins, and when to see a doctor',
    summary: 'A starter health blog post operators can edit in Main Admin.',
    categorySlug: 'blog',
    contentType: CmsContentType.ARTICLE,
    body: 'This post is seeded so /blog has a real CMS article. Edit it from Main Admin → Blog, then publish new drafts.',
  },
  {
    slug: 'contact-worldpharma',
    title: 'Contact Us',
    summary: 'Orders, labs, refunds, and account help.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: 'Orders, lab bookings, refunds, and account help — 7 days a week. Call 1800-212-2323 or submit a ticket after you sign in.',
  },
  {
    slug: 'partners-worldpharma',
    title: 'Partner with WorldPharma',
    summary: 'Licensed pharmacies, labs, doctors, and delivery partners.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: 'We onboard licensed partners through KYC. Apply from the join portal. Sandbox demo credentials are for testing only.',
  },
  {
    slug: 'join-home',
    title: 'Partner with World Pharma',
    summary: 'Join as a pharmacy, vendor, doctor, lab, delivery partner, or affiliate.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-home']),
  },
  {
    slug: 'join-pharmacy',
    title: 'Pharmacy operators',
    summary: 'Fulfil orders and run a licensed pharmacy storefront.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-pharmacy']),
  },
  {
    slug: 'join-doctor',
    title: 'Doctor partners',
    summary: 'Consultations and prescriptions on one platform.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-doctor']),
  },
  {
    slug: 'join-lab',
    title: 'Laboratory partners',
    summary: 'Tests, collections, and digital reports.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-lab']),
  },
  {
    slug: 'join-imaging',
    title: 'Imaging center partners',
    summary: 'Studies, bookings, and report delivery.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-imaging']),
  },
  {
    slug: 'join-delivery',
    title: 'Delivery partners',
    summary: 'Assigned medicine, sample, and report jobs.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-delivery']),
  },
  {
    slug: 'join-affiliate',
    title: 'Affiliate program',
    summary: 'Referrals for eligible marketplace activity.',
    categorySlug: 'company',
    contentType: CmsContentType.ARTICLE,
    body: stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS['join-affiliate']),
  },
  {
    slug: 'welcome',
    title: 'Welcome guide',
    categorySlug: 'getting-started',
    contentType: CmsContentType.ARTICLE,
    body: 'Create an account with OTP, set your country and postal code, search medicines, add to cart, and checkout. Upload a prescription when required.',
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    categorySlug: 'legal',
    contentType: CmsContentType.LEGAL_NOTICE,
    body: 'We collect account and order data to fulfil requests. Health records require explicit consent. We do not sell personal data. Contact support for access or deletion requests.',
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    categorySlug: 'legal',
    contentType: CmsContentType.LEGAL_NOTICE,
    body: 'Use WorldPharma for lawful healthcare commerce. Rx medicines require valid prescriptions where mandated. Prices and delivery vary by country and region.',
  },
  {
    slug: 'return-policy',
    title: 'Return & Refund Policy',
    categorySlug: 'policies',
    contentType: CmsContentType.LEGAL_NOTICE,
    body: 'Report damaged or wrong medicines within 48 hours. Lab bookings can be cancelled before sample collection. Refunds process in 5–7 business days.',
  },
  {
    slug: 'how-to-order-medicines',
    title: 'How do I order medicines?',
    categorySlug: 'getting-started',
    contentType: CmsContentType.FAQ,
    body: 'Search or browse categories, add items to cart, and checkout. For Rx items, upload your prescription at checkout or from the Upload Prescription page.',
  },
  {
    slug: 'delivery-faq',
    title: 'How long does delivery take?',
    categorySlug: 'delivery',
    contentType: CmsContentType.FAQ,
    body: 'Delivery times vary by country and carrier — many regions receive orders within 24–72 hours. Track status under My Orders and Shipments.',
  },
  {
    slug: 'careers-at-worldpharma',
    title: 'Careers at WorldPharma',
    summary: 'Build the future of digital healthcare.',
    categorySlug: 'careers',
    contentType: CmsContentType.LANDING,
    body: 'We hire across engineering, operations, pharmacy partnerships, and customer experience. Email careers@worldpharma.com with your CV.',
  },
  {
    slug: 'health-tips-seasonal',
    title: '5 seasonal wellness tips',
    categorySlug: 'blog',
    contentType: CmsContentType.ARTICLE,
    body: 'Stay hydrated, eat balanced meals, keep active, maintain sleep hygiene, and consult a doctor if symptoms persist beyond a few days.',
  },
  {
    slug: 'vitamin-d-benefits',
    title: 'Why Vitamin D matters',
    categorySlug: 'blog',
    contentType: CmsContentType.ARTICLE,
    body: 'Vitamin D supports bone health and immunity. Many adults are deficient — consider a blood test and supplementation after medical advice.',
  },
  {
    slug: 'understanding-diabetes',
    title: 'Understanding diabetes: symptoms, tests, and daily care',
    summary: 'How HbA1c, medicines, and lifestyle work together — plus when to see a doctor.',
    categorySlug: 'diseases',
    contentType: CmsContentType.ARTICLE,
    body: 'Diabetes needs a clinician for diagnosis. This guide covers warning signs, common lab tests (fasting glucose, HbA1c), and how WorldPharma helps with medicines, home collection, and consults.',
  },
  {
    slug: 'heart-health-tips',
    title: 'Heart health: lipids, BP, and when to book a checkup',
    summary: 'Practical steps for blood pressure, cholesterol tests, and cardiology consults.',
    categorySlug: 'wellness',
    contentType: CmsContentType.ARTICLE,
    body: 'Keep a record of BP readings, know your lipid panel, and book a full body checkup if you have family history.',
  },
  {
    slug: 'thyroid-tests-explained',
    title: 'Thyroid tests: TSH, T3, T4 and when to consult',
    summary: 'What a thyroid panel covers and how to book home collection.',
    categorySlug: 'lab-tests',
    contentType: CmsContentType.ARTICLE,
    body: 'TSH is the usual first test. Abnormal results need a clinician. Book a thyroid profile and use a consult if symptoms persist.',
  },
  {
    slug: 'immune-boosting-foods',
    title: 'Immunity, vitamins, and winter wellness',
    summary: 'Food, Vitamin D, and when a deficiency test is worth booking.',
    categorySlug: 'nutrition',
    contentType: CmsContentType.ARTICLE,
    body: 'Diet comes first. Vitamin D and B12 tests are common in winter. Pair OTC vitamins with a published lab offer and talk to a pharmacist or GP if you take other medicines.',
  },
  {
    slug: 'stress-management',
    title: 'Stress, sleep, and mental wellness support',
    summary: 'Simple routines plus when to book a psychiatrist or counsellor consult.',
    categorySlug: 'mental-health',
    contentType: CmsContentType.ARTICLE,
    body: 'Sleep, movement, and limits on caffeine help. If mood or anxiety lasts more than two weeks, book a mental health consult. This is education, not a crisis service.',
  },
  {
    slug: 'fever-and-infection-care',
    title: 'Fever, dengue, and infection workups',
    summary: 'When to test, hydrate, and see a doctor — not a substitute for emergency care.',
    categorySlug: 'diseases',
    contentType: CmsContentType.ARTICLE,
    body: 'High fever with bleeding, breathlessness, or confusion needs emergency care. For milder illness, a doctor may order CBC, dengue NS1, or malaria tests.',
  },
  {
    slug: 'pregnancy-lab-essentials',
    title: 'Pregnancy care: common labs and supplements',
    summary: 'Typical prenatal tests and how to order OTC vitamins with medical advice.',
    categorySlug: 'parenting',
    contentType: CmsContentType.ARTICLE,
    body: 'Prenatal care is clinician-led. Common labs include CBC, TSH, and glucose screening. Pair prescribed medicines with a valid Rx upload.',
  },
  {
    slug: 'site-nav',
    title: 'Storefront navigation',
    summary: 'Primary menu JSON for customer chrome',
    categorySlug: 'site-chrome',
    contentType: CmsContentType.PACK_STRING,
    body: JSON.stringify(DEFAULT_SITE_NAV),
  },
  {
    slug: 'site-footer',
    title: 'Storefront footer',
    summary: 'Footer JSON for customer chrome',
    categorySlug: 'site-chrome',
    contentType: CmsContentType.PACK_STRING,
    body: JSON.stringify(DEFAULT_SITE_FOOTER),
  },
  {
    slug: 'site-hero',
    title: 'Storefront hero',
    summary: 'Home hero JSON for customer chrome',
    categorySlug: 'site-chrome',
    contentType: CmsContentType.PACK_STRING,
    body: JSON.stringify(DEFAULT_SITE_HERO),
  },
  {
    slug: 'site-seo',
    title: 'Storefront SEO',
    summary: 'SEO pack JSON for customer chrome',
    categorySlug: 'site-chrome',
    contentType: CmsContentType.PACK_STRING,
    body: JSON.stringify(DEFAULT_SITE_SEO),
  },
];
const ADMIN_EMAIL = 'sandbox-admin@dev.local';
const VENDOR_EMAIL = 'sandbox-vendor@dev.local';
const DOCTOR_EMAIL = 'sandbox-doctor@dev.local';
const LAB_EMAIL = 'sandbox-lab@dev.local';
const DELIVERY_EMAIL = 'sandbox-delivery@dev.local';
const IMAGING_EMAIL = 'sandbox-imaging@dev.local';
const IMAGING_STUDY_SLUG = 'demo-chest-xray';
const CUSTOMER_EMAIL = 'sandbox-customer@dev.local';
const AFFILIATE_EMAIL = 'sandbox-affiliate@dev.local';
const STORE_EMAIL = 'sandbox-store@dev.local';
const PATHOLOGIST_EMAIL = 'sandbox-pathologist@dev.local';
const PHLEBOTOMIST_EMAIL = 'sandbox-phlebotomist@dev.local';
const RADIOLOGIST_EMAIL = 'sandbox-radiologist@dev.local';
const RADIOLOGIST_REVIEWER_EMAIL = 'sandbox-radiologist-reviewer@dev.local';
const DEMO_REFERRAL_CODE = 'WPDEMO';
/** Shared sandbox partner password for User ID + password → mobile OTP login. */
const SANDBOX_PARTNER_PASSWORD = 'SandboxPartner!234';
const SANDBOX_PARTNER_LOGIN: Array<{ email: string; phone: string }> = [
  { email: 'sandbox-doctor@dev.local', phone: '+919900000001' },
  { email: 'sandbox-lab@dev.local', phone: '+919900000002' },
  { email: 'sandbox-vendor@dev.local', phone: '+919900000003' },
  { email: 'sandbox-affiliate@dev.local', phone: '+919900000004' },
  { email: 'sandbox-store@dev.local', phone: '+919900000005' },
  { email: 'sandbox-delivery@dev.local', phone: '+919900000006' },
  { email: 'sandbox-imaging@dev.local', phone: '+919900000007' },
  { email: 'sandbox-pathologist@dev.local', phone: '+919900000008' },
  { email: 'sandbox-radiologist@dev.local', phone: '+919900000009' },
  { email: 'sandbox-phlebotomist@dev.local', phone: '+919900000010' },
];

type DemoProduct = {
  slug: string;
  title: string;
  description: string;
  kind: typeof CatalogItemKind.OTC | 'CONSUMABLE';
  sku: string;
  packSize: string;
  sellMinor: string;
  listMinor: string;
  image: string;
  attributes: Record<string, unknown>;
};

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: MARKER_SLUG,
    title: 'Paracetamol 500mg Tablets',
    description: 'Pain relief and fever reducer. Consult a healthcare professional before use.',
    kind: 'OTC',
    sku: 'DEMO-PARA-500',
    packSize: '15 tablets',
    sellMinor: '8900',
    listMinor: '12000',
    image: 'https://placehold.co/480x480/png?text=Paracetamol',
    attributes: {
      manufacturer_name: 'Demo Pharma Ltd',
      country_of_manufacture: 'XX',
      composition: 'Paracetamol 500mg',
      highlights: ['Fast relief', 'Trusted formulation'],
      storage: 'Store below 25°C',
    },
  },
  {
    slug: 'demo-vitamin-d3',
    title: 'Vitamin D3 60K Capsules',
    description: 'Dietary supplement for bone health support.',
    kind: 'OTC',
    sku: 'DEMO-VIT-D3',
    packSize: '4 capsules',
    sellMinor: '24900',
    listMinor: '32000',
    image: 'https://placehold.co/480x480/png?text=Vitamin+D3',
    attributes: {
      manufacturer_name: 'NutriDemo Health',
      country_of_manufacture: 'XX',
      composition: 'Cholecalciferol 60,000 IU',
      highlights: ['Once weekly dosage'],
    },
  },
  {
    slug: 'demo-cough-syrup',
    title: 'Cough Relief Syrup',
    description: 'Soothing cough syrup for temporary relief.',
    kind: 'OTC',
    sku: 'DEMO-COUGH-100',
    packSize: '100 ml',
    sellMinor: '15900',
    listMinor: '19900',
    image: 'https://placehold.co/480x480/png?text=Cough+Syrup',
    attributes: {
      manufacturer_name: 'Demo Remedies',
      country_of_manufacture: 'XX',
      warnings: 'Not for children under 6 without medical advice.',
    },
  },
  {
    slug: 'demo-skin-moisturizer',
    title: 'Aloe Vera Moisturizing Gel',
    description: 'Daily skin moisturizer for dry and sensitive skin.',
    kind: 'OTC',
    sku: 'DEMO-SKIN-100',
    packSize: '100 g',
    sellMinor: '12900',
    listMinor: '17500',
    image: 'https://placehold.co/480x480/png?text=Skin+Care',
    attributes: {
      manufacturer_name: 'DermaDemo',
      country_of_manufacture: 'XX',
      highlights: ['Non-greasy', 'Suitable for daily use'],
    },
  },
  {
    slug: 'demo-glucose-strips',
    title: 'Blood Glucose Test Strips',
    description: 'Compatible test strips for home glucose monitoring. Follow device instructions.',
    kind: 'OTC',
    sku: 'DEMO-GLU-50',
    packSize: '50 strips',
    sellMinor: '18900',
    listMinor: '22900',
    image: 'https://placehold.co/480x480/png?text=Glucose+Strips',
    attributes: {
      manufacturer_name: 'DiabetesCare Demo',
      country_of_manufacture: 'XX',
      highlights: ['Single-use strips', 'Store in a cool dry place'],
    },
  },
];

const PET_CARE_MARKER = 'pet-dog-dewormer';

const PET_CARE_PRODUCTS: DemoProduct[] = [
  {
    slug: PET_CARE_MARKER,
    title: 'Dog Dewormer Tablets',
    description: 'Broad-spectrum intestinal dewormer for dogs. Consult your veterinarian before use.',
    kind: 'OTC',
    sku: 'PET-DOG-DEW',
    packSize: '2 tablets',
    sellMinor: '19900',
    listMinor: '24900',
    image: 'https://placehold.co/480x480/png?text=Dog+Dewormer',
    attributes: {
      vertical: 'pet-care',
      pet_type: 'dog',
      manufacturer_name: 'PetDemo Health',
      highlights: ['Monthly protection', 'Vet recommended'],
    },
  },
  {
    slug: 'pet-cat-flea-drops',
    title: 'Cat Flea & Tick Drops',
    description: 'Topical flea and tick control for cats. For external use only.',
    kind: 'OTC',
    sku: 'PET-CAT-FLEA',
    packSize: '0.5 ml × 3',
    sellMinor: '34900',
    listMinor: '42900',
    image: 'https://placehold.co/480x480/png?text=Cat+Flea+Drops',
    attributes: {
      vertical: 'pet-care',
      pet_type: 'cat',
      manufacturer_name: 'PetDemo Health',
      highlights: ['Fast acting', 'Monthly application'],
    },
  },
  {
    slug: 'pet-dog-joint-supplement',
    title: 'Dog Joint Care Chews',
    description: 'Glucosamine and chondroitin chews to support joint mobility in adult dogs.',
    kind: 'OTC',
    sku: 'PET-DOG-JOINT',
    packSize: '30 chews',
    sellMinor: '59900',
    listMinor: '74900',
    image: 'https://placehold.co/480x480/png?text=Joint+Chews',
    attributes: {
      vertical: 'pet-care',
      pet_type: 'dog',
      manufacturer_name: 'NutriPet Demo',
      highlights: ['Tasty chew format', 'Daily supplement'],
    },
  },
  {
    slug: 'pet-cat-dry-food',
    title: 'Premium Cat Dry Food 1 kg',
    description: 'Complete and balanced nutrition for adult cats. Store in a cool, dry place.',
    kind: 'CONSUMABLE',
    sku: 'PET-CAT-FOOD-1K',
    packSize: '1 kg',
    sellMinor: '44900',
    listMinor: '54900',
    image: 'https://placehold.co/480x480/png?text=Cat+Food',
    attributes: {
      vertical: 'pet-care',
      pet_type: 'cat',
      manufacturer_name: 'PetDemo Nutrition',
      highlights: ['High protein', 'No artificial colours'],
    },
  },
  {
    slug: 'pet-dog-shampoo',
    title: 'Dog Anti-Tick Shampoo',
    description: 'Medicated shampoo for dogs — helps control ticks and soothes itchy skin.',
    kind: 'CONSUMABLE',
    sku: 'PET-DOG-WASH',
    packSize: '200 ml',
    sellMinor: '27900',
    listMinor: '32900',
    image: 'https://placehold.co/480x480/png?text=Dog+Shampoo',
    attributes: {
      vertical: 'pet-care',
      pet_type: 'dog',
      manufacturer_name: 'PetDemo Grooming',
      highlights: ['Gentle formula', 'Pleasant scent'],
    },
  },
];

const CANCER_CARE_MARKER = 'cancer-anti-nausea';

const CANCER_CARE_PRODUCTS: DemoProduct[] = [
  {
    slug: CANCER_CARE_MARKER,
    title: 'Anti-Nausea Support Tablets',
    description: 'Supportive care for nausea during chemotherapy. Use only as directed by your oncologist.',
    kind: 'OTC',
    sku: 'CANCER-NAUSEA-10',
    packSize: '10 tablets',
    sellMinor: '18900',
    listMinor: '22900',
    image: 'https://placehold.co/480x480/png?text=Anti-Nausea',
    attributes: {
      vertical: 'cancer-care',
      care_type: 'support',
      manufacturer_name: 'OncoSupport Demo',
      highlights: ['Oncologist recommended', 'Gentle formulation'],
    },
  },
  {
    slug: 'cancer-protein-supplement',
    title: 'High-Protein Nutrition Powder',
    description: 'Protein supplement to support nutrition during cancer treatment. Consult your care team.',
    kind: 'CONSUMABLE',
    sku: 'CANCER-PROTEIN-400',
    packSize: '400 g',
    sellMinor: '89900',
    listMinor: '109900',
    image: 'https://placehold.co/480x480/png?text=Protein+Powder',
    attributes: {
      vertical: 'cancer-care',
      care_type: 'nutrition',
      manufacturer_name: 'NutriOnco Demo',
      highlights: ['Easy to digest', 'Vanilla flavour'],
    },
  },
  {
    slug: 'cancer-mouth-ulcer-gel',
    title: 'Oral Mucositis Relief Gel',
    description: 'Soothing gel for mouth ulcers and dryness during treatment. For topical oral use.',
    kind: 'OTC',
    sku: 'CANCER-ORAL-GEL',
    packSize: '15 g',
    sellMinor: '24900',
    listMinor: '29900',
    image: 'https://placehold.co/480x480/png?text=Oral+Gel',
    attributes: {
      vertical: 'cancer-care',
      care_type: 'comfort',
      manufacturer_name: 'OncoSupport Demo',
      highlights: ['Alcohol-free', 'Fast soothing relief'],
    },
  },
  {
    slug: 'cancer-immunity-tablets',
    title: 'Immunity Support Tablets',
    description: 'Vitamin and mineral blend to support immunity during recovery. Not a substitute for prescribed therapy.',
    kind: 'OTC',
    sku: 'CANCER-IMMUNE-30',
    packSize: '30 tablets',
    sellMinor: '44900',
    listMinor: '54900',
    image: 'https://placehold.co/480x480/png?text=Immunity',
    attributes: {
      vertical: 'cancer-care',
      care_type: 'support',
      manufacturer_name: 'OncoSupport Demo',
      highlights: ['Zinc + Vitamin C', 'Daily support'],
    },
  },
  {
    slug: 'cancer-pain-relief-gel',
    title: 'Topical Pain Relief Gel',
    description: 'External gel for localized discomfort. Follow your pain management plan from your doctor.',
    kind: 'OTC',
    sku: 'CANCER-PAIN-GEL',
    packSize: '30 g',
    sellMinor: '15900',
    listMinor: '19900',
    image: 'https://placehold.co/480x480/png?text=Pain+Gel',
    attributes: {
      vertical: 'cancer-care',
      care_type: 'comfort',
      manufacturer_name: 'OncoSupport Demo',
      highlights: ['Non-greasy', 'Targeted relief'],
    },
  },
];

const AYURVEDA_MARKER = 'ayur-ashwagandha';

const AYURVEDA_PRODUCTS: DemoProduct[] = [
  {
    slug: AYURVEDA_MARKER,
    title: 'Ashwagandha 500mg Capsules',
    description: 'Ayurvedic adaptogen traditionally used for stress and vitality support. Consult an Ayurvedic practitioner.',
    kind: 'OTC',
    sku: 'AYUR-ASHWA-60',
    packSize: '60 capsules',
    sellMinor: '34900',
    listMinor: '42900',
    image: 'https://placehold.co/480x480/png?text=Ashwagandha',
    attributes: {
      vertical: 'ayurveda',
      tradition: 'ayurveda',
      manufacturer_name: 'AyurDemo Wellness',
      highlights: ['KSM-66 grade', 'Daily wellness'],
    },
  },
  {
    slug: 'ayur-triphala',
    title: 'Triphala Digestive Tablets',
    description: 'Classic Ayurvedic blend for digestive balance. Take as directed by your practitioner.',
    kind: 'OTC',
    sku: 'AYUR-TRIP-90',
    packSize: '90 tablets',
    sellMinor: '22900',
    listMinor: '27900',
    image: 'https://placehold.co/480x480/png?text=Triphala',
    attributes: {
      vertical: 'ayurveda',
      tradition: 'ayurveda',
      manufacturer_name: 'AyurDemo Wellness',
      highlights: ['Three-fruit formula', 'Gut health support'],
    },
  },
  {
    slug: 'ayur-chyawanprash',
    title: 'Chyawanprash Immunity Paste',
    description: 'Traditional Ayurvedic immunity paste with amla and herbs. Suitable for daily family use.',
    kind: 'CONSUMABLE',
    sku: 'AYUR-CHYAW-500',
    packSize: '500 g',
    sellMinor: '39900',
    listMinor: '49900',
    image: 'https://placehold.co/480x480/png?text=Chyawanprash',
    attributes: {
      vertical: 'ayurveda',
      tradition: 'ayurveda',
      manufacturer_name: 'AyurDemo Wellness',
      highlights: ['Rich in Vitamin C', 'Seasonal wellness'],
    },
  },
  {
    slug: 'ayur-homeo-arnica',
    title: 'Arnica Montana 30C Pellets',
    description: 'Homeopathic medicine for bruising and muscle soreness. Follow homeopath guidance.',
    kind: 'OTC',
    sku: 'HOME-ARNICA-30C',
    packSize: '4 g pellets',
    sellMinor: '12900',
    listMinor: '15900',
    image: 'https://placehold.co/480x480/png?text=Arnica+30C',
    attributes: {
      vertical: 'ayurveda',
      tradition: 'homeopathy',
      manufacturer_name: 'HomeoDemo Remedies',
      highlights: ['Classic remedy', 'Easy-dissolve pellets'],
    },
  },
  {
    slug: 'ayur-homeo-nux-vomica',
    title: 'Nux Vomica 30C Pellets',
    description: 'Homeopathic remedy commonly used for digestive discomfort. Consult a qualified homeopath.',
    kind: 'OTC',
    sku: 'HOME-NUX-30C',
    packSize: '4 g pellets',
    sellMinor: '11900',
    listMinor: '14900',
    image: 'https://placehold.co/480x480/png?text=Nux+Vomica',
    attributes: {
      vertical: 'ayurveda',
      tradition: 'homeopathy',
      manufacturer_name: 'HomeoDemo Remedies',
      highlights: ['Digestive support', 'Trusted potency'],
    },
  },
];

const VACCINE_MARKER = 'vaccine-influenza';

const ADULT_VACCINES = [
  {
    slug: VACCINE_MARKER,
    title: 'Influenza (Flu) Vaccine',
    description: 'Seasonal flu protection — book at partner clinic or home visit where available.',
    sellMinor: 89900,
    listMinor: 109900,
    packSize: '1 dose',
  },
  {
    slug: 'vaccine-hepatitis-b',
    title: 'Hepatitis B Vaccine',
    description: 'Recommended for adults at risk — multi-dose schedule per clinical guidance.',
    sellMinor: 59900,
    listMinor: 74900,
    packSize: '1 dose',
  },
  {
    slug: 'vaccine-typhoid',
    title: 'Typhoid Vaccine',
    description: 'Travel and endemic area protection — consult your doctor before booking.',
    sellMinor: 129900,
    listMinor: 159900,
    packSize: '1 dose',
  },
  {
    slug: 'vaccine-hpv',
    title: 'HPV Vaccine',
    description: 'Cervical and HPV-related cancer prevention for eligible adults.',
    sellMinor: 349900,
    listMinor: 399900,
    packSize: '1 dose',
  },
  {
    slug: 'vaccine-shingles',
    title: 'Shingles (Herpes Zoster) Vaccine',
    description: 'Recommended for adults 50+ — reduces shingles risk and complications.',
    sellMinor: 499900,
    listMinor: 549900,
    packSize: '1 dose',
  },
] as const;

function seedPrincipal(personId: string): Principal {
  return {
    personId,
    sessionId: 'dev-sandbox-seed',
    audience: 'admin',
    roles: [],
    tokenVersion: 0,
  };
}

@Injectable()
export class DevSandboxSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevSandboxSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyCache: PolicyCache,
    private readonly catalog: CatalogService,
    private readonly marketplace: MarketplaceEligibilityService,
    private readonly labCapability: LabCapabilityService,
    private readonly radiologyCapability: RadiologyCapabilityService,
    private readonly inventory: InventoryService,
    private readonly cmsSearch: CmsSearchService,
    private readonly transactional: DevTransactionalSeedService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Never seed demo/sandbox fixtures into production or production-flagged infra.
    const gate = shouldSkipDemoFixtureSeed();
    if (gate.skip) {
      if (gate.reason && process.env.NODE_ENV === 'development') {
        this.logger.warn(`Skipping dev sandbox seed: ${gate.reason}`);
      }
      return;
    }
    try {
      await this.seedIfNeeded();
      await this.seedMarketCountriesIfNeeded();
      await this.seedEcosystemContent();
      await this.mirrorXxCatalogToMarketsIfNeeded();
      await this.seedDemoJourneysIfMissing();
      await this.ensureDemoLabFieldStaffPartners();
      await this.ensureDemoRadiologyFieldStaffPartners();
      await this.transactional.seedIfNeeded();
      await this.ensureIncrementalDemoOps();
      await this.ensurePartnerPasswordLoginCredentials();
      await this.ensurePartnerPlatformFeePolicyFields();
      await this.ensureSandboxRiderOnline();
    } catch (err) {
      this.logger.error(`Dev sandbox seed failed: ${(err as Error).message}`);
    }
  }

  private async seedIfNeeded(): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: MARKER_SLUG } });
    if (existing) {
      this.logger.log('Dev sandbox already seeded — skipping');
      return;
    }
    this.logger.log('Seeding development sandbox (medicines, doctor, lab, delivery)...');
    const country = await this.prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await this.publishSandboxPolicy(country.id);
    const admin = await this.ensurePerson(ADMIN_EMAIL);
    await this.ensureSuperAdmin(admin);
    const vendorPerson = await this.ensurePerson(VENDOR_EMAIL);
    const doctorPerson = await this.ensurePerson(DOCTOR_EMAIL);
    const labPerson = await this.ensurePerson(LAB_EMAIL);
    const deliveryPerson = await this.ensurePerson(DELIVERY_EMAIL);
    const vendorOrg = await this.ensureOrg(country.id, OrganizationKind.VENDOR, 'Demo Vendor', 'Demo Pharmacy Store');
    const labOrg = await this.ensureOrg(country.id, OrganizationKind.LAB, 'Demo Diagnostics Lab', 'Demo Lab');
    await this.ensureMembership(vendorPerson, 'org_owner', vendorOrg.id);
    await this.ensureMembership(labPerson, 'org_owner', labOrg.id);
    const location = await this.ensureWarehouse(vendorOrg.id, country.id);
    const adminPrincipal = seedPrincipal(admin);
    const vendorPrincipal = seedPrincipal(vendorPerson);
    const labPrincipal = seedPrincipal(labPerson);
    await this.marketplace.attest(vendorPrincipal, vendorOrg.id, MARKETPLACE_ATTESTATION_CODE);
    await this.marketplace.setAcceptance(admin, vendorOrg.id, 'accept');
    await this.labCapability.attest(labPrincipal, labOrg.id, LAB_PARTNER_ATTESTATION_CODE);
    await this.labCapability.setAcceptance(admin, labOrg.id, 'accept');
    const brand = await this.catalog.createBrand({ slug: 'demo-brand', name: 'Demo Brand' });
    for (const product of DEMO_PRODUCTS) {
      await this.seedProduct(adminPrincipal, vendorPrincipal, vendorOrg.id, location.id, country.id, brand.id, product);
    }
    await this.seedLabTest(adminPrincipal, labPrincipal, labOrg.id, country.id);
    await this.seedFullBodyPackages(adminPrincipal, labPrincipal, labOrg.id, country.id);
    const imagingPerson = await this.ensurePerson(IMAGING_EMAIL);
    const imagingOrg = await this.ensureOrg(
      country.id,
      OrganizationKind.IMAGING_CENTER,
      'Demo Imaging Center',
      'Demo Radiology',
    );
    await this.ensureMembership(imagingPerson, 'org_owner', imagingOrg.id);
    const imagingPrincipal = seedPrincipal(imagingPerson);
    await this.radiologyCapability.attest(imagingPrincipal, imagingOrg.id, RADIOLOGY_PARTNER_ATTESTATION_CODE);
    await this.radiologyCapability.setAcceptance(admin, imagingOrg.id, 'accept');
    await this.ensureImagingLocation(imagingOrg.id, country.id);
    await this.seedImagingStudy(adminPrincipal, imagingPrincipal, imagingOrg.id, country.id);
    await seedDoctorPartner(this.prisma, country.id, { personId: doctorPerson }, 'sandbox');
    const doctorPartner = await this.prisma.partner.findFirstOrThrow({
      where: { personId: doctorPerson, partnerTypeCode: 'DOCTOR', countryId: country.id },
    });
    await this.prisma.doctorProfile.updateMany({
      where: { partnerId: doctorPartner.id },
      data: {
        displayName: 'Dr. Demo Physician',
        professionalName: 'Dr. Demo',
        bio: 'General physician — sandbox demo profile only.',
        specialties: ['General Medicine'],
        languages: ['en'],
        onlineCapable: true,
      },
    });
    await this.prisma.partner.upsert({
      where: {
        personId_partnerTypeCode_countryId: {
          personId: deliveryPerson,
          partnerTypeCode: 'DELIVERY_PARTNER',
          countryId: country.id,
        },
      },
      create: {
        id: uuidv7(),
        personId: deliveryPerson,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: country.id,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
      update: { status: PartnerStatus.ACTIVE },
    });
    this.logger.log('Dev sandbox seed complete — browse http://localhost:3000');
  }

  private async publishSandboxPolicy(countryId: string): Promise<void> {
    const document = buildSandboxPolicyDocument();
    const validated = validatePolicyDocument(document);
    if (!validated.ok) {
      throw new Error(validated.errors.join('; '));
    }
    const checksum = createHash('sha256').update(JSON.stringify(document)).digest('hex');
    const version = await nextPolicyPackVersion(this.prisma, countryId);
    await this.prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { status: PolicyPackStatus.SUPERSEDED },
    });
    const pack = await this.prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version,
        status: PolicyPackStatus.PUBLISHED,
        document: document as never,
        checksum,
        publishedAt: new Date(),
      },
    });
    await this.prisma.country.update({
      where: { id: countryId },
      data: { publishedPolicyPackId: pack.id },
    });
    await this.policyCache.invalidate('XX');
  }

  private async seedMarketCountriesIfNeeded(): Promise<void> {
    const specs: MarketSeedSpec[] = [
      {
        country: INDIA_COUNTRY,
        buildPolicy: buildIndiaPolicyDocument,
        logLine: 'India policy pack published (INR, UPI, COD, loyalty)',
      },
      {
        country: US_COUNTRY,
        buildPolicy: buildUsPolicyDocument,
        logLine: 'United States policy pack published (USD, card, wallet, loyalty)',
      },
      {
        country: UAE_COUNTRY,
        buildPolicy: buildUaePolicyDocument,
        logLine: 'UAE policy pack published (AED, card, COD, loyalty)',
      },
    ];
    for (const spec of specs) {
      await this.seedMarketCountryIfNeeded(spec);
    }
  }

  private async seedMarketCountryIfNeeded(spec: MarketSeedSpec): Promise<void> {
    const { country, buildPolicy, logLine } = spec;
    const marker = await this.prisma.country.findUnique({ where: { isoAlpha2: country.isoAlpha2 } });
    const document = buildPolicy();
    const validated = validatePolicyDocument(document);
    if (!validated.ok) {
      throw new Error(`${country.isoAlpha2} pack invalid: ${validated.errors.join('; ')}`);
    }
    const checksum = createHash('sha256').update(JSON.stringify(document)).digest('hex');
    if (marker?.publishedPolicyPackId) {
      const published = await this.prisma.policyPack.findUnique({
        where: { id: marker.publishedPolicyPackId },
      });
      if (published?.checksum === checksum) {
        return;
      }
      this.logger.log(`Republishing ${country.isoAlpha2} demo policy pack (document changed)…`);
    } else {
      const displayName = country.nameI18n.en ?? country.isoAlpha2;
      this.logger.log(`Seeding ${displayName} (${country.isoAlpha2}) country + demo policy pack…`);
    }
    let row = marker;
    if (!row) {
      row = await this.prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: country.isoAlpha2,
          isoAlpha3: country.isoAlpha3,
          nameI18n: country.nameI18n as never,
          status: CountryStatus.ACTIVE,
          defaultLocale: country.defaultLocale,
          defaultCurrency: country.defaultCurrency,
          defaultTimezone: country.defaultTimezone,
          phonePrefix: country.phonePrefix,
          dataResidencyMode: 'shared',
        },
      });
    }
    const version = await nextPolicyPackVersion(this.prisma, row.id);
    await this.prisma.policyPack.updateMany({
      where: { countryId: row.id, status: PolicyPackStatus.PUBLISHED },
      data: { status: PolicyPackStatus.SUPERSEDED },
    });
    const pack = await this.prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: row.id,
        version,
        status: PolicyPackStatus.PUBLISHED,
        document: document as never,
        checksum,
        publishedAt: new Date(),
      },
    });
    await this.prisma.country.update({
      where: { id: row.id },
      data: { publishedPolicyPackId: pack.id },
    });
    await this.policyCache.invalidate(country.isoAlpha2);
    this.logger.log(logLine);
  }

  /** Mirror XX demo assortment, local-currency offers, pharmacy stock, and doctor partner into demo markets. */
  private async mirrorXxCatalogToMarketsIfNeeded(): Promise<void> {
    for (const config of MARKET_MIRROR_CONFIGS) {
      await this.mirrorXxCatalogToMarketIfNeeded(config);
    }
  }

  private async mirrorXxCatalogToMarketIfNeeded(config: (typeof MARKET_MIRROR_CONFIGS)[number]): Promise<void> {
    const market = await this.prisma.country.findUnique({ where: { isoAlpha2: config.isoAlpha2 } });
    const xx = await this.prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!market || !xx) {
      return;
    }
    const markerItem = await this.prisma.catalogItem.findFirst({ where: { slug: MARKER_SLUG } });
    if (!markerItem) {
      return;
    }

    this.logger.log(`Syncing XX sandbox catalog to ${config.isoAlpha2}…`);
    const adminPersonId = await this.ensurePerson(ADMIN_EMAIL);
    const adminPrincipal = seedPrincipal(adminPersonId);
    const vendorPerson = await this.ensurePerson(VENDOR_EMAIL);
    const vendor = seedPrincipal(vendorPerson);
    const labPerson = await this.ensurePerson(LAB_EMAIL);
    const labUser = seedPrincipal(labPerson);
    const imagingPerson = await this.ensurePerson(IMAGING_EMAIL);
    const imagingUser = seedPrincipal(imagingPerson);
    const doctorPerson = await this.ensurePerson(DOCTOR_EMAIL);

    const marketPartners = await this.ensureMarketPartnerOrgs(
      market.id,
      adminPersonId,
      vendor,
      labUser,
      imagingUser,
    );

    const xxAssortments = await this.prisma.catalogItemCountry.findMany({ where: { countryId: xx.id } });
    let assortmentCount = 0;
    for (const row of xxAssortments) {
      const exists = await this.prisma.catalogItemCountry.findFirst({
        where: { itemId: row.itemId, countryId: market.id },
      });
      if (exists) {
        continue;
      }
      await this.prisma.catalogItemCountry.create({
        data: {
          id: uuidv7(),
          itemId: row.itemId,
          countryId: market.id,
          available: row.available,
          rxRequired: row.rxRequired,
          regulatedClass: row.regulatedClass,
          maxQtyPerOrder: row.maxQtyPerOrder,
          legalName: row.legalName,
          attributes: row.attributes as never,
          complianceNote: row.complianceNote,
        },
      });
      assortmentCount += 1;
    }

    const xxOffers = await this.prisma.catalogOffer.findMany({
      where: { countryId: xx.id, status: OfferStatus.PUBLISHED },
      include: { prices: { where: { isCurrent: true }, take: 1 } },
    });
    let offerCount = 0;
    for (const offer of xxOffers) {
      const price = offer.prices[0];
      if (!price) {
        continue;
      }
      const sellerOrgId = await this.resolveMarketSellerOrg(offer.sellerOrgId, marketPartners);
      const duplicate = await this.prisma.catalogOffer.findFirst({
        where: { variantId: offer.variantId, countryId: market.id, sellerOrgId },
      });
      if (duplicate) {
        continue;
      }
      const principal = this.offerPrincipal(offer.ownership, {
        vendor,
        labUser,
        imagingUser,
        admin: adminPrincipal,
      });
      const marketOffer = await this.catalog.createOffer(principal, {
        variantId: offer.variantId,
        sellerOrgId,
        countryCode: config.isoAlpha2,
        ownership: offer.ownership,
        currency: config.currency,
        costMinor: Number(price.costMinor),
        sellMinor: Number(price.sellMinor),
        listMinor: price.listMinor === null ? null : Number(price.listMinor),
      });
      await this.catalog.publishOffer(principal, marketOffer.id);
      offerCount += 1;
    }

    await this.mirrorMarketPharmacyInventory(
      vendor,
      marketPartners.vendorOrgId,
      marketPartners.vendorLocationId,
      config.seedKey,
      market.id,
    );

    const doctorPartner = await seedDoctorPartner(
      this.prisma,
      market.id,
      { personId: doctorPerson },
      `sandbox-${config.seedKey}`,
    );
    await this.prisma.doctorProfile.updateMany({
      where: { partnerId: doctorPartner.id },
      data: {
        displayName: 'Dr. Demo Physician',
        professionalName: 'Dr. Demo',
        bio: `General physician — sandbox demo profile for ${config.doctorBioSuffix}`,
        specialties: ['General Medicine'],
        languages: config.doctorLanguages,
        onlineCapable: true,
      },
    });

    await this.ensureMarketLoyaltyDemo(market.id, config.seedKey);

    this.logger.log(
      `${config.isoAlpha2} catalog sync complete — +${assortmentCount} assortments, +${offerCount} ${config.currency} offers`,
    );
  }

  private async ensureMarketPartnerOrgs(
    marketId: string,
    adminPersonId: string,
    vendor: Principal,
    labUser: Principal,
    imagingUser: Principal,
  ): Promise<{ vendorOrgId: string; labOrgId: string; imagingOrgId: string; vendorLocationId: string }> {
    const vendorOrg = await this.ensureOrg(marketId, OrganizationKind.VENDOR, 'Demo Vendor', 'Demo Pharmacy Store');
    const labOrg = await this.ensureOrg(marketId, OrganizationKind.LAB, 'Demo Diagnostics Lab', 'Demo Lab');
    const imagingOrg = await this.ensureOrg(
      marketId,
      OrganizationKind.IMAGING_CENTER,
      'Demo Imaging Center',
      'Demo Radiology',
    );
    await this.ensureMembership(vendor.personId, 'org_owner', vendorOrg.id);
    await this.ensureMembership(labUser.personId, 'org_owner', labOrg.id);
    await this.ensureMembership(imagingUser.personId, 'org_owner', imagingOrg.id);
    await this.marketplace.attest(vendor, vendorOrg.id, MARKETPLACE_ATTESTATION_CODE);
    await this.marketplace.setAcceptance(adminPersonId, vendorOrg.id, 'accept');
    await this.labCapability.attest(labUser, labOrg.id, LAB_PARTNER_ATTESTATION_CODE);
    await this.labCapability.setAcceptance(adminPersonId, labOrg.id, 'accept');
    await this.radiologyCapability.attest(imagingUser, imagingOrg.id, RADIOLOGY_PARTNER_ATTESTATION_CODE);
    await this.radiologyCapability.setAcceptance(adminPersonId, imagingOrg.id, 'accept');
    const vendorLocation = await this.ensureWarehouse(vendorOrg.id, marketId);
    await this.ensureImagingLocation(imagingOrg.id, marketId);
    return {
      vendorOrgId: vendorOrg.id,
      labOrgId: labOrg.id,
      imagingOrgId: imagingOrg.id,
      vendorLocationId: vendorLocation.id,
    };
  }

  private async resolveMarketSellerOrg(
    xxSellerOrgId: string,
    marketPartners: { vendorOrgId: string; labOrgId: string; imagingOrgId: string },
  ): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: xxSellerOrgId } });
    if (!org) {
      return xxSellerOrgId;
    }
    switch (org.kind) {
      case OrganizationKind.VENDOR:
        return marketPartners.vendorOrgId;
      case OrganizationKind.LAB:
        return marketPartners.labOrgId;
      case OrganizationKind.IMAGING_CENTER:
        return marketPartners.imagingOrgId;
      default:
        return xxSellerOrgId;
    }
  }

  private offerPrincipal(
    ownership: OfferOwnership,
    principals: { vendor: Principal; labUser: Principal; imagingUser: Principal; admin: Principal },
  ): Principal {
    switch (ownership) {
      case OfferOwnership.VENDOR_OWNED:
      case OfferOwnership.MARKETPLACE:
        return principals.vendor;
      case OfferOwnership.LAB_OWNED:
        return principals.labUser;
      case OfferOwnership.IMAGING_OWNED:
        return principals.imagingUser;
      default:
        return principals.admin;
    }
  }

  private async mirrorMarketPharmacyInventory(
    vendor: Principal,
    vendorOrgId: string,
    locationId: string,
    seedKey: string,
    marketId: string,
  ): Promise<void> {
    const xx = await this.prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!xx) {
      return;
    }
    const xxVendorOrg = await this.prisma.organization.findFirst({
      where: { countryId: xx.id, kind: OrganizationKind.VENDOR, legalName: 'Demo Vendor' },
    });
    if (!xxVendorOrg) {
      return;
    }
    const xxLots = await this.prisma.inventoryLot.findMany({
      where: { ownerOrgId: xxVendorOrg.id, countryId: xx.id, status: InventoryLotStatus.ACTIVE },
      include: { variant: true, balance: true },
    });
    for (const xxLot of xxLots) {
      const balance = xxLot.balance;
      const available =
        (balance?.onHand ?? 0) -
        (balance?.reserved ?? 0) -
        (balance?.damaged ?? 0) -
        (balance?.expired ?? 0) -
        (balance?.quarantined ?? 0) -
        (balance?.returned ?? 0);
      if (available <= 0) {
        continue;
      }
      const sku = xxLot.variant.skuCode;
      const idempotencyKey = `dev-seed-grn-${seedKey}-${sku}`;
      const existingReceipt = await this.prisma.goodsReceipt.findFirst({ where: { idempotencyKey } });
      if (existingReceipt) {
        continue;
      }
      const marketLot = await this.prisma.inventoryLot.findFirst({
        where: {
          variantId: xxLot.variantId,
          ownerOrgId: vendorOrgId,
          countryId: marketId,
          status: InventoryLotStatus.ACTIVE,
          balance: { available: { gt: 0 } },
        },
      });
      if (marketLot) {
        continue;
      }
      const receipt = await this.inventory.createGoodsReceipt(vendor, {
        locationId,
        ownerOrgId: vendorOrgId,
        idempotencyKey,
        lines: [
          {
            variantId: xxLot.variantId,
            lotCode: `LOT-${seedKey.toUpperCase()}-${sku}`,
            expiresOn: '2030-12-31',
            qty: 100,
          },
        ],
      });
      await this.inventory.postGoodsReceipt(vendor, receipt.id);
    }
  }

  private async ensureMarketLoyaltyDemo(marketId: string, seedKey: string): Promise<void> {
    const customerPersonId = await this.ensurePerson(CUSTOMER_EMAIL);
    let loyaltyProgram = await this.prisma.loyaltyProgram.findFirst({
      where: { countryId: marketId, code: 'WPDEMO' },
    });
    if (!loyaltyProgram) {
      loyaltyProgram = await this.prisma.loyaltyProgram.create({
        data: {
          id: uuidv7(),
          countryId: marketId,
          code: 'WPDEMO',
          name: 'WorldPharma Rewards',
          status: LoyaltyProgramStatus.ACTIVE,
          pointsPerCurrencyMinor: 100,
          version: 1,
        },
      });
    }
    const loyaltyAccount = await this.prisma.loyaltyAccount.upsert({
      where: { programId_personId: { programId: loyaltyProgram.id, personId: customerPersonId } },
      create: {
        id: uuidv7(),
        programId: loyaltyProgram.id,
        personId: customerPersonId,
        countryId: marketId,
      },
      update: {},
    });
    const ledgerExists = await this.prisma.loyaltyLedgerEntry.findFirst({
      where: { accountId: loyaltyAccount.id, sourceKey: `demo-loyalty-${seedKey}-${customerPersonId}` },
    });
    if (!ledgerExists) {
      await this.prisma.loyaltyLedgerEntry.create({
        data: {
          id: uuidv7(),
          accountId: loyaltyAccount.id,
          countryId: marketId,
          kind: LoyaltyLedgerEntryKind.EARN,
          pointsDelta: 250,
          source: 'dev-seed',
          sourceKey: `demo-loyalty-${seedKey}-${customerPersonId}`,
        },
      });
    }
  }

  private async ensurePerson(email: string): Promise<string> {
    const normalized = normalizeEmail(email);
    const existing = await this.prisma.accountIdentifier.findFirst({
      where: { valueNormalized: normalized, type: IdentifierType.EMAIL },
    });
    if (existing) {
      return existing.personId;
    }
    const personId = uuidv7();
    await this.prisma.person.create({
      data: { id: personId, status: PersonStatus.ACTIVE },
    });
    await this.prisma.account.create({ data: { id: uuidv7(), personId, status: 'ACTIVE' } });
    await this.prisma.accountIdentifier.create({
      data: {
        id: uuidv7(),
        personId,
        type: IdentifierType.EMAIL,
        valueNormalized: normalized,
        verifiedAt: new Date(),
      },
    });
    return personId;
  }

  /** Partner portals: password + registered mobile OTP (idempotent on each API boot). */
  private async ensurePartnerPasswordLoginCredentials(): Promise<void> {
    let updated = 0;
    for (const row of SANDBOX_PARTNER_LOGIN) {
      const personId = await this.ensurePerson(row.email);
      const account = await this.prisma.account.findUnique({ where: { personId } });
      if (!account) {
        continue;
      }
      if (!account.passwordHash) {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { passwordHash: await hashPassword(SANDBOX_PARTNER_PASSWORD) },
        });
        updated += 1;
      }
      const phone = normalizePhone(row.phone);
      if (!phone) {
        continue;
      }
      const existingPhone = await this.prisma.accountIdentifier.findFirst({
        where: { personId, type: IdentifierType.PHONE },
      });
      if (existingPhone) {
        continue;
      }
      const taken = await this.prisma.accountIdentifier.findUnique({
        where: { type_valueNormalized: { type: IdentifierType.PHONE, valueNormalized: phone } },
      });
      if (taken) {
        continue;
      }
      await this.prisma.accountIdentifier.create({
        data: {
          id: uuidv7(),
          personId,
          type: IdentifierType.PHONE,
          valueNormalized: phone,
          verifiedAt: new Date(),
        },
      });
      updated += 1;
    }
    if (updated > 0) {
      this.logger.log(
        `Partner password+mobile login credentials ready (sandbox password: ${SANDBOX_PARTNER_PASSWORD})`,
      );
    }
  }

  /** Ensure published packs carry partner platform-fee knobs (1mg-like defaults). */
  private async ensurePartnerPlatformFeePolicyFields(): Promise<void> {
    const defaults = {
      doctor_platform_fee_bps: 1500,
      lab_platform_fee_bps: 2000,
      delivery_platform_fee_bps: 1500,
      pharmacy_platform_fee_bps: 1800,
      partner_platform_fee_flat_minor: 0,
    };
    const packs = await this.prisma.policyPack.findMany({
      where: { status: PolicyPackStatus.PUBLISHED },
      include: { country: { select: { isoAlpha2: true } } },
    });
    let patched = 0;
    for (const pack of packs) {
      const doc = (pack.document ?? {}) as Record<string, unknown>;
      const commerce = {
        ...((doc.commerce as Record<string, unknown> | undefined) ?? {}),
      };
      let changed = false;
      for (const [key, value] of Object.entries(defaults)) {
        if (typeof commerce[key] !== 'number') {
          commerce[key] = value;
          changed = true;
        }
      }
      if (!changed) {
        continue;
      }
      const nextDoc = { ...doc, commerce };
      const checksum = createHash('sha256').update(JSON.stringify(nextDoc)).digest('hex');
      await this.prisma.policyPack.update({
        where: { id: pack.id },
        data: { document: nextDoc as never, checksum },
      });
      await this.policyCache.invalidate(pack.country.isoAlpha2);
      patched += 1;
    }
    if (patched > 0) {
      this.logger.log(`Patched partner platform-fee fields on ${patched} published policy pack(s)`);
    }
  }

  /** Keep sandbox delivery rider online near demo warehouse so pack→book auto-assigns. */
  private async ensureSandboxRiderOnline(): Promise<void> {
    const personId = await this.ensurePerson(DELIVERY_EMAIL);
    await this.prisma.riderPresence.upsert({
      where: { personId },
      update: {
        online: true,
        updatedAt: new Date(),
        latitude: 28.6139,
        longitude: 77.209,
      },
      create: {
        id: uuidv7(),
        personId,
        online: true,
        latitude: 28.6139,
        longitude: 77.209,
      },
    });
  }

  private async ensureSuperAdmin(personId: string): Promise<void> {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: 'super_admin' } });
    const existing = await this.prisma.membership.findFirst({
      where: { personId, roleId: role.id, scope: 'platform' },
    });
    if (!existing) {
      await this.prisma.membership.create({
        data: { id: uuidv7(), personId, roleId: role.id, scope: 'platform', status: 'ACTIVE' },
      });
    }
  }

  private async ensureMembership(personId: string, roleCode: string, organizationId: string): Promise<void> {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const existing = await this.prisma.membership.findFirst({
      where: { personId, roleId: role.id, organizationId },
    });
    if (!existing) {
      await this.prisma.membership.create({
        data: { id: uuidv7(), personId, roleId: role.id, scope: 'organization', organizationId, status: 'ACTIVE' },
      });
    }
  }

  private async ensureOrg(countryId: string, kind: OrganizationKind, legalName: string, displayName: string) {
    const existing = await this.prisma.organization.findFirst({
      where: { countryId, legalName },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind,
        legalName,
        displayName,
        status: OrganizationStatus.ACTIVE,
      },
    });
  }

  private async ensureWarehouse(orgId: string, countryId: string) {
    const existing = await this.prisma.location.findFirst({
      where: { organizationId: orgId, kind: LocationKind.VENDOR_WAREHOUSE },
    });
    if (existing) {
      // Keep demo warehouse geo/postal so nearest-fulfillment ranking works.
      if (existing.latitude == null || existing.longitude == null || !existing.postalCode) {
        return this.prisma.location.update({
          where: { id: existing.id },
          data: {
            latitude: existing.latitude ?? 28.6139,
            longitude: existing.longitude ?? 77.209,
            postalCode: existing.postalCode ?? '110001',
            city: existing.city ?? 'New Delhi',
            addressLine: existing.addressLine ?? 'Demo Warehouse, Connaught Place',
          },
        });
      }
      return existing;
    }
    return this.prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: orgId,
        countryId,
        kind: LocationKind.VENDOR_WAREHOUSE,
        name: 'Demo Warehouse',
        timezone: 'UTC',
        latitude: 28.6139,
        longitude: 77.209,
        postalCode: '110001',
        city: 'New Delhi',
        addressLine: 'Demo Warehouse, Connaught Place',
      },
    });
  }

  private async seedProduct(
    admin: Principal,
    vendor: Principal,
    vendorOrgId: string,
    locationId: string,
    countryId: string,
    brandId: string,
    product: DemoProduct,
  ) {
    const item = await this.catalog.createItem(admin, {
      slug: product.slug,
      kind: product.kind,
      brandId,
      title: product.title,
      description: product.description,
      countries: [{ countryCode: 'XX', available: true, rxRequired: false }],
      assets: [{ publicUrl: product.image, alt: product.title }],
    });
    await this.prisma.catalogItemCountry.updateMany({
      where: { itemId: item.id, countryId },
      data: { attributes: product.attributes as never },
    });
    await this.catalog.publishItem(admin, item.id);
    const variant = await this.catalog.addVariant(admin, item.id, {
      skuCode: product.sku,
      packSize: product.packSize,
    });
    const offer = await this.catalog.createOffer(vendor, {
      variantId: variant.id,
      sellerOrgId: vendorOrgId,
      countryCode: 'XX',
      ownership: 'VENDOR_OWNED',
      currency: 'XXX',
      costMinor: Math.floor(Number(product.sellMinor) * 0.6),
      sellMinor: product.sellMinor,
      listMinor: product.listMinor,
    });
    await this.catalog.publishOffer(vendor, offer.id);
    const receipt = await this.inventory.createGoodsReceipt(vendor, {
      locationId,
      ownerOrgId: vendorOrgId,
      idempotencyKey: `dev-seed-grn-${product.sku}`,
      lines: [{ variantId: variant.id, lotCode: `LOT-${product.sku}`, expiresOn: '2030-12-31', qty: 100 }],
    });
    await this.inventory.postGoodsReceipt(vendor, receipt.id);
  }

  private async seedLabTest(
    admin: Principal,
    labUser: Principal,
    labOrgId: string,
    countryId: string,
  ) {
    const item = await this.catalog.createItem(labUser, {
      slug: 'demo-lipid-panel',
      kind: 'LAB_TEST',
      createdByOrgId: labOrgId,
      title: 'Lipid Profile Test',
      description: 'Home collection available — sandbox demo lab test.',
      countries: [{ countryCode: 'XX', available: true }],
    });
    await this.catalog.publishItem(admin, item.id);
    const variant = await this.catalog.addVariant(labUser, item.id, {
      skuCode: 'DEMO-LIPID-01',
      packSize: '1 test',
    });
    const offer = await this.catalog.createOffer(labUser, {
      variantId: variant.id,
      sellerOrgId: labOrgId,
      countryCode: 'XX',
      ownership: 'LAB_OWNED',
      currency: 'XXX',
      costMinor: 1000,
      sellMinor: 99900,
    });
    await this.catalog.publishOffer(labUser, offer.id);
  }

  private async seedFullBodyPackages(
    admin: Principal,
    labUser: Principal,
    labOrgId: string,
    countryId: string,
  ) {
    const packages = [
      {
        slug: 'comprehensive-gold-full-body',
        title: 'Comprehensive Gold Full Body Checkup',
        sellMinor: 249900,
        listMinor: 499800,
        packSize: '85 tests',
      },
      {
        slug: 'good-health-silver-package',
        title: 'Good Health Silver Package',
        sellMinor: 74900,
        listMinor: 149800,
        packSize: '62 tests',
      },
      {
        slug: 'comprehensive-platinum-full-body',
        title: 'Comprehensive Platinum Full Body Checkup',
        sellMinor: 399900,
        listMinor: 799800,
        packSize: '92 tests',
      },
      {
        slug: 'good-health-gold-package',
        title: 'Good Health Gold Package',
        sellMinor: 99900,
        listMinor: 199800,
        packSize: '72 tests',
      },
    ] as const;
    for (const pkg of packages) {
      const existing = await this.prisma.catalogItem.findFirst({ where: { slug: pkg.slug } });
      if (existing) continue;
      const item = await this.catalog.createItem(labUser, {
        slug: pkg.slug,
        kind: 'LAB_TEST',
        createdByOrgId: labOrgId,
        title: pkg.title,
        description: `${pkg.packSize} — home collection available. NABL-certified partner lab.`,
        countries: [{ countryCode: 'XX', available: true }],
      });
      await this.catalog.publishItem(admin, item.id);
      const variant = await this.catalog.addVariant(labUser, item.id, {
        skuCode: pkg.slug.toUpperCase().replace(/-/g, '_'),
        packSize: pkg.packSize,
      });
      const offer = await this.catalog.createOffer(labUser, {
        variantId: variant.id,
        sellerOrgId: labOrgId,
        countryCode: 'XX',
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        costMinor: Math.floor(pkg.sellMinor * 0.4),
        sellMinor: pkg.sellMinor,
        listMinor: pkg.listMinor,
      });
      await this.catalog.publishOffer(labUser, offer.id);
    }
  }

  /** Idempotent: categories, product assignments, CMS, imaging demo study. */
  private async seedEcosystemContent(): Promise<void> {
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      return;
    }
    await this.ensureImagingPolicyInPack(country.id);
    await this.seedImagingDemoIfMissing(country.id);
    const adminPersonId = await this.ensurePerson(ADMIN_EMAIL);
    const admin = seedPrincipal(adminPersonId);

    for (const row of FOOTER_CATEGORIES) {
      let category = await this.prisma.catalogCategory.findFirst({ where: { slug: row.slug } });
      if (!category) {
        category = await this.catalog.createCategory({ slug: row.slug, name: row.name });
        this.logger.log(`Created catalog category: ${row.slug}`);
      }
      for (const productSlug of row.productSlugs) {
        let item = await this.prisma.catalogItem.findFirst({ where: { slug: productSlug } });
        if (!item) {
          await this.seedFooterProductIfPossible(country.id, admin, productSlug);
          item = await this.prisma.catalogItem.findFirst({ where: { slug: productSlug } });
        }
        if (item && item.categoryId !== category.id) {
          await this.prisma.catalogItem.update({
            where: { id: item.id },
            data: { categoryId: category.id },
          });
        }
      }
    }

    await this.seedPetCareIfMissing(country.id, admin);
    await this.seedCancerCareIfMissing(country.id, admin);
    await this.seedAyurvedaIfMissing(country.id, admin);
    await this.seedVaccinesIfMissing(country.id, admin);

    const now = new Date();
    let inserted = 0;
    for (const article of ECOSYSTEM_CMS) {
      let item = await this.prisma.cmsContentItem.findFirst({
        where: { countryId: country.id, slug: article.slug, locale: 'en' },
      });
      if (!item) {
        const id = uuidv7();
        item = await this.prisma.cmsContentItem.create({
          data: {
            id,
            countryId: country.id,
            contentType: article.contentType,
            slug: article.slug,
            locale: 'en',
            status: CmsContentStatus.PUBLISHED,
            categorySlug: article.categorySlug,
            title: article.title,
            summary: article.summary ?? '',
            body: article.body,
            authorPersonId: adminPersonId,
            publishedVersion: 1,
          },
        });
        inserted += 1;
      } else if (item.contentType !== article.contentType || item.categorySlug !== article.categorySlug) {
        item = await this.prisma.cmsContentItem.update({
          where: { id: item.id },
          data: { contentType: article.contentType, categorySlug: article.categorySlug },
        });
      }
      const revision = await this.prisma.cmsContentRevision.findFirst({
        where: { contentItemId: item.id },
      });
      if (!revision) {
        await this.prisma.cmsContentRevision.create({
          data: {
            id: uuidv7(),
            contentItemId: item.id,
            revisionNumber: 1,
            title: item.title,
            summary: item.summary,
            body: item.body,
            createdByPersonId: adminPersonId,
          },
        });
      }
      const pub = await this.prisma.cmsContentPublication.findFirst({
        where: { contentItemId: item.id },
      });
      if (!pub) {
        await this.prisma.cmsContentPublication.create({
          data: {
            id: uuidv7(),
            contentItemId: item.id,
            publicationVersion: Math.max(1, item.publishedVersion || 1),
            revisionNumber: 1,
            title: item.title,
            summary: item.summary,
            body: item.body,
            publishedByPersonId: adminPersonId,
            publishedAt: now,
            idempotencyKey: `seed-${item.id}`,
          },
        });
      }
      await this.cmsSearch.upsertPublishedDocument({
        contentItemId: item.id,
        countryId: country.id,
        locale: 'en',
        slug: item.slug,
        contentType: item.contentType,
        categorySlug: item.categorySlug,
        title: item.title,
        body: item.body,
        publishedAt: now,
      });
    }
    if (inserted) {
      this.logger.log(`Ecosystem CMS seed inserted ${inserted} missing articles`);
    }
    void admin;
  }

  private async seedPetCareIfMissing(countryId: string, admin: Principal): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: PET_CARE_MARKER } });
    if (existing) {
      return;
    }
    const vendorOrg = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.VENDOR, legalName: 'Demo Vendor' },
    });
    const vendorPerson = await this.ensurePerson(VENDOR_EMAIL);
    const vendor = seedPrincipal(vendorPerson);
    if (!vendorOrg) {
      return;
    }
    const location = await this.prisma.location.findFirst({
      where: { organizationId: vendorOrg.id, kind: LocationKind.VENDOR_WAREHOUSE },
    });
    if (!location) {
      return;
    }
    const brand = await this.prisma.catalogBrand.findFirst({ where: { slug: 'demo-brand' } });
    if (!brand) {
      return;
    }
    let category = await this.prisma.catalogCategory.findFirst({ where: { slug: 'pet-care' } });
    if (!category) {
      category = await this.catalog.createCategory({ slug: 'pet-care', name: 'Pet Care' });
      this.logger.log('Created catalog category: pet-care');
    }
    this.logger.log('Seeding pet care demo products…');
    for (const product of PET_CARE_PRODUCTS) {
      await this.seedProduct(admin, vendor, vendorOrg.id, location.id, countryId, brand.id, product);
      const item = await this.prisma.catalogItem.findFirst({ where: { slug: product.slug } });
      if (item && item.categoryId !== category.id) {
        await this.prisma.catalogItem.update({
          where: { id: item.id },
          data: { categoryId: category.id },
        });
      }
    }
  }

  private async seedCancerCareIfMissing(countryId: string, admin: Principal): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: CANCER_CARE_MARKER } });
    if (existing) {
      return;
    }
    const vendorOrg = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.VENDOR, legalName: 'Demo Vendor' },
    });
    const vendorPerson = await this.ensurePerson(VENDOR_EMAIL);
    const vendor = seedPrincipal(vendorPerson);
    if (!vendorOrg) {
      return;
    }
    const location = await this.prisma.location.findFirst({
      where: { organizationId: vendorOrg.id, kind: LocationKind.VENDOR_WAREHOUSE },
    });
    if (!location) {
      return;
    }
    const brand = await this.prisma.catalogBrand.findFirst({ where: { slug: 'demo-brand' } });
    if (!brand) {
      return;
    }
    let category = await this.prisma.catalogCategory.findFirst({ where: { slug: 'cancer-care' } });
    if (!category) {
      category = await this.catalog.createCategory({ slug: 'cancer-care', name: 'Cancer Care' });
      this.logger.log('Created catalog category: cancer-care');
    }
    this.logger.log('Seeding cancer care demo products…');
    for (const product of CANCER_CARE_PRODUCTS) {
      await this.seedProduct(admin, vendor, vendorOrg.id, location.id, countryId, brand.id, product);
      const item = await this.prisma.catalogItem.findFirst({ where: { slug: product.slug } });
      if (item && item.categoryId !== category.id) {
        await this.prisma.catalogItem.update({
          where: { id: item.id },
          data: { categoryId: category.id },
        });
      }
    }
  }

  private async seedAyurvedaIfMissing(countryId: string, admin: Principal): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: AYURVEDA_MARKER } });
    if (existing) {
      return;
    }
    const vendorOrg = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.VENDOR, legalName: 'Demo Vendor' },
    });
    const vendorPerson = await this.ensurePerson(VENDOR_EMAIL);
    const vendor = seedPrincipal(vendorPerson);
    if (!vendorOrg) {
      return;
    }
    const location = await this.prisma.location.findFirst({
      where: { organizationId: vendorOrg.id, kind: LocationKind.VENDOR_WAREHOUSE },
    });
    if (!location) {
      return;
    }
    const brand = await this.prisma.catalogBrand.findFirst({ where: { slug: 'demo-brand' } });
    if (!brand) {
      return;
    }
    let category = await this.prisma.catalogCategory.findFirst({ where: { slug: 'ayurveda-homeopathy' } });
    if (!category) {
      category = await this.catalog.createCategory({ slug: 'ayurveda-homeopathy', name: 'Ayurveda & Homeopathy' });
      this.logger.log('Created catalog category: ayurveda-homeopathy');
    }
    this.logger.log('Seeding ayurveda & homeopathy demo products…');
    for (const product of AYURVEDA_PRODUCTS) {
      await this.seedProduct(admin, vendor, vendorOrg.id, location.id, countryId, brand.id, product);
      const item = await this.prisma.catalogItem.findFirst({ where: { slug: product.slug } });
      if (item && item.categoryId !== category.id) {
        await this.prisma.catalogItem.update({
          where: { id: item.id },
          data: { categoryId: category.id },
        });
      }
    }
  }

  private async seedVaccinesIfMissing(countryId: string, admin: Principal): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: VACCINE_MARKER } });
    if (existing) {
      return;
    }
    const labOrg = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.LAB, legalName: 'Demo Diagnostics Lab' },
    });
    const labOrgAlt = labOrg ?? (await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.LAB },
    }));
    if (!labOrgAlt) {
      return;
    }
    const labPerson = await this.ensurePerson(LAB_EMAIL);
    const labUser = seedPrincipal(labPerson);
    let category = await this.prisma.catalogCategory.findFirst({ where: { slug: 'adult-vaccines' } });
    if (!category) {
      category = await this.catalog.createCategory({ slug: 'adult-vaccines', name: 'Adult Vaccines' });
      this.logger.log('Created catalog category: adult-vaccines');
    }
    this.logger.log('Seeding adult vaccine demo catalog…');
    for (const vaccine of ADULT_VACCINES) {
      const item = await this.catalog.createItem(labUser, {
        slug: vaccine.slug,
        kind: 'LAB_TEST',
        createdByOrgId: labOrgAlt.id,
        title: vaccine.title,
        description: vaccine.description,
        countries: [{ countryCode: 'XX', available: true }],
      });
      await this.catalog.publishItem(admin, item.id);
      await this.prisma.catalogItem.update({
        where: { id: item.id },
        data: { categoryId: category.id },
      });
      const variant = await this.catalog.addVariant(labUser, item.id, {
        skuCode: vaccine.slug.toUpperCase().replace(/-/g, '_'),
        packSize: vaccine.packSize,
      });
      const offer = await this.catalog.createOffer(labUser, {
        variantId: variant.id,
        sellerOrgId: labOrgAlt.id,
        countryCode: 'XX',
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        costMinor: Math.floor(vaccine.sellMinor * 0.5),
        sellMinor: vaccine.sellMinor,
        listMinor: vaccine.listMinor,
      });
      await this.catalog.publishOffer(labUser, offer.id);
    }
  }

  private async seedFooterProductIfPossible(countryId: string, admin: Principal, productSlug: string): Promise<void> {
    const vendorOrg = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.VENDOR, legalName: 'Demo Vendor' },
    });
    const vendorPerson = await this.ensurePerson(VENDOR_EMAIL);
    const vendor = seedPrincipal(vendorPerson);
    if (!vendorOrg) {
      return;
    }
    const location = await this.prisma.location.findFirst({
      where: { organizationId: vendorOrg.id, kind: LocationKind.VENDOR_WAREHOUSE },
    });
    if (!location) {
      return;
    }
    const brand = await this.prisma.catalogBrand.findFirst({ where: { slug: 'demo-brand' } });
    if (!brand) {
      return;
    }
    const product = DEMO_PRODUCTS.find((row) => row.slug === productSlug);
    if (!product) {
      return;
    }
    await this.seedProduct(admin, vendor, vendorOrg.id, location.id, countryId, brand.id, product);
    this.logger.log(`Seeded demo product for footer category: ${productSlug}`);
  }

  private async ensureImagingLocation(imagingOrgId: string, countryId: string) {
    const existing = await this.prisma.location.findFirst({
      where: { organizationId: imagingOrgId, kind: LocationKind.IMAGING },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: imagingOrgId,
        countryId,
        kind: LocationKind.IMAGING,
        name: 'Demo Imaging Suite',
        city: 'Demo City',
        isActive: true,
        timezone: 'UTC',
      },
    });
  }

  private async seedImagingStudy(
    admin: Principal,
    imagingUser: Principal,
    imagingOrgId: string,
    _countryId: string,
  ): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: IMAGING_STUDY_SLUG } });
    if (existing) {
      return;
    }
    const item = await this.catalog.createItem(imagingUser, {
      slug: IMAGING_STUDY_SLUG,
      kind: 'IMAGING_STUDY',
      createdByOrgId: imagingOrgId,
      title: 'Chest X-Ray',
      description: 'Standard chest radiograph at a partner imaging center — sandbox demo listing.',
      countries: [{ countryCode: 'XX', available: true }],
    });
    await this.catalog.publishItem(admin, item.id);
    const variant = await this.catalog.addVariant(imagingUser, item.id, {
      skuCode: 'DEMO-XRAY-01',
      packSize: '1 study',
    });
    const offer = await this.catalog.createOffer(imagingUser, {
      variantId: variant.id,
      sellerOrgId: imagingOrgId,
      countryCode: 'XX',
      ownership: 'IMAGING_OWNED',
      currency: 'XXX',
      costMinor: 50000,
      sellMinor: 149900,
      listMinor: '199900',
    });
    await this.catalog.publishOffer(imagingUser, offer.id);
    this.logger.log('Seeded demo chest X-ray imaging study');
  }

  private async ensureImagingPolicyInPack(countryId: string): Promise<void> {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (!country.publishedPolicyPackId) {
      await this.publishSandboxPolicy(countryId);
      return;
    }
    const pack = await this.prisma.policyPack.findUnique({ where: { id: country.publishedPolicyPackId } });
    const doc = pack?.document as { services?: { imaging_center?: boolean } } | null | undefined;
    if (doc?.services?.imaging_center) {
      return;
    }
    this.logger.log('Refreshing sandbox policy pack to enable imaging services…');
    await this.publishSandboxPolicy(countryId);
  }

  private async seedImagingDemoIfMissing(countryId: string): Promise<void> {
    const existing = await this.prisma.catalogItem.findFirst({ where: { slug: IMAGING_STUDY_SLUG } });
    if (existing) {
      return;
    }
    let imagingOrg = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.IMAGING_CENTER, legalName: 'Demo Imaging Center' },
    });
    const imagingPerson = await this.ensurePerson(IMAGING_EMAIL);
    const adminPersonId = await this.ensurePerson(ADMIN_EMAIL);
    if (!imagingOrg) {
      imagingOrg = await this.ensureOrg(
        countryId,
        OrganizationKind.IMAGING_CENTER,
        'Demo Imaging Center',
        'Demo Radiology',
      );
      await this.ensureMembership(imagingPerson, 'org_owner', imagingOrg.id);
    }
    const admin = seedPrincipal(adminPersonId);
    const imaging = seedPrincipal(imagingPerson);
    await this.radiologyCapability.attest(imaging, imagingOrg.id, RADIOLOGY_PARTNER_ATTESTATION_CODE);
    await this.radiologyCapability.setAcceptance(adminPersonId, imagingOrg.id, 'accept');
    await this.ensureImagingLocation(imagingOrg.id, countryId);
    await this.seedImagingStudy(admin, imaging, imagingOrg.id, countryId);
  }

  /** Incremental demo identities — idempotent even when catalog/customer already exist. */
  private async seedDemoJourneysIfMissing(): Promise<void> {
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      return;
    }
    this.logger.log('Ensuring demo journey identities (customer, affiliate, lab staff)...');

    const adminPersonId = await this.ensurePerson(ADMIN_EMAIL);
    const customerPersonId = await this.ensurePerson(CUSTOMER_EMAIL);
    const affiliatePersonId = await this.ensurePerson(AFFILIATE_EMAIL);
    const pathologistPersonId = await this.ensurePerson(PATHOLOGIST_EMAIL);
    const phlebotomistPersonId = await this.ensurePerson(PHLEBOTOMIST_EMAIL);

    await this.prisma.person.updateMany({
      where: { id: { in: [customerPersonId, affiliatePersonId, pathologistPersonId, phlebotomistPersonId] } },
      data: { primaryCountryId: country.id },
    });

    const labOrg = await this.prisma.organization.findFirst({
      where: { countryId: country.id, kind: OrganizationKind.LAB, legalName: 'Demo Diagnostics Lab' },
    });
    if (labOrg) {
      await this.ensureDemoLabFieldStaffForOrg(country.id, labOrg.id, pathologistPersonId, phlebotomistPersonId);
    }

    const affiliateOrg = await this.ensureOrg(
      country.id,
      OrganizationKind.AFFILIATE_ORG,
      'Demo Affiliate Org',
      'Demo Affiliate',
    );
    await this.ensureMembership(affiliatePersonId, 'org_owner', affiliateOrg.id);
    await this.prisma.partner.upsert({
      where: {
        personId_partnerTypeCode_countryId: {
          personId: affiliatePersonId,
          partnerTypeCode: 'AFFILIATE',
          countryId: country.id,
        },
      },
      create: {
        id: uuidv7(),
        personId: affiliatePersonId,
        partnerTypeCode: 'AFFILIATE',
        countryId: country.id,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
      update: { status: PartnerStatus.ACTIVE },
    });
    const affiliatePartner = await this.prisma.partner.findFirstOrThrow({
      where: { personId: affiliatePersonId, partnerTypeCode: 'AFFILIATE', countryId: country.id },
    });
    const existingCode = await this.prisma.affiliateReferralCode.findFirst({
      where: { organizationId: affiliateOrg.id, code: DEMO_REFERRAL_CODE },
    });
    if (!existingCode) {
      await this.prisma.affiliateReferralCode.create({
        data: {
          id: uuidv7(),
          organizationId: affiliateOrg.id,
          countryId: country.id,
          partnerId: affiliatePartner.id,
          code: DEMO_REFERRAL_CODE,
          status: AffiliateReferralCodeStatus.ACTIVE,
          createdByPersonId: adminPersonId,
        },
      });
    }

    let loyaltyProgram = await this.prisma.loyaltyProgram.findFirst({
      where: { countryId: country.id, code: 'WPDEMO' },
    });
    if (!loyaltyProgram) {
      loyaltyProgram = await this.prisma.loyaltyProgram.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          code: 'WPDEMO',
          name: 'WorldPharma Rewards',
          status: LoyaltyProgramStatus.ACTIVE,
          pointsPerCurrencyMinor: 100,
          version: 1,
        },
      });
    }
    const loyaltyAccount = await this.prisma.loyaltyAccount.upsert({
      where: { programId_personId: { programId: loyaltyProgram.id, personId: customerPersonId } },
      create: {
        id: uuidv7(),
        programId: loyaltyProgram.id,
        personId: customerPersonId,
        countryId: country.id,
      },
      update: {},
    });
    const ledgerExists = await this.prisma.loyaltyLedgerEntry.findFirst({
      where: { accountId: loyaltyAccount.id },
    });
    if (!ledgerExists) {
      await this.prisma.loyaltyLedgerEntry.create({
        data: {
          id: uuidv7(),
          accountId: loyaltyAccount.id,
          countryId: country.id,
          kind: LoyaltyLedgerEntryKind.EARN,
          pointsDelta: 250,
          source: 'dev-seed',
          sourceKey: `demo-loyalty-${customerPersonId}`,
        },
      });
    }

    this.logger.log(
      `Demo journeys ready — customer: ${CUSTOMER_EMAIL}, affiliate: ${AFFILIATE_EMAIL} (code ${DEMO_REFERRAL_CODE}), pathologist: ${PATHOLOGIST_EMAIL}, phlebotomist: ${PHLEBOTOMIST_EMAIL}, radiologist: ${RADIOLOGIST_EMAIL}, radiologist reviewer: ${RADIOLOGIST_REVIEWER_EMAIL}`,
    );
  }

  /** Idempotent — ensures sandbox radiologists can interpret/verify on every seeded imaging market. */
  private async ensureDemoRadiologyFieldStaffPartners(): Promise<void> {
    const radiologistPersonId = await this.ensurePerson(RADIOLOGIST_EMAIL);
    const reviewerPersonId = await this.ensurePerson(RADIOLOGIST_REVIEWER_EMAIL);
    const centers = await this.prisma.organization.findMany({
      where: {
        kind: OrganizationKind.IMAGING_CENTER,
        legalName: 'Demo Imaging Center',
        status: OrganizationStatus.ACTIVE,
      },
    });
    for (const imagingOrg of centers) {
      await this.ensureDemoRadiologyFieldStaffForOrg(
        imagingOrg.countryId,
        imagingOrg.id,
        radiologistPersonId,
        reviewerPersonId,
      );
    }
  }

  private async ensureDemoRadiologyFieldStaffForOrg(
    countryId: string,
    imagingOrgId: string,
    radiologistPersonId: string,
    reviewerPersonId: string,
  ): Promise<void> {
    await this.ensureMembership(radiologistPersonId, 'org_staff', imagingOrgId);
    await this.ensureMembership(reviewerPersonId, 'org_staff', imagingOrgId);
    for (const personId of [radiologistPersonId, reviewerPersonId]) {
      await this.prisma.partner.upsert({
        where: {
          personId_partnerTypeCode_countryId: {
            personId,
            partnerTypeCode: 'RADIOLOGIST',
            countryId,
          },
        },
        create: {
          id: uuidv7(),
          personId,
          partnerTypeCode: 'RADIOLOGIST',
          countryId,
          status: PartnerStatus.ACTIVE,
          activatedAt: new Date(),
        },
        update: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
      });
    }
  }

  /** Idempotent — ensures sandbox phlebotomist/pathologist can run CoC and sign-off on every seeded lab market. */
  private async ensureDemoLabFieldStaffPartners(): Promise<void> {
    const pathologistPersonId = await this.ensurePerson(PATHOLOGIST_EMAIL);
    const phlebotomistPersonId = await this.ensurePerson(PHLEBOTOMIST_EMAIL);
    const labs = await this.prisma.organization.findMany({
      where: { kind: OrganizationKind.LAB, legalName: 'Demo Diagnostics Lab', status: OrganizationStatus.ACTIVE },
    });
    for (const labOrg of labs) {
      await this.ensureDemoLabFieldStaffForOrg(
        labOrg.countryId,
        labOrg.id,
        pathologistPersonId,
        phlebotomistPersonId,
      );
    }
  }

  private async ensureDemoLabFieldStaffForOrg(
    countryId: string,
    labOrgId: string,
    pathologistPersonId: string,
    phlebotomistPersonId: string,
  ): Promise<void> {
    await this.ensureMembership(pathologistPersonId, 'org_staff', labOrgId);
    await this.ensureMembership(phlebotomistPersonId, 'org_staff', labOrgId);
    await this.prisma.partner.upsert({
      where: {
        personId_partnerTypeCode_countryId: {
          personId: pathologistPersonId,
          partnerTypeCode: 'PATHOLOGIST',
          countryId,
        },
      },
      create: {
        id: uuidv7(),
        personId: pathologistPersonId,
        partnerTypeCode: 'PATHOLOGIST',
        countryId,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
      update: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
    });
    await this.prisma.partner.upsert({
      where: {
        personId_partnerTypeCode_countryId: {
          personId: phlebotomistPersonId,
          partnerTypeCode: 'PHLEBOTOMIST',
          countryId,
        },
      },
      create: {
        id: uuidv7(),
        personId: phlebotomistPersonId,
        partnerTypeCode: 'PHLEBOTOMIST',
        countryId,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
      update: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
    });
  }

  private async ensureIncrementalDemoOps(): Promise<void> {
    const storePersonId = await this.ensurePerson(STORE_EMAIL);
    const vendorOrgs = await this.prisma.organization.findMany({
      where: { kind: OrganizationKind.VENDOR, legalName: 'Demo Vendor', status: OrganizationStatus.ACTIVE },
    });
    for (const org of vendorOrgs) {
      await this.ensureMembership(storePersonId, 'org_staff', org.id);
      await this.ensureMembership(storePersonId, 'org_owner', org.id);
    }

    const affiliatePersonId = await this.ensurePerson(AFFILIATE_EMAIL);
    let affiliateOrgs = await this.prisma.organization.findMany({
      where: { kind: OrganizationKind.AFFILIATE_ORG, status: OrganizationStatus.ACTIVE },
    });
    if (!affiliateOrgs.length) {
      const xx = await this.prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
      const inCountry = await this.prisma.country.findUnique({ where: { isoAlpha2: 'IN' } });
      for (const country of [xx, inCountry]) {
        if (!country) continue;
        const org = await this.ensureOrg(
          country.id,
          OrganizationKind.AFFILIATE_ORG,
          'Demo Affiliate Org',
          'Demo Affiliate',
        );
        affiliateOrgs.push(org);
      }
    }
    for (const org of affiliateOrgs) {
      await this.ensureMembership(affiliatePersonId, 'org_owner', org.id);
      await this.prisma.partner.upsert({
        where: {
          personId_partnerTypeCode_countryId: {
            personId: affiliatePersonId,
            partnerTypeCode: 'AFFILIATE',
            countryId: org.countryId,
          },
        },
        create: {
          id: uuidv7(),
          personId: affiliatePersonId,
          partnerTypeCode: 'AFFILIATE',
          countryId: org.countryId,
          status: PartnerStatus.ACTIVE,
          activatedAt: new Date(),
        },
        update: { status: PartnerStatus.ACTIVE },
      });
    }

    await this.ensurePathologyDemoQueue();
    await this.ensureRadiologyDemoQueue();
    this.logger.log(
      `Incremental demo ops ready — store ${STORE_EMAIL}, affiliate memberships ${affiliateOrgs.length}, pathology+imaging queues`,
    );
  }

  private async ensurePathologyDemoQueue(): Promise<void> {
    const labPersonId = await this.ensurePerson(LAB_EMAIL);
    const pathologistPersonId = await this.ensurePerson(PATHOLOGIST_EMAIL);
    const bookings = await this.prisma.labBooking.findMany({
      where: { sandbox: true },
      include: { sample: true, labReport: true },
      take: 8,
      orderBy: { createdAt: 'asc' },
    });
    for (const booking of bookings) {
      if (booking.labReport) {
        continue;
      }
      const sampleId = booking.sample?.id ?? uuidv7();
      if (!booking.sample) {
        await this.prisma.labSample.create({
          data: {
            id: sampleId,
            labBookingId: booking.id,
            labOrgId: booking.labOrgId,
            countryId: booking.countryId,
            status: LabSampleCocStatus.ACCEPTED_BY_LAB,
            sandbox: true,
          },
        });
      }
      const accessionId = uuidv7();
      const existingAccession = await this.prisma.labAccession.findFirst({
        where: { labSampleId: booking.sample?.id ?? sampleId },
      });
      const accId = existingAccession?.id ?? accessionId;
      if (!existingAccession) {
        await this.prisma.labAccession.create({
          data: {
            id: accessionId,
            labSampleId: booking.sample?.id ?? sampleId,
            labOrgId: booking.labOrgId,
            countryId: booking.countryId,
            accessionNumber: `DEMO-ACC-${booking.id.replace(/-/g, '').slice(0, 10)}`,
            receivedAt: new Date(),
            acceptedAt: new Date(),
            sandbox: true,
          },
        });
      }
      const existingProcessing = await this.prisma.labProcessing.findFirst({
        where: { labAccessionId: accId },
      });
      if (!existingProcessing) {
        await this.prisma.labProcessing.create({
          data: {
            id: uuidv7(),
            labAccessionId: accId,
            labSampleId: booking.sample?.id ?? sampleId,
            labOrgId: booking.labOrgId,
            status: LabProcessingStatus.COMPLETED,
            startedAt: new Date(),
            completedAt: new Date(),
            sandbox: true,
          },
        });
      }
      const reportId = uuidv7();
      const versionId = uuidv7();
      await this.prisma.labReport.create({
        data: {
          id: reportId,
          labAccessionId: accId,
          labSampleId: booking.sample?.id ?? sampleId,
          labBookingId: booking.id,
          labOrgId: booking.labOrgId,
          countryId: booking.countryId,
          assignedPathologistPersonId: pathologistPersonId,
          sandbox: true,
        },
      });
      await this.prisma.labReportVersion.create({
        data: {
          id: versionId,
          labReportId: reportId,
          versionNumber: 1,
          status: LabReportVersionStatus.PENDING_VERIFY,
          summary: 'Sandbox CBC — values within reference; pathologist verify required.',
          enteredByPersonId: labPersonId,
          sandbox: true,
        },
      });
      await this.prisma.labReport.update({
        where: { id: reportId },
        data: { currentVersionId: versionId },
      });
      await this.prisma.labResultLine.create({
        data: {
          id: uuidv7(),
          labReportVersionId: versionId,
          analyteCode: 'HGB',
          analyteName: 'Hemoglobin',
          value: '13.8',
          unit: 'g/dL',
          referenceRange: '12.0–16.0',
          enteredByPersonId: labPersonId,
        },
      });
    }
  }

  private async ensureRadiologyDemoQueue(): Promise<void> {
    const radiologistPersonId = await this.ensurePerson(RADIOLOGIST_EMAIL);
    const imagingPersonId = await this.ensurePerson(IMAGING_EMAIL);
    const bookings = await this.prisma.imagingBooking.findMany({
      where: { sandbox: true },
      include: { study: { include: { report: true } } },
      take: 8,
      orderBy: { createdAt: 'asc' },
    });
    for (const booking of bookings) {
      if (booking.study?.report) {
        continue;
      }
      const studyId = booking.study?.id ?? uuidv7();
      if (!booking.study) {
        await this.prisma.imagingStudy.create({
          data: {
            id: studyId,
            imagingBookingId: booking.id,
            imagingOrgId: booking.imagingOrgId,
            imagingLocationId: booking.imagingLocationId,
            countryId: booking.countryId,
            status: ImagingStudyStatus.ACQUIRED,
            accessionNumber: `IMG-ACC-${booking.id.replace(/-/g, '').slice(0, 10)}`,
            studyInstanceUid: `1.2.826.0.1.3680043.8.498.${booking.id.replace(/-/g, '').slice(0, 16)}`,
            studyDescription: 'Sandbox chest radiograph',
            studyDateTime: new Date(),
            modalityCode: 'CR',
            bodyRegionCode: 'CHEST',
            assigneePersonId: radiologistPersonId,
            sandbox: true,
          },
        });
        await this.prisma.imagingAcquisition.create({
          data: {
            id: uuidv7(),
            imagingStudyId: studyId,
            status: ImagingAcquisitionStatus.COMPLETED,
            technicianPersonId: imagingPersonId,
            startedAt: new Date(),
            completedAt: new Date(),
            sandboxObjectRef: 'sandbox://demo-chest-xray',
            equipmentCode: 'CR-DEMO-1',
            sandbox: true,
          },
        });
      } else if (booking.study.status !== ImagingStudyStatus.ACQUIRED) {
        await this.prisma.imagingStudy.update({
          where: { id: booking.study.id },
          data: { status: ImagingStudyStatus.ACQUIRED, assigneePersonId: radiologistPersonId },
        });
      }
      const reportId = uuidv7();
      const versionId = uuidv7();
      await this.prisma.imagingReport.create({
        data: {
          id: reportId,
          imagingStudyId: studyId,
          imagingBookingId: booking.id,
          imagingOrgId: booking.imagingOrgId,
          countryId: booking.countryId,
          assignedRadiologistPersonId: radiologistPersonId,
          sandbox: true,
        },
      });
      await this.prisma.imagingReportVersion.create({
        data: {
          id: versionId,
          imagingReportId: reportId,
          versionNumber: 1,
          status: ImagingReportVersionStatus.DRAFT,
          summary: 'Sandbox impression pending radiologist findings.',
          enteredByPersonId: radiologistPersonId,
          sandbox: true,
        },
      });
      await this.prisma.imagingReport.update({
        where: { id: reportId },
        data: { currentVersionId: versionId },
      });
    }
  }
}
