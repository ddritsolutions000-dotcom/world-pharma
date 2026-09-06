export type JoinBenefit = { title: string; body: string };
export type JoinFaqItem = { q: string; a: string };
export type JoinPartnerCard = {
  href: string;
  icon: string;
  title: string;
  body: string;
  enabled?: boolean;
};

export type JoinPageDocument = {
  version: 1;
  heroExtra?: string;
  partnerCards?: JoinPartnerCard[];
  benefits: JoinBenefit[];
  steps: string[];
  faq: JoinFaqItem[];
};

function clip(raw: unknown, max: number): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw.trim().slice(0, max);
}

function asBenefits(raw: unknown): JoinBenefit[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const title = clip((row as { title?: unknown }).title, 200);
      const body = clip((row as { body?: unknown }).body, 2000);
      if (!title || !body) {
        return null;
      }
      return { title, body };
    })
    .filter((row): row is JoinBenefit => Boolean(row))
    .slice(0, 12);
}

function asSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((step) => clip(step, 500)).filter(Boolean).slice(0, 12);
}

function asPartnerCards(raw: unknown): JoinPartnerCard[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const cards: JoinPartnerCard[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const href = clip((row as { href?: unknown }).href, 200);
    const icon = clip((row as { icon?: unknown }).icon, 16);
    const title = clip((row as { title?: unknown }).title, 200);
    const body = clip((row as { body?: unknown }).body, 2000);
    const enabled = (row as { enabled?: unknown }).enabled;
    if (!href || !title || !body) {
      continue;
    }
    cards.push({
      href,
      icon: icon || '•',
      title,
      body,
      enabled: enabled === false ? false : undefined,
    });
    if (cards.length >= 12) {
      break;
    }
  }
  return cards;
}

function asFaq(raw: unknown): JoinFaqItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const q = clip((row as { q?: unknown }).q, 300);
      const a = clip((row as { a?: unknown }).a, 2000);
      if (!q || !a) {
        return null;
      }
      return { q, a };
    })
    .filter((row): row is JoinFaqItem => Boolean(row))
    .slice(0, 20);
}

export function parseJoinPageDocument(raw: string | undefined | null): JoinPageDocument | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text.startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.version !== 1) {
      return null;
    }
    const partnerCards = asPartnerCards(parsed.partnerCards);
    return {
      version: 1,
      heroExtra: clip(parsed.heroExtra, 2000) || undefined,
      partnerCards: partnerCards.length ? partnerCards : undefined,
      benefits: asBenefits(parsed.benefits),
      steps: asSteps(parsed.steps),
      faq: asFaq(parsed.faq),
    };
  } catch {
    return null;
  }
}

export function stringifyJoinPageDocument(doc: JoinPageDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function resolveJoinPageContent(
  cms: { title?: string; summary?: string; body?: string } | null | undefined,
  defaults: JoinPageDocument,
  fallbacks: { title: string; summary: string },
): {
  title: string;
  summary: string;
  heroExtra?: string;
  partnerCards: JoinPartnerCard[];
  benefits: JoinBenefit[];
  steps: string[];
  faq: JoinFaqItem[];
} {
  const doc = parseJoinPageDocument(cms?.body) ?? defaults;
  const plainHero = cms?.body && !parseJoinPageDocument(cms.body) ? clip(cms.body, 2000) : undefined;
  const defaultCards = defaults.partnerCards ?? [];
  const docCards = doc.partnerCards ?? [];
  const partnerCards = (docCards.length ? docCards : defaultCards).filter((card) => card.enabled !== false);
  return {
    title: cms?.title?.trim() || fallbacks.title,
    summary: cms?.summary?.trim() || fallbacks.summary,
    heroExtra: doc.heroExtra ?? plainHero,
    partnerCards,
    benefits: doc.benefits.length ? doc.benefits : defaults.benefits,
    steps: doc.steps.length ? doc.steps : defaults.steps,
    faq: doc.faq.length ? doc.faq : defaults.faq,
  };
}

export const DEFAULT_JOIN_HOME_PARTNER_CARDS: JoinPartnerCard[] = [
  {
    href: '/pharmacy',
    icon: '💊',
    title: 'Pharmacy operator',
    body: 'Run a retail pharmacy and fulfil patient orders.',
  },
  {
    href: '/apply?type=VENDOR',
    icon: '🏪',
    title: 'Vendor seller',
    body: 'List medicines and health products on the marketplace.',
  },
  {
    href: '/doctor',
    icon: '👨‍⚕️',
    title: 'Doctor',
    body: 'Offer online consultations and digital prescriptions.',
  },
  {
    href: '/lab',
    icon: '🧪',
    title: 'Diagnostic lab',
    body: 'Publish lab tests and manage sample workflows.',
  },
  {
    href: '/imaging',
    icon: '🏥',
    title: 'Imaging center',
    body: 'Publish imaging slots and radiology report workflows.',
  },
  {
    href: '/delivery',
    icon: '🚚',
    title: 'Delivery partner',
    body: 'Deliver medicines and health packages to patients.',
  },
  {
    href: '/affiliate',
    icon: '🤝',
    title: 'Affiliate',
    body: 'Earn by referring customers to World Pharma.',
  },
];

export const DEFAULT_JOIN_HOME: JoinPageDocument = {
  version: 1,
  partnerCards: DEFAULT_JOIN_HOME_PARTNER_CARDS,
  benefits: [
    {
      title: 'Reach patients through one platform',
      body: 'List pharmacy and health products, fulfil orders, and operate alongside doctors, labs, and imaging partners on World-Pharma.',
    },
    {
      title: 'Operations built for healthcare commerce',
      body: 'Catalog, inventory, order fulfilment, settlements, and support tools are provided for approved partners — not a separate shadow system.',
    },
    {
      title: 'Country-aware onboarding',
      body: 'Required documents depend on your country and partner type. Everything is submitted securely in the apply flow.',
    },
  ],
  steps: [
    'Choose your country and partner type (vendor seller or pharmacy operator where enabled).',
    'Sign in with OTP — the same identity carries through to your portal after approval.',
    'Submit pack-required business documents for company review.',
    'Track application status until approved, then access your vendor or store portal.',
  ],
  faq: [
    {
      q: 'Does World-Pharma manufacture medicines?',
      a: 'No. Partners sell and fulfil through the marketplace. World-Pharma provides the platform, onboarding, and operational tooling.',
    },
    {
      q: 'What documents will I need?',
      a: 'Document types are shown during apply based on your country. Upload only through the secure application — never by email.',
    },
    {
      q: 'Can I apply if public join is disabled for my country?',
      a: 'You can still sign in and track an existing application. New public applications appear only when your country pack enables join for your partner type.',
    },
    {
      q: 'Do I create a second account after approval?',
      a: 'No. Use the same email. Vendor and pharmacy portals use customer-audience OTP with organization membership after activation.',
    },
  ],
};

export const DEFAULT_JOIN_PHARMACY: JoinPageDocument = {
  version: 1,
  benefits: [
    {
      title: 'Operate a pharmacy storefront on one platform',
      body: 'Manage inventory, fulfil prescriptions where enabled, and serve customers through the same commerce kernel as marketplace vendors.',
    },
    {
      title: 'Connected to clinical and logistics workflows',
      body: 'Orders, dispensing cases, shipments, and settlements connect to World-Pharma core systems — not a separate pharmacy engine.',
    },
    {
      title: 'Country-configured compliance',
      body: 'Required documents, partner eligibility, and service availability come from published country policy packs.',
    },
  ],
  steps: [
    'Review country-specific pharmacy operator requirements from the published policy pack.',
    'Sign in with OTP and apply as a PHARMACY partner type where join is enabled.',
    'Submit required compliance documents through the secure KYC flow.',
    'After company review and activation, access the pharmacy store portal.',
  ],
  faq: [
    {
      q: 'Is this different from a marketplace vendor?',
      a: 'Yes. Pharmacy operators use the store portal for dispensing-oriented workflows. Vendor sellers use the vendor portal for catalogue marketplace selling.',
    },
    {
      q: 'What documents will I need?',
      a: 'Document types are defined in your country policy pack and shown during apply. Upload only through the secure application flow.',
    },
    {
      q: 'When can I access the store portal?',
      a: 'After company review approves and activates your application. Use the same email with OTP — no second account.',
    },
  ],
};

export const DEFAULT_JOIN_DOCTOR: JoinPageDocument = {
  version: 1,
  benefits: [
    {
      title: 'Reach patients in your country',
      body: 'Offer online consultations through the WorldPharma marketplace where your country pack enables doctor partners.',
    },
    {
      title: 'Sandbox-safe prescribing workflows',
      body: 'Practice appointment → encounter → draft Rx in sandbox. Live eRx and video remain EXTERNAL_GATED until production providers are wired.',
    },
    {
      title: 'Company-reviewed credentials',
      body: 'Licences and credentials are verified by WorldPharma operations — partners cannot self-approve clinical readiness.',
    },
  ],
  steps: [
    'Review country-specific doctor partner requirements from the published policy pack.',
    'Sign in with OTP and apply as a DOCTOR partner type where join is enabled.',
    'Submit required professional documents and credentials through the secure KYC flow.',
    'After company review and activation, access the Doctor operations portal.',
  ],
  faq: [
    {
      q: 'Is this a live clinical network?',
      a: 'Sandbox applications do not create production licences. Live eRx and teleconsult video stay EXTERNAL_GATED until authorized providers are configured.',
    },
    {
      q: 'Can I approve my own credentials?',
      a: 'No. Credential and commercial approval are admin-only. Self-approval is blocked.',
    },
    {
      q: 'Do I need a second login after approval?',
      a: 'No. Use the same email with OTP on the Doctor portal after activation.',
    },
  ],
};

export const DEFAULT_JOIN_LAB: JoinPageDocument = {
  version: 1,
  benefits: [
    {
      title: 'Publish tests patients can book',
      body: 'List panels and home/center collection options for customers in markets where lab partners are enabled.',
    },
    {
      title: 'End-to-end ops console',
      body: 'Manage bookings, collections, accession, processing, pathology, and report publishing from one lab portal.',
    },
    {
      title: 'Compliance-aware onboarding',
      body: 'Document checklists follow the country policy pack. Company review activates your lab organization.',
    },
  ],
  steps: [
    'Review country-specific lab partner requirements from the published policy pack.',
    'Sign in with OTP and apply as a LAB partner type where join is enabled.',
    'Submit required compliance documents through the secure KYC flow.',
    'After company review and activation, access the Lab operations portal.',
  ],
  faq: [
    {
      q: 'Are sandbox reports diagnostic?',
      a: 'No. Sandbox workflows use demo data and are not a live diagnostic network.',
    },
    {
      q: 'Who verifies lab accreditation?',
      a: 'WorldPharma operations verify submitted evidence. Partners cannot self-attest into production readiness.',
    },
    {
      q: 'Same email after approval?',
      a: 'Yes. OTP sign-in with the same identity unlocks the Lab portal after activation.',
    },
  ],
};

export const DEFAULT_JOIN_IMAGING: JoinPageDocument = {
  version: 1,
  benefits: [
    {
      title: 'Book imaging studies for customers',
      body: 'Publish center slots where imaging partners are enabled in the country pack.',
    },
    {
      title: 'Study and report workflow',
      body: 'Track bookings through study status and report publication. Production PACS/DICOM viewers remain EXTERNAL_GATED.',
    },
    {
      title: 'Radiologist collaboration',
      body: 'Assign interpretation worklists to radiologist members after your center is activated.',
    },
  ],
  steps: [
    'Review country-specific imaging center requirements from the published policy pack.',
    'Sign in with OTP and apply as an IMAGING_CENTER partner where join is enabled.',
    'Submit required compliance documents through the secure KYC flow.',
    'After company review and activation, access the Imaging operations portal.',
  ],
  faq: [
    {
      q: 'Is there a live DICOM viewer?',
      a: 'Not in sandbox. PACS/DICOM production viewers are EXTERNAL_GATED — the UI explains this instead of appearing broken.',
    },
    {
      q: 'Can I self-approve my imaging centre?',
      a: 'No. Licence and commercial approval are admin-only.',
    },
    {
      q: 'Same login after approval?',
      a: 'Yes. Use OTP with the same email on the Imaging portal.',
    },
  ],
};

export const DEFAULT_JOIN_DELIVERY: JoinPageDocument = {
  version: 1,
  benefits: [
    {
      title: 'Assigned delivery jobs',
      body: 'Receive pharmacy and health-package delivery jobs for markets where delivery partners are enabled.',
    },
    {
      title: 'OTP / POD sandbox flows',
      body: 'Practice proof-of-delivery workflows in sandbox. Live carrier integrations remain EXTERNAL_GATED.',
    },
    {
      title: 'Company-controlled activation',
      body: 'Onboarding documents are reviewed by WorldPharma before jobs are assigned.',
    },
  ],
  steps: [
    'Review country-specific delivery partner requirements from the published policy pack.',
    'Sign in with OTP and apply as a DELIVERY_PARTNER where join is enabled.',
    'Submit required compliance documents through the secure KYC flow.',
    'After company review and activation, use the Delivery Partner mobile app for assigned jobs.',
  ],
  faq: [
    {
      q: 'Is this a live carrier network?',
      a: 'Sandbox does not book live carriers. Production logistics providers stay EXTERNAL_GATED until authorized.',
    },
    {
      q: 'Do I get a separate customer account?',
      a: 'No. OTP identity carries through after approval.',
    },
  ],
};

export const DEFAULT_JOIN_AFFILIATE: JoinPageDocument = {
  version: 1,
  benefits: [
    {
      title: 'Earn on eligible non-clinical conversions',
      body: 'Refer customers to World-Pharma for pharmacy and eligible marketplace activity. Commission rules follow country policy.',
    },
    {
      title: 'Privacy-safe attribution',
      body: 'Affiliates see conversion and commission status only. Patient identity and clinical records are never exposed.',
    },
    {
      title: 'Company-controlled payouts',
      body: 'Referral links and earnings connect to the same order and finance kernel. Payouts are approved by World-Pharma.',
    },
  ],
  steps: [
    'Review country-specific affiliate eligibility from the published policy pack.',
    'Sign in with OTP and apply as an AFFILIATE partner where join is enabled.',
    'Submit required KYC documents through the secure partner application flow.',
    'After company review and activation, access the Affiliate operations portal for codes, links, and earnings.',
  ],
  faq: [
    {
      q: 'Do I need a separate customer account?',
      a: 'No. You sign in with OTP using the same identity. After approval, your organization membership grants access to the Affiliate portal.',
    },
    {
      q: 'What can I promote?',
      a: 'Eligible non-clinical marketplace activity as defined in your country pack. Requirements and commission rules vary by country configuration.',
    },
    {
      q: 'When do I get paid?',
      a: 'Earnings appear when orders attribute to your codes. Company finance approves liabilities and processes payouts — live payout remains disabled in sandbox.',
    },
    {
      q: 'Can I see customer health data?',
      a: 'No. Attribution is privacy-safe. You see conversion status and commission amounts only, never prescriptions or medical records.',
    },
  ],
};

export const JOIN_PAGE_DEFAULTS: Record<string, JoinPageDocument> = {
  'join-home': DEFAULT_JOIN_HOME,
  'join-pharmacy': DEFAULT_JOIN_PHARMACY,
  'join-doctor': DEFAULT_JOIN_DOCTOR,
  'join-lab': DEFAULT_JOIN_LAB,
  'join-imaging': DEFAULT_JOIN_IMAGING,
  'join-delivery': DEFAULT_JOIN_DELIVERY,
  'join-affiliate': DEFAULT_JOIN_AFFILIATE,
};
