'use client';

import { useQuery } from '@tanstack/react-query';
import type { TerritoryBoundaryListResponse, TerritoryMarkerListResponse, TerritoryStoresResponse } from '@/lib/territory/types';

const STORES_STALE_MS = 1000 * 60 * 5;
const OVERLAY_STALE_MS = 1000 * 60 * 15;
const QUERY_GC_MS = 1000 * 60 * 30;
const TERRITORY_CACHE_PREFIX = 'picc:territory-cache:';

function readCachedJson<T>(cacheKey: string): T | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(`${TERRITORY_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeCachedJson<T>(cacheKey: string, payload: T) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(`${TERRITORY_CACHE_PREFIX}${cacheKey}`, JSON.stringify(payload));
  } catch {
    // Ignore quota/storage failures.
  }
}

async function fetchJson<T>(url: string, fallbackError: string) {
  const response = await fetch(url);
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
  const storesUrl = `/api/territory/stores?${buildStoresSearchParams(input).toString()}`;
  const cachedStores = readCachedJson<TerritoryStoresResponse>(storesUrl);
  const cachedBoundaries = readCachedJson<TerritoryBoundaryListResponse>('/api/territory/boundaries');
  const cachedMarkers = readCachedJson<TerritoryMarkerListResponse>('/api/territory/markers');

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
    queryFn: async () => {
      const payload = await fetchJson<TerritoryStoresResponse>(storesUrl, 'Failed to load stores');
      writeCachedJson(storesUrl, payload);
      return payload;
    },
    initialData: cachedStores,
    staleTime: STORES_STALE_MS,
    gcTime: QUERY_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const boundariesQuery = useQuery({
    queryKey: ['territory-boundaries'],
    queryFn: async () => {
      const payload = await fetchJson<TerritoryBoundaryListResponse>('/api/territory/boundaries', 'Failed to load territory boundaries');
      writeCachedJson('/api/territory/boundaries', payload);
      return payload;
    },
    initialData: cachedBoundaries,
    staleTime: OVERLAY_STALE_MS,
    gcTime: QUERY_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const markersQuery = useQuery({
    queryKey: ['territory-markers'],
    queryFn: async () => {
      const payload = await fetchJson<TerritoryMarkerListResponse>('/api/territory/markers', 'Failed to load territory markers');
      writeCachedJson('/api/territory/markers', payload);
      return payload;
    },
    initialData: cachedMarkers,
    staleTime: OVERLAY_STALE_MS,
    gcTime: QUERY_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  return {
    storesQuery,
    boundariesQuery,
    markersQuery,
  };
}
