import type { PolicyDocument } from '../policy/empty-pack';

export type MarketCountryDef = {
  isoAlpha2: string;
  isoAlpha3: string;
  nameI18n: Record<string, string>;
  defaultLocale: string;
  defaultCurrency: string;
  defaultTimezone: string;
  phonePrefix: string;
};

export type MarketMirrorConfig = {
  isoAlpha2: string;
  currency: string;
  seedKey: string;
  doctorLanguages: string[];
  doctorBioSuffix: string;
};

export type MarketSeedSpec = {
  country: MarketCountryDef;
  buildPolicy: () => PolicyDocument;
  logLine: string;
};

export const MARKET_MIRROR_CONFIGS: MarketMirrorConfig[] = [
  {
    isoAlpha2: 'IN',
    currency: 'INR',
    seedKey: 'in',
    doctorLanguages: ['en', 'hi'],
    doctorBioSuffix: 'India.',
  },
  {
    isoAlpha2: 'US',
    currency: 'USD',
    seedKey: 'us',
    doctorLanguages: ['en'],
    doctorBioSuffix: 'United States.',
  },
  {
    isoAlpha2: 'AE',
    currency: 'AED',
    seedKey: 'ae',
    doctorLanguages: ['en', 'ar'],
    doctorBioSuffix: 'UAE.',
  },
];
