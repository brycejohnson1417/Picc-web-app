export const PREFERRED_PARTNER_HEADSET_CONNECTION = 'connected to picc headset';
export const PREFERRED_PARTNER_PPP_STATUS = 'approved & connected';

export type PreferredPartnerFilter = 'all' | 'preferred' | 'not_preferred';

export function normalizeTerritoryOption(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ');
}

export function isPreferredPartnerFromStatuses(
  pppStatus: string | null | undefined,
  headsetConnectionStatus: string | null | undefined,
) {
  return (
    normalizeTerritoryOption(pppStatus) === PREFERRED_PARTNER_PPP_STATUS &&
    normalizeTerritoryOption(headsetConnectionStatus) === PREFERRED_PARTNER_HEADSET_CONNECTION
  );
}

export function preferredPartnerLabel(isPreferredPartner: boolean | null | undefined) {
  return isPreferredPartner ? 'Preferred Partner' : 'Not a Preferred Partner';
}
