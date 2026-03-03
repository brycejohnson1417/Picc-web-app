export function initNativeSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return { enabled: false };
  }

  return {
    enabled: true,
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
  };
}
