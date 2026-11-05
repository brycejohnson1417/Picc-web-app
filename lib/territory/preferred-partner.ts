export const PREFERRED_PARTNER_PPP_STATUS = 'approved & connected';
export const ACTIVE_PREFERRED_PARTNER_STATUSES = [
  PREFERRED_PARTNER_PPP_STATUS,
  'self-managed inventory ppp',
  'self-reporting inventory ppp',
] as const;

export type PreferredPartnerFilter = 'all' | 'preferred' | 'not_preferred';

type PreferredPartnerStoreLike = {
  repNames?: string[] | null;
  repEmails?: string[] | null;
  isPreferredPartner?: boolean | null;
};

export function normalizeTerritoryOption(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ');
}

export function isPreferredPartnerFromStatuses(
  pppStatus: string | null | undefined,
  _legacyConnectionStatus?: string | null,
) {
  // Keep the second argument compatible with existing adapters; enrollment is independent of external connectivity.
  void _legacyConnectionStatus;
  return ACTIVE_PREFERRED_PARTNER_STATUSES.some(status => status === normalizeTerritoryOption(pppStatus));
}

export function preferredPartnerLabel(isPreferredPartner: boolean | null | undefined) {
  return isPreferredPartner ? 'Preferred Partner' : 'Not a Preferred Partner';
}

export function preferredPartnerRepBreakdown<T extends PreferredPartnerStoreLike>(stores: T[]) {
  const counts = new Map<string, number>();
  let totalPreferredPartners = 0;

  for (const store of stores) {
    if (!store.isPreferredPartner) {
      continue;
    }

    totalPreferredPartners += 1;

    const repNames = Array.isArray(store.repNames)
      ? store.repNames.map((value) => value.trim()).filter(Boolean)
      : [];
    const repEmails = Array.isArray(store.repEmails)
      ? store.repEmails.map((value) => value.trim()).filter(Boolean)
      : [];

    const labels = [...new Set(repNames)];
    if (labels.length === 0) {
      labels.push(repEmails[0] || 'Unassigned');
    }

    for (const label of labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return {
    totalPreferredPartners,
    reps: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
  };
}
