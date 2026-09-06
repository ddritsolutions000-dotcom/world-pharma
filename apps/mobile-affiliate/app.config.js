const appJson = require('./app.json');

/**
 * Affiliate Expo config — cleartext only for local/sandbox; production forbids loopback API/customer URLs.
 */
module.exports = () => {
  const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? appJson.expo?.extra?.appEnv ?? 'local')
    .toString()
    .trim()
    .toLowerCase();
  const allowCleartext = appEnv === 'local' || appEnv === 'sandbox';
  const expo = JSON.parse(JSON.stringify(appJson.expo));
  expo.extra = { ...(expo.extra ?? {}), appEnv };
  expo.android = {
    ...(expo.android ?? {}),
    usesCleartextTraffic: allowCleartext,
  };
  if (appEnv === 'production') {
    const api = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();
    const customer = (process.env.EXPO_PUBLIC_CUSTOMER_URL ?? '').trim();
    const bad =
      !api ||
      !customer ||
      /localhost|127\.0\.0\.1/i.test(api) ||
      /localhost|127\.0\.0\.1/i.test(customer) ||
      !/^https:\/\//i.test(api) ||
      !/^https:\/\//i.test(customer);
    if (bad) {
      throw new Error(
        'Production affiliate builds require non-empty https:// API and customer URLs (not localhost).',
      );
    }
  }
  return { expo };
};
