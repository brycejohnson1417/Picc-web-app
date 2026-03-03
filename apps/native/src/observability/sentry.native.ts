export function initNativeSentry() {
  const dsn = (globalThis as { process?: { env?: Record<string, string | undefined> } })?.process?.env?.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return { enabled: false };
  }

  return {
    enabled: true,
    dsn,
    environment:
      (globalThis as { process?: { env?: Record<string, string | undefined> } })?.process?.env?.NODE_ENV ??
      'development',
  };
}
