import type { PinColorMode } from '@/lib/territory/pin-colors';

export const FILTER_STORAGE_KEY = 'territory-mobile-filters-v1';

export interface TerritorySavedFiltersPayload {
  search: string;
  selectedStatuses: string[];
  selectedReps: string[];
  selectedPppStatuses: string[];
  selectedHeadsetConnectionStatuses: string[];
  preferredPartnerFilter: 'all' | 'preferred' | 'not_preferred';
  selectedReferralSources: string[];
  includeNoReferralSource: boolean;
  selectedVendorDayStatuses: string[];
  locationAvailability: 'all' | 'available' | 'unavailable';
  hasSampleOrderDate: boolean;
  noLastSampleDeliveryDate: boolean;
  sampleAccountTypeFilter: 'all' | 'customers' | 'non_customers';
  lastOrderDateFilter: 'all' | 'last_month' | 'last_2_months' | 'three_plus_months';
  showRouteOnly: boolean;
  pinColorMode: PinColorMode;
  savedAt: string;
}

export function loadSavedTerritoryFilters(): Partial<TerritorySavedFiltersPayload> | null {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<TerritorySavedFiltersPayload>;
  } catch {
    return null;
  }
}

export function persistSavedTerritoryFilters(payload: TerritorySavedFiltersPayload) {
  window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
}

export function clearSavedTerritoryFilters() {
  window.localStorage.removeItem(FILTER_STORAGE_KEY);
}

export function countActiveTerritoryFilters(input: {
  selectedStatuses: string[];
  selectedReps: string[];
  selectedPppStatuses: string[];
  selectedHeadsetConnectionStatuses: string[];
  preferredPartnerFilter: 'all' | 'preferred' | 'not_preferred';
  selectedReferralSources: string[];
  includeNoReferralSource: boolean;
  selectedVendorDayStatuses: string[];
  locationAvailability: 'all' | 'available' | 'unavailable';
  hasSampleOrderDate: boolean;
  noLastSampleDeliveryDate: boolean;
  sampleAccountTypeFilter: 'all' | 'customers' | 'non_customers';
  lastOrderDateFilter: 'all' | 'last_month' | 'last_2_months' | 'three_plus_months';
}) {
  return (
    input.selectedStatuses.length +
    input.selectedReps.length +
    input.selectedPppStatuses.length +
    input.selectedHeadsetConnectionStatuses.length +
    (input.preferredPartnerFilter === 'all' ? 0 : 1) +
    input.selectedReferralSources.length +
    (input.includeNoReferralSource ? 1 : 0) +
    input.selectedVendorDayStatuses.length +
    (input.locationAvailability === 'all' ? 0 : 1) +
    (input.hasSampleOrderDate ? 1 : 0) +
    (input.noLastSampleDeliveryDate ? 1 : 0) +
    (input.sampleAccountTypeFilter === 'all' ? 0 : 1) +
    (input.lastOrderDateFilter === 'all' ? 0 : 1)
  );
}
