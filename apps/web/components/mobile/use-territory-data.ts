'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TerritoryBoundaryListResponse, TerritoryMarkerListResponse, TerritoryStoresResponse } from '@/lib/territory/types';

const STORES_STALE_MS = 1000 * 60 * 5;
const OVERLAY_STALE_MS = 1000 * 60 * 15;
const QUERY_GC_MS = 1000 * 60 * 30;
const TERRITORY_CACHE_PREFIX = 'picc:territory-cache:v2:';

type CachedEnvelope<T> = {
  cachedAt: number;
  payload: T;
};

function readCachedJson<T>(cacheKey: string, maxAgeMs: number): T | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(`${TERRITORY_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as T | CachedEnvelope<T>;

    if (
      parsed &&
      typeof parsed === 'object' &&
      'cachedAt' in parsed &&
      typeof parsed.cachedAt === 'number' &&
      'payload' in parsed
    ) {
      if (Date.now() - parsed.cachedAt > maxAgeMs) {
        window.sessionStorage.removeItem(`${TERRITORY_CACHE_PREFIX}${cacheKey}`);
        return undefined;
      }
      return parsed.payload;
    }

    window.sessionStorage.removeItem(`${TERRITORY_CACHE_PREFIX}${cacheKey}`);
    return undefined;
  } catch {
    return undefined;
  }
}

function writeCachedJson<T>(cacheKey: string, payload: T) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const envelope: CachedEnvelope<T> = {
      cachedAt: Date.now(),
      payload,
    };
    window.sessionStorage.setItem(`${TERRITORY_CACHE_PREFIX}${cacheKey}`, JSON.stringify(envelope));
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
  refreshNonce: number;
}

function buildStoresSearchParams(input: TerritoryStoreQueryInput, options: { forceRefresh?: boolean } = {}) {
  const params = new URLSearchParams();
  if (input.search) params.set('q', input.search);
  for (const status of input.selectedStatuses) params.append('status', status);
  for (const rep of input.selectedReps) params.append('rep', rep);
  for (const pppStatus of input.selectedPppStatuses) params.append('pppStatus', pppStatus);
  for (const headsetConnectionStatus of input.selectedHeadsetConnectionStatuses) {
    params.append('headsetConnectionStatus', headsetConnectionStatus);
  }
  if (input.preferredPartnerFilter !== 'all') params.set('preferredPartner', input.preferredPartnerFilter);
  for (const referralSource of input.selectedReferralSources) params.append('referralSource', referralSource);
  if (input.includeNoReferralSource) params.set('noReferralSource', '1');
  for (const vendorDayStatus of input.selectedVendorDayStatuses) params.append('vendorDayStatus', vendorDayStatus);
  if (input.locationAvailability !== 'all') params.set('locationStatus', input.locationAvailability);
  if (input.hasSampleOrderDate) params.set('hasSampleOrderDate', '1');
  if (input.noLastSampleDeliveryDate) params.set('noLastSampleDeliveryDate', '1');
  if (input.sampleAccountTypeFilter !== 'all') params.set('sampleAccountTypeFilter', input.sampleAccountTypeFilter);
  if (input.lastOrderDateFilter !== 'all') params.set('lastOrderDateFilter', input.lastOrderDateFilter);
  if (options.forceRefresh) params.set('refresh', '1');
  return params;
}

export function useTerritoryData(input: TerritoryStoreQueryInput) {
  const consumedRefreshNonceRef = useRef(0);
  const shouldForceRefresh = input.refreshNonce > 0 && input.refreshNonce !== consumedRefreshNonceRef.current;
  const storesUrl = `/api/territory/stores?${buildStoresSearchParams(input).toString()}`;
  const requestStoresUrl = shouldForceRefresh
    ? `/api/territory/stores?${buildStoresSearchParams(input, { forceRefresh: true }).toString()}`
    : storesUrl;
  const cachedStores = readCachedJson<TerritoryStoresResponse>(storesUrl, STORES_STALE_MS);
  const cachedBoundaries = readCachedJson<TerritoryBoundaryListResponse>('/api/territory/boundaries', OVERLAY_STALE_MS);
  const cachedMarkers = readCachedJson<TerritoryMarkerListResponse>('/api/territory/markers', OVERLAY_STALE_MS);

  const storesQuery = useQuery({
    queryKey: [
      'territory-mobile',
      input.search,
      input.selectedStatuses.join('|'),
      input.selectedReps.join('|'),
      input.selectedPppStatuses.join('|'),
      input.selectedHeadsetConnectionStatuses.join('|'),
      input.preferredPartnerFilter,
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
      try {
        const payload = await fetchJson<TerritoryStoresResponse>(requestStoresUrl, 'Failed to load stores');
        writeCachedJson(storesUrl, payload);
        return payload;
      } finally {
        if (shouldForceRefresh) {
          consumedRefreshNonceRef.current = input.refreshNonce;
        }
      }
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
