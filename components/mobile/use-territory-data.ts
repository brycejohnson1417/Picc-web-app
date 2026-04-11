'use client';

import { useQuery } from '@tanstack/react-query';
import type { TerritoryBoundaryListResponse, TerritoryMarkerListResponse, TerritoryStoresResponse } from '@/lib/territory/types';

const STORES_STALE_MS = 30_000;
const STORES_REFETCH_MS = 45_000;
const OVERLAY_STALE_MS = 30_000;
const OVERLAY_REFETCH_MS = 30_000;
const OVERLAY_GC_MS = 300_000;

function activeInterval(intervalMs: number) {
  return () => (typeof document === 'undefined' || document.visibilityState === 'visible' ? intervalMs : false);
}

async function fetchJson<T>(url: string, fallbackError: string) {
  const response = await fetch(url, {
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error ?? fallbackError);
  }
  return (await response.json()) as T;
}

export interface TerritoryStoreQueryInput {
  search: string;
  selectedStatuses: string[];
  selectedReps: string[];
  selectedReferralSources: string[];
  includeNoReferralSource: boolean;
  selectedVendorDayStatuses: string[];
  locationAvailability: 'all' | 'available' | 'unavailable';
  hasSampleOrderDate: boolean;
  noLastSampleDeliveryDate: boolean;
  sampleAccountTypeFilter: 'all' | 'customers' | 'non_customers';
  lastOrderDateFilter: 'all' | 'last_month' | 'last_2_months' | 'three_plus_months';
  refreshNonce: number;
}

function buildStoresSearchParams(input: TerritoryStoreQueryInput) {
  const params = new URLSearchParams();
  if (input.search) params.set('q', input.search);
  for (const status of input.selectedStatuses) params.append('status', status);
  for (const rep of input.selectedReps) params.append('rep', rep);
  for (const referralSource of input.selectedReferralSources) params.append('referralSource', referralSource);
  if (input.includeNoReferralSource) params.set('noReferralSource', '1');
  for (const vendorDayStatus of input.selectedVendorDayStatuses) params.append('vendorDayStatus', vendorDayStatus);
  if (input.locationAvailability !== 'all') params.set('locationStatus', input.locationAvailability);
  if (input.hasSampleOrderDate) params.set('hasSampleOrderDate', '1');
  if (input.noLastSampleDeliveryDate) params.set('noLastSampleDeliveryDate', '1');
  if (input.sampleAccountTypeFilter !== 'all') params.set('sampleAccountTypeFilter', input.sampleAccountTypeFilter);
  if (input.lastOrderDateFilter !== 'all') params.set('lastOrderDateFilter', input.lastOrderDateFilter);
  if (input.refreshNonce > 0) params.set('refresh', '1');
  return params;
}

export function useTerritoryData(input: TerritoryStoreQueryInput) {
  const storesQuery = useQuery({
    queryKey: [
      'territory-mobile',
      input.search,
      input.selectedStatuses.join('|'),
      input.selectedReps.join('|'),
      input.selectedReferralSources.join('|'),
      input.includeNoReferralSource ? 'no-referral' : 'with-referral',
      input.selectedVendorDayStatuses.join('|'),
      input.locationAvailability,
      input.hasSampleOrderDate ? 'sample' : 'all',
      input.noLastSampleDeliveryDate ? 'no-sample-delivery' : 'any-sample-delivery',
      input.sampleAccountTypeFilter,
      input.lastOrderDateFilter,
      input.refreshNonce,
    ],
    queryFn: async () =>
      fetchJson<TerritoryStoresResponse>(
        `/api/territory/stores?${buildStoresSearchParams(input).toString()}`,
        'Failed to load stores',
      ),
    staleTime: STORES_STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: activeInterval(STORES_REFETCH_MS),
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const boundariesQuery = useQuery({
    queryKey: ['territory-boundaries'],
    queryFn: async () =>
      fetchJson<TerritoryBoundaryListResponse>('/api/territory/boundaries', 'Failed to load territory boundaries'),
    staleTime: OVERLAY_STALE_MS,
    gcTime: OVERLAY_GC_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: activeInterval(OVERLAY_REFETCH_MS),
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const markersQuery = useQuery({
    queryKey: ['territory-markers'],
    queryFn: async () =>
      fetchJson<TerritoryMarkerListResponse>('/api/territory/markers', 'Failed to load territory markers'),
    staleTime: OVERLAY_STALE_MS,
    gcTime: OVERLAY_GC_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: activeInterval(OVERLAY_REFETCH_MS),
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  return {
    storesQuery,
    boundariesQuery,
    markersQuery,
  };
}
