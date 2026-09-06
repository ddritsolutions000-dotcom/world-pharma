const appJson = require('./app.json');

/**
 * Expo config — keeps cleartext HTTP only for local/sandbox LAN debugging.
 * Production builds must use HTTPS API bases (no localhost).
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
    // Fail closed: production builds need a non-loopback HTTPS API base.
    const api = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();
    if (!api || /localhost|127\.0\.0\.1/i.test(api) || !/^https:\/\//i.test(api)) {
      throw new Error(
        'EXPO_PUBLIC_API_BASE_URL must be a non-empty https:// URL (not localhost) for production mobile builds.',
      );
    }
  }
  return { expo };
};
