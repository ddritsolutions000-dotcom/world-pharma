export type LocaleCode = 'en';

const catalogs: Record<LocaleCode, Record<string, string>> = {
  en: {
    'auth.sign_in': 'Sign in',
    'auth.sign_out': 'Sign out',
    'auth.otp_send': 'Send OTP',
    'auth.otp_verify': 'Verify OTP',
    'auth.email': 'Email',
    'auth.code': 'One-time code',
    'state.loading': 'Loading',
    'state.empty': 'Nothing here yet',
    'state.error': 'Something went wrong',
    'state.forbidden': 'Permission denied',
    'state.expired': 'Session expired',
    'state.network': 'Connection problem',
    'account.profile': 'Profile',
    'account.addresses': 'Addresses',
    'account.preferences': 'Preferences',
    'account.notifications': 'Notifications',
    'account.privacy': 'Privacy & security',
    'account.support': 'Support',
  },
};

let activeLocale: LocaleCode = 'en';

export function setLocale(locale: LocaleCode): void {
  activeLocale = locale;
}

export function getLocale(): LocaleCode {
  return activeLocale;
}

export function t(key: string, fallback?: string): string {
  return catalogs[activeLocale][key] ?? fallback ?? key;
}

export function registerCatalog(locale: LocaleCode, entries: Record<string, string>): void {
  catalogs[locale] = { ...catalogs[locale], ...entries };
}
