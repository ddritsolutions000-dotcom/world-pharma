import { JOIN_PAGE_DEFAULTS, stringifyJoinPageDocument } from '@world-pharma/shared/join-page-blocks';
import { joinPortalUrl } from './site-url';

export type OperatorSitePage = {
  slug: string;
  title: string;
  summary: string;
  customerPath: string;
  starterBody: string;
  joinBlocks?: boolean;
};

function joinStarter(slug: keyof typeof JOIN_PAGE_DEFAULTS): string {
  return stringifyJoinPageDocument(JOIN_PAGE_DEFAULTS[slug]);
}

const joinBase = joinPortalUrl();

/** Company pages operators edit without a code change (same Help/CMS publish path as legal). */
export const OPERATOR_SITE_PAGES: OperatorSitePage[] = [
  {
    slug: 'contact-worldpharma',
    title: 'Contact Us',
    summary: 'Intro copy on /contact. The callback form stays in the app.',
    customerPath: '/contact',
    starterBody: `Orders, lab bookings, refunds, and account help — 7 days a week.

Call 1800-212-2323 or submit a ticket after you sign in.`,
  },
  {
    slug: 'partners-worldpharma',
    title: 'Partner with WorldPharma',
    summary: 'Acquisition intro on /partners. Join links stay in the app.',
    customerPath: '/partners',
    starterBody: `We onboard licensed pharmacies, labs, doctors, and delivery partners through KYC.

Apply from the join portal. Demo credentials exist for sandbox testing only.`,
  },
  {
    slug: 'join-home',
    title: 'Partner join homepage',
    summary: 'Title, summary, and JSON blocks for benefits, steps, and FAQ on join home.',
    customerPath: `${joinBase}/`,
    starterBody: joinStarter('join-home'),
    joinBlocks: true,
  },
  {
    slug: 'join-pharmacy',
    title: 'Pharmacy operators',
    summary: 'Join portal /pharmacy hero and editable blocks.',
    customerPath: `${joinBase}/pharmacy`,
    starterBody: joinStarter('join-pharmacy'),
    joinBlocks: true,
  },
  {
    slug: 'join-doctor',
    title: 'Doctor partners',
    summary: 'Join portal /doctor hero and editable blocks.',
    customerPath: `${joinBase}/doctor`,
    starterBody: joinStarter('join-doctor'),
    joinBlocks: true,
  },
  {
    slug: 'join-lab',
    title: 'Laboratory partners',
    summary: 'Join portal /lab hero and editable blocks.',
    customerPath: `${joinBase}/lab`,
    starterBody: joinStarter('join-lab'),
    joinBlocks: true,
  },
  {
    slug: 'join-imaging',
    title: 'Imaging center partners',
    summary: 'Join portal /imaging hero and editable blocks.',
    customerPath: `${joinBase}/imaging`,
    starterBody: joinStarter('join-imaging'),
    joinBlocks: true,
  },
  {
    slug: 'join-delivery',
    title: 'Delivery partners',
    summary: 'Join portal /delivery hero and editable blocks.',
    customerPath: `${joinBase}/delivery`,
    starterBody: joinStarter('join-delivery'),
    joinBlocks: true,
  },
  {
    slug: 'join-affiliate',
    title: 'Affiliate program',
    summary: 'Join portal /affiliate hero and editable blocks.',
    customerPath: `${joinBase}/affiliate`,
    starterBody: joinStarter('join-affiliate'),
    joinBlocks: true,
  },
];
