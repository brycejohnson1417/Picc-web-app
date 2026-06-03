const EXCLUDED_INTERNAL_TRANSFER_RETAILERS = [
  'CALIFORNIA FRAGRANCE COMPANY',
  'CALIFORNIA FRAGRANCE COMPANY INC',
] as const;

function normalize(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

export function isExcludedInternalTransferRetailerName(value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized) return false;
  return EXCLUDED_INTERNAL_TRANSFER_RETAILERS.includes(normalized as (typeof EXCLUDED_INTERNAL_TRANSFER_RETAILERS)[number]);
}

export const excludedInternalTransferRetailers = [...EXCLUDED_INTERNAL_TRANSFER_RETAILERS];
