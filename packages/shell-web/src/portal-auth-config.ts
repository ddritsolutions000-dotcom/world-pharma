import type { Audience } from '@world-pharma/shell-core';

export type PortalAuthId =
  | 'customer'
  | 'admin'
  | 'doctor'
  | 'vendor'
  | 'lab'
  | 'radiology'
  | 'store'
  | 'affiliate'
  | 'pathologist'
  | 'radiologist'
  | 'logistics'
  | 'join';

export type PortalAuthConfig = {
  portalName: string;
  tagline: string;
  audience: Audience;
  accent: string;
  signInTitle: string;
  signInDescription: string;
  signUpTitle: string;
  signUpDescription: string;
  footerNote?: string;
  sandboxEmail?: string;
  /** When set, sign-in uses User ID + password → mobile OTP. */
  passwordLogin?: boolean;
  sandboxPassword?: string;
  partnerApplyHref?: string;
};

/** Partner join host — web-join runs on :3008 locally (not ds-web :3100). */
export function partnerJoinBase(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_JOIN_URL) {
    return process.env.NEXT_PUBLIC_JOIN_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:3008`;
    }
  }
  return 'http://127.0.0.1:3008';
}

function joinPath(path: string): string {
  return `${partnerJoinBase()}${path.startsWith('/') ? path : `/${path}`}`;
}

export const PORTAL_AUTH: Record<PortalAuthId, PortalAuthConfig> = {
  customer: {
    portalName: 'WorldPharma',
    tagline: 'Global pharmacy & healthcare — medicines, doctors, labs & delivery.',
    audience: 'customer',
    accent: '#1A365D',
    signInTitle: 'Welcome back',
    signInDescription: 'Sign in with a one-time code sent to your email.',
    signUpTitle: 'Create your account',
    signUpDescription: 'Register with email OTP — one account for web and mobile worldwide.',
    footerNote: 'By continuing you agree to our Terms of Service and Privacy Policy.',
  },
  admin: {
    portalName: 'WorldPharma Admin',
    tagline: 'Operations console — partners, catalog, orders, finance & governance.',
    audience: 'admin',
    accent: '#9b2c4a',
    signInTitle: 'Admin sign in',
    signInDescription: 'Use your authorized operations email. Access is role-governed.',
    signUpTitle: 'Request admin access',
    signUpDescription: 'New admin accounts are provisioned by platform owners — OTP verifies your identity.',
    footerNote: 'Unauthorized access attempts are audited.',
  },
  doctor: {
    portalName: 'WorldPharma Doctor',
    tagline: 'Consultations, prescriptions, and patient communications.',
    audience: 'doctor',
    accent: '#319795',
    signInTitle: 'Doctor sign in',
    signInDescription: 'Enter your User ID and password. We send an OTP to your registered mobile.',
    signUpTitle: 'Join as a doctor',
    signUpDescription: 'Apply on the partner portal first, then sign in here after approval.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-doctor@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    get partnerApplyHref() {
      return joinPath('/doctor');
    },
  },
  vendor: {
    portalName: 'WorldPharma Vendor',
    tagline: 'Seller workspace — catalog, inventory, orders & settlements.',
    audience: 'customer',
    accent: '#2f855a',
    signInTitle: 'Vendor sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile. Organization scope is server-enforced.',
    signUpTitle: 'Become a vendor',
    signUpDescription: 'Complete partner application, then sign in with your approved email.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-vendor@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    get partnerApplyHref() {
      return joinPath('/apply');
    },
  },
  lab: {
    portalName: 'WorldPharma Lab',
    tagline: 'Diagnostic operations — accession, processing & report workflows.',
    audience: 'customer',
    accent: '#6b46c1',
    signInTitle: 'Lab partner sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile.',
    signUpTitle: 'Join as a lab',
    signUpDescription: 'Apply as a diagnostic lab partner, then access this console after approval.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-lab@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    get partnerApplyHref() {
      return joinPath('/lab');
    },
  },
  radiology: {
    portalName: 'WorldPharma Imaging',
    tagline: 'Imaging center operations — bookings, studies & reports.',
    audience: 'customer',
    accent: '#2b6cb0',
    signInTitle: 'Imaging center sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile.',
    signUpTitle: 'Join as imaging partner',
    signUpDescription: 'Partner onboarding required before imaging console access.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-imaging@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    get partnerApplyHref() {
      return joinPath('/imaging');
    },
  },
  store: {
    portalName: 'WorldPharma Store',
    tagline: 'Pharmacy fulfilment — inventory, Rx desk & dispatch.',
    audience: 'customer',
    accent: '#2f855a',
    signInTitle: 'Pharmacy store sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile. Pick organization and location after sign-in.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-store@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    signUpTitle: 'Store access',
    signUpDescription: 'Store accounts are created when pharmacy partners are activated.',
    get partnerApplyHref() {
      return joinPath('/pharmacy');
    },
  },
  affiliate: {
    portalName: 'WorldPharma Affiliate',
    tagline: 'Referral codes, earnings & campaign performance.',
    audience: 'customer',
    accent: '#d69e2e',
    signInTitle: 'Affiliate sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile.',
    signUpTitle: 'Become an affiliate',
    signUpDescription: 'Apply on the partner portal, then sign in after approval.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-affiliate@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    get partnerApplyHref() {
      return joinPath('/affiliate');
    },
  },
  pathologist: {
    portalName: 'WorldPharma Pathologist',
    tagline: 'Digital pathology worklist & report verification.',
    audience: 'customer',
    accent: '#c53030',
    signInTitle: 'Pathologist sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile. Select a lab after sign-in.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-pathologist@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    signUpTitle: 'Pathologist access',
    signUpDescription: 'Assigned by your laboratory administrator after partner activation.',
  },
  radiologist: {
    portalName: 'WorldPharma Radiologist',
    tagline: 'Imaging interpretation & report publication.',
    audience: 'customer',
    accent: '#1a365d',
    signInTitle: 'Radiologist sign in',
    signInDescription: 'User ID + password, then OTP on your registered mobile. Select a center after sign-in.',
    passwordLogin: true,
    sandboxEmail: 'sandbox-radiologist@dev.local',
    sandboxPassword: 'SandboxPartner!234',
    signUpTitle: 'Radiologist access',
    signUpDescription: 'Assigned by your imaging center after partner activation.',
  },
  logistics: {
    portalName: 'WorldPharma Logistics',
    tagline: 'Shipment exceptions, carrier booking & delivery job board.',
    audience: 'admin',
    accent: '#c05621',
    signInTitle: 'Logistics ops sign in',
    signInDescription: 'Use a platform logistics admin email. OTP is sent to that mailbox.',
    sandboxEmail: 'sandbox-admin@dev.local',
    signUpTitle: 'Logistics access',
    signUpDescription: 'Ops accounts are provisioned by platform administrators.',
    footerNote: 'No clinical or diagnostic payload in logistics workflows.',
  },
  join: {
    portalName: 'WorldPharma Partners',
    tagline: 'Apply as pharmacy, doctor, lab, imaging, delivery, or affiliate.',
    audience: 'partner_applicant',
    accent: '#0b3d91',
    signInTitle: 'Partner sign in',
    signInDescription: 'Track applications and continue onboarding with OTP.',
    signUpTitle: 'Start partner registration',
    signUpDescription: 'Create identity with email OTP — reused after approval across portals.',
    footerNote: 'Documents and KYC are submitted only through this secure flow.',
  },
};
