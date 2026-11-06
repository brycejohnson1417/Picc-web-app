const versions = new Map<string, number>();
const keyFor = (storeId: string) => `picc:account-updated:${storeId.replace(/-/g, '').toLowerCase()}`;

export function getAccountUpdateVersion(storeId: string) {
  const key = keyFor(storeId);
  let version = versions.get(key) ?? 0;
  if (typeof window !== 'undefined') {
    try {
      const stored = Number(window.sessionStorage.getItem(key));
      if (Number.isFinite(stored) && stored > version) version = stored;
    } catch { /* The in-memory version also survives route changes. */ }
  }
  return version;
}

export function notifyAccountUpdated(storeId: string) {
  const key = keyFor(storeId);
  const version = Math.max(Date.now(), getAccountUpdateVersion(storeId) + 1);
  versions.set(key, version);
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(key, String(version)); } catch { /* Keep event delivery and in-memory invalidation available. */ }
  window.dispatchEvent(new CustomEvent('picc:account-updated', { detail: { storeId } }));
}
