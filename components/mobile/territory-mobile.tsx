'use client';

import dynamic from 'next/dynamic';
import { AlertTriangle, Crosshair, Filter, Layers3, Loader2, Navigation, Plus, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { TerritoryBoundaryEditor, TerritoryBoundarySheet, type TerritoryBoundaryEditorState } from '@/components/mobile/territory-boundary-sheet';
import { StoreFilterSheet } from '@/components/mobile/store-filter-sheet';
import { MapRenderBoundary } from '@/components/mobile/map-render-boundary';
import { pinColorForStore, repColorForLabel, type PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryBoundaryListResponse, TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import { cn } from '@/lib/utils';

const TerritoryMapMobile = dynamic(
  () => import('@/components/mobile/territory-map-mobile').then((module) => module.TerritoryMapMobile),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-[#d8d8dc]" />,
  },
);

const FILTER_STORAGE_KEY = 'territory-mobile-filters-v1';
const BOUNDARY_VISIBILITY_STORAGE_KEY = 'territory-boundary-visibility-v1';

type SavedFiltersPayload = {
  search: string;
  selectedStatuses: string[];
  selectedReps: string[];
  locationAvailability: 'all' | 'available' | 'unavailable';
  showRouteOnly: boolean;
  pinColorMode: PinColorMode;
  savedAt: string;
};

function firstLetter(name: string) {
  const normalized = String(name ?? '').trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

function toggleListValue(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function formatSavedTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function TerritoryMobile() {
  const appAccess = useAppAccess();
  const queryClient = useQueryClient();
  const routePlan = useRoutePlan();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mapSearch, setMapSearch] = useState('');
  const [debouncedMapSearch, setDebouncedMapSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showRouteOnly, setShowRouteOnly] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [locationAvailability, setLocationAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showMapSearch, setShowMapSearch] = useState(false);
  const [pinColorMode, setPinColorMode] = useState<PinColorMode>('status');
  const [draftStatuses, setDraftStatuses] = useState<string[]>([]);
  const [draftReps, setDraftReps] = useState<string[]>([]);
  const [draftLocationAvailability, setDraftLocationAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [draftPinColorMode, setDraftPinColorMode] = useState<PinColorMode>('status');
  const [savedFiltersAt, setSavedFiltersAt] = useState<string | null>(null);
  const [focusRequestToken, setFocusRequestToken] = useState(0);
  const [locationRequestToken, setLocationRequestToken] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [hiddenBoundaryIds, setHiddenBoundaryIds] = useState<string[]>([]);
  const [showBoundarySheet, setShowBoundarySheet] = useState(false);
  const [boundaryPrefsReady, setBoundaryPrefsReady] = useState(false);
  const [boundaryEditor, setBoundaryEditor] = useState<TerritoryBoundaryEditorState | null>(null);
  const [drawingBoundaryMode, setDrawingBoundaryMode] = useState(false);
  const [savingBoundary, setSavingBoundary] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedMapSearch(mapSearch.trim());
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [mapSearch]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedFiltersPayload>;

      setSearch(typeof parsed.search === 'string' ? parsed.search : '');
      setDebouncedSearch(typeof parsed.search === 'string' ? parsed.search.trim() : '');
      setSelectedStatuses(Array.isArray(parsed.selectedStatuses) ? parsed.selectedStatuses.filter((value): value is string => typeof value === 'string') : []);
      setSelectedReps(Array.isArray(parsed.selectedReps) ? parsed.selectedReps.filter((value): value is string => typeof value === 'string') : []);
      setLocationAvailability(parsed.locationAvailability === 'available' || parsed.locationAvailability === 'unavailable' ? parsed.locationAvailability : 'all');
      setShowRouteOnly(Boolean(parsed.showRouteOnly));
      setPinColorMode(parsed.pinColorMode === 'rep' ? 'rep' : 'status');
      setSavedFiltersAt(typeof parsed.savedAt === 'string' ? parsed.savedAt : null);
      toast.success('Loaded saved territory filters');
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  const storesQuery = useQuery({
    queryKey: ['territory-mobile', debouncedSearch, selectedStatuses.join('|'), selectedReps.join('|'), locationAvailability, refreshNonce],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      for (const status of selectedStatuses) params.append('status', status);
      for (const rep of selectedReps) params.append('rep', rep);
      if (locationAvailability !== 'all') params.set('locationStatus', locationAvailability);
      if (refreshNonce > 0) params.set('refresh', '1');
      const response = await fetch(`/api/territory/stores?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load stores');
      }
      return (await response.json()) as TerritoryStoresResponse;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchInterval: 45000,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const boundariesQuery = useQuery({
    queryKey: ['territory-boundaries'],
    queryFn: async () => {
      const response = await fetch('/api/territory/boundaries');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load territory boundaries');
      }
      return (await response.json()) as TerritoryBoundaryListResponse;
    },
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const boundaries = useMemo(() => boundariesQuery.data?.boundaries ?? [], [boundariesQuery.data?.boundaries]);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const displayedStores = useMemo(() => {
    if (!showRouteOnly) return stores;
    return stores.filter((store) => routePlan.selectedStopIds.includes(store.id));
  }, [showRouteOnly, stores, routePlan.selectedStopIds]);

  useEffect(() => {
    if (showRouteOnly && routePlan.selectedStopIds.length === 0) {
      setShowRouteOnly(false);
    }
  }, [showRouteOnly, routePlan.selectedStopIds.length]);

  useEffect(() => {
    if (!focusedId) return;
    if (displayedStores.some((store) => store.id === focusedId)) return;
    setFocusedId(null);
  }, [focusedId, displayedStores]);

  useEffect(() => {
    if (boundaryPrefsReady || boundariesQuery.isLoading) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(BOUNDARY_VISIBILITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          showBoundaries?: boolean;
          hiddenBoundaryIds?: string[];
        };
        setShowBoundaries(parsed.showBoundaries !== false);
        setHiddenBoundaryIds(
          Array.isArray(parsed.hiddenBoundaryIds)
            ? parsed.hiddenBoundaryIds.filter((value): value is string => typeof value === 'string')
            : [],
        );
      } else {
        setShowBoundaries(true);
        setHiddenBoundaryIds(boundaries.filter((boundary) => !boundary.isVisibleByDefault).map((boundary) => boundary.id));
      }
    } catch {
      setShowBoundaries(true);
      setHiddenBoundaryIds(boundaries.filter((boundary) => !boundary.isVisibleByDefault).map((boundary) => boundary.id));
    } finally {
      setBoundaryPrefsReady(true);
    }
  }, [boundaries, boundariesQuery.isLoading, boundaryPrefsReady]);

  useEffect(() => {
    if (!boundaryPrefsReady) {
      return;
    }

    window.localStorage.setItem(
      BOUNDARY_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        showBoundaries,
        hiddenBoundaryIds,
      }),
    );
  }, [boundaryPrefsReady, hiddenBoundaryIds, showBoundaries]);

  useEffect(() => {
    if (boundaries.length === 0) {
      return;
    }
    setHiddenBoundaryIds((current) => current.filter((boundaryId) => boundaries.some((boundary) => boundary.id === boundaryId)));
  }, [boundaries]);

  const focusedStore = useMemo(() => {
    if (!focusedId) return null;
    const focused = storeById.get(focusedId);
    if (!focused) return null;
    if (showRouteOnly && !routePlan.selectedStopIds.includes(focused.id)) return null;
    return focused;
  }, [focusedId, routePlan.selectedStopIds, showRouteOnly, storeById]);

  const orderedStops = useMemo(() => {
    const ids = routePlan.orderedStopIds.length > 0 ? routePlan.orderedStopIds : routePlan.selectedStopIds;
    return ids.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store));
  }, [routePlan.orderedStopIds, routePlan.selectedStopIds, storeById]);

  const routeCoordinates = showRouteOnly ? routePlan.optimizedRoute?.geometry?.coordinates ?? orderedStops.map((stop) => [stop.lng, stop.lat] as [number, number]) : [];
  const hasRoadRouteGeometry = showRouteOnly && Boolean(routePlan.optimizedRoute?.geometry?.coordinates?.length);

  const grouped = useMemo(() => {
    const groups = new Map<string, TerritoryStorePin[]>();
    for (const store of displayedStores) {
      const letter = firstLetter(store.name);
      const list = groups.get(letter) ?? [];
      list.push(store);
      groups.set(letter, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayedStores]);

  const repLegend = useMemo(() => {
    if (pinColorMode !== 'rep') {
      return [] as Array<{ label: string; color: string; count: number }>;
    }
    const counts = new Map<string, number>();
    for (const store of displayedStores) {
      const label = store.repNames.find((name) => name.trim().length > 0) ?? 'Unassigned';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count, color: repColorForLabel(label) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [displayedStores, pinColorMode]);

  const highlightedSearchStore = useMemo(() => {
    const query = debouncedMapSearch.trim().toLowerCase();
    if (!query) {
      return null;
    }

    const scoreStore = (store: TerritoryStorePin) => {
      const haystacks = [
        store.name,
        store.locationAddress ?? '',
        store.locationLabel ?? '',
      ]
        .join(' ')
        .toLowerCase();

      if (store.name.toLowerCase() === query) return 0;
      if (store.name.toLowerCase().startsWith(query)) return 1;
      if (haystacks.includes(query)) return 2;
      return 3;
    };

    return [...displayedStores].sort((left, right) => {
      const scoreDiff = scoreStore(left) - scoreStore(right);
      if (scoreDiff !== 0) return scoreDiff;
      return left.name.localeCompare(right.name);
    })[0] ?? null;
  }, [debouncedMapSearch, displayedStores]);

  const lastSearchFocusRef = useRef<string>('');

  useEffect(() => {
    if (view !== 'map') {
      return;
    }

    const highlightedId = highlightedSearchStore?.id ?? '';
    if (!highlightedId) {
      lastSearchFocusRef.current = '';
      return;
    }

    if (lastSearchFocusRef.current === highlightedId) {
      return;
    }

    lastSearchFocusRef.current = highlightedId;
    setFocusedId(highlightedId);
    setFocusRequestToken((current) => current + 1);
  }, [highlightedSearchStore?.id, view]);

  const selectedOnCard = focusedStore ? routePlan.selectedStopIds.includes(focusedStore.id) : false;
  const activeFiltersCount = selectedStatuses.length + selectedReps.length + (locationAvailability === 'all' ? 0 : 1);
  const canVisualizeRoute = routePlan.selectedStopIds.length >= 2;

  function openFiltersSheet() {
    setDraftStatuses(selectedStatuses);
    setDraftReps(selectedReps);
    setDraftLocationAvailability(locationAvailability);
    setDraftPinColorMode(pinColorMode);
    setShowFilters(true);
  }

  function applyDraftFilters() {
    setSelectedStatuses(draftStatuses);
    setSelectedReps(draftReps);
    setLocationAvailability(draftLocationAvailability);
    setPinColorMode(draftPinColorMode);
    setShowFilters(false);
  }

  function persistCurrentFilters() {
    const payload: SavedFiltersPayload = {
      search: search.trim(),
      selectedStatuses,
      selectedReps,
      locationAvailability,
      showRouteOnly,
      pinColorMode,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
    setSavedFiltersAt(payload.savedAt);
    toast.success('Filters saved');
  }

  function clearAllFilters() {
    setSearch('');
    setDebouncedSearch('');
    setSelectedStatuses([]);
    setSelectedReps([]);
    setLocationAvailability('all');
    setShowRouteOnly(false);
    setPinColorMode('status');
    setDraftStatuses([]);
    setDraftReps([]);
    setDraftLocationAvailability('all');
    setDraftPinColorMode('status');
    setSavedFiltersAt(null);
    window.localStorage.removeItem(FILTER_STORAGE_KEY);
    toast.success('Filters cleared');
  }

  function toggleRouteVisualization() {
    if (!showRouteOnly && !canVisualizeRoute) {
      toast.message('Add at least 2 stops in Route first.');
      return;
    }

    setView('map');
    setShowRouteOnly((value) => !value);

    if (!showRouteOnly && orderedStops[0]) {
      setFocusedId(orderedStops[0].id);
      setFocusRequestToken((current) => current + 1);
    }
  }

  function toggleBoundaryVisibility(boundaryId: string) {
    setHiddenBoundaryIds((current) => (current.includes(boundaryId) ? current.filter((value) => value !== boundaryId) : [...current, boundaryId]));
  }

  function toggleAllBoundaries() {
    setShowBoundaries((current) => !current);
  }

  function closeBoundaryEditor() {
    setBoundaryEditor(null);
    setDrawingBoundaryMode(false);
  }

  function startCreatingBoundary() {
    setShowBoundarySheet(false);
    setBoundaryEditor({
      id: null,
      name: '',
      description: '',
      color: '#ef4444',
      borderWidth: 2,
      coordinates: [],
    });
    setDrawingBoundaryMode(true);
    setView('map');
  }

  function startEditingBoundary(boundary: TerritoryBoundaryListResponse['boundaries'][number]) {
    setShowBoundarySheet(false);
    setBoundaryEditor({
      id: boundary.id,
      name: boundary.name,
      description: boundary.description ?? '',
      color: boundary.color,
      borderWidth: boundary.borderWidth,
      coordinates: boundary.coordinates,
    });
    setDrawingBoundaryMode(false);
    setView('map');
  }

  async function deleteBoundary(boundary: TerritoryBoundaryListResponse['boundaries'][number]) {
    if (!window.confirm(`Delete the "${boundary.name}" territory boundary?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/territory/boundaries/${boundary.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Unable to delete territory boundary');
      }

      setHiddenBoundaryIds((current) => current.filter((value) => value !== boundary.id));
      await queryClient.invalidateQueries({ queryKey: ['territory-boundaries'] });
      toast.success('Territory boundary deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete territory boundary');
    }
  }

  async function saveBoundary() {
    if (!boundaryEditor) {
      return;
    }

    if (!boundaryEditor.name.trim()) {
      toast.error('Boundary name is required.');
      return;
    }

    if (boundaryEditor.coordinates.length < 3) {
      toast.error('Add at least 3 points to save a territory.');
      return;
    }

    setSavingBoundary(true);
    try {
      const response = await fetch(
        boundaryEditor.id ? `/api/territory/boundaries/${boundaryEditor.id}` : '/api/territory/boundaries',
        {
          method: boundaryEditor.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: boundaryEditor.name,
            description: boundaryEditor.description || null,
            color: boundaryEditor.color,
            borderWidth: boundaryEditor.borderWidth,
            coordinates: boundaryEditor.coordinates,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to save territory boundary');
      }

      closeBoundaryEditor();
      setShowBoundaries(true);
      await queryClient.invalidateQueries({ queryKey: ['territory-boundaries'] });
      toast.success(boundaryEditor.id ? 'Territory boundary updated' : 'Territory boundary saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save territory boundary');
    } finally {
      setSavingBoundary(false);
    }
  }

  function messageRep(store: TerritoryStorePin | null) {
    if (!store) {
      toast.error('Select a location first.');
      return;
    }
    const email = store.repEmails[0];
    if (!email) {
      toast.message('No rep email is available for this account.');
      return;
    }
    const subject = encodeURIComponent(`PICC follow-up: ${store.name}`);
    window.open(`mailto:${email}?subject=${subject}`, '_blank', 'noopener,noreferrer');
  }

  function centerOnCurrentLocation() {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      toast.error('Current location is not available on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation(nextLocation);
        setLocationRequestToken((current) => current + 1);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Current location is unavailable right now.'
              : 'Unable to read your current location.';
        toast.error(message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
      },
    );
  }

  if (storesQuery.isLoading && !storesQuery.data) {
    return (
      <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center bg-[#e6e6e9]">
        <Loader2 className="h-8 w-8 animate-spin text-[#5f636d]" />
      </div>
    );
  }

  if (storesQuery.isError && !storesQuery.data) {
    return (
      <div className="min-h-[calc(100dvh-76px)] bg-[#e6e6e9] px-5 py-8">
        <div className="rounded-xl border border-[#e0b4ab] bg-[#fbe8e4] p-4 text-[#8f2410]">
          <div className="mb-2 flex items-center gap-2 text-[18px] font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Territory failed to load
          </div>
          <p className="text-[14px]">
            {storesQuery.error instanceof Error
              ? storesQuery.error.message
              : 'Unable to fetch live territory data.'}
          </p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#ce6f5c] bg-white px-3 py-2 text-[14px] font-medium text-[#8f2410]"
            onClick={() => {
              void storesQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100dvh-76px)] bg-[#e6e6e9]">
      <MobileHeader
        className="z-[2600]"
        left={<span />}
        right={null}
      >
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-2">
          <SegmentedControl
            value={view}
            onChange={(value) => setView(value as 'map' | 'list')}
            options={[
              { value: 'map', label: 'Map' },
              { value: 'list', label: 'List' },
            ]}
            className="flex-1 [&_button]:py-1 [&_button]:text-[13px]"
          />
        </div>
      </MobileHeader>

      {view === 'map' ? (
        <div className="relative h-[calc(100dvh-162px)] min-h-[360px] md:h-[calc(100dvh-146px)] lg:h-[calc(100dvh-138px)]">
          <MapRenderBoundary onReset={() => setRefreshNonce((value) => value + 1)}>
            <TerritoryMapMobile
              stores={displayedStores}
              boundaries={boundaries}
              showBoundaries={showBoundaries}
              hiddenBoundaryIds={hiddenBoundaryIds}
              draftBoundary={boundaryEditor ? { ...boundaryEditor } : null}
              drawingBoundaryMode={drawingBoundaryMode}
              selectedStopIds={routePlan.selectedStopIds}
              orderedStopIds={routePlan.orderedStopIds}
              focusedStoreId={focusedStore?.id ?? null}
              highlightedStoreId={highlightedSearchStore?.id ?? null}
              currentLocation={currentLocation}
              locationRequestToken={locationRequestToken}
              focusRequestToken={focusRequestToken}
              routeCoordinates={routeCoordinates}
              pinColorMode={pinColorMode}
              onSelectStore={setFocusedId}
              onDraftBoundaryChange={(coordinates) =>
                setBoundaryEditor((current) => (current ? { ...current, coordinates } : current))
              }
            />
          </MapRenderBoundary>

          <div className="absolute left-1/2 top-3 z-[1500] -translate-x-1/2">
            <button
              type="button"
              disabled={!canVisualizeRoute}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow',
                !canVisualizeRoute
                  ? 'cursor-not-allowed border-white/40 bg-white/65 text-[#80848d]'
                  : showRouteOnly
                  ? 'border-[#39a9ff] bg-[#12344b]/90 text-[#8fd5ff]'
                  : 'border-white/70 bg-white/92 text-[#25313d]',
              )}
              onClick={toggleRouteVisualization}
            >
              {showRouteOnly ? 'Hide Route' : 'Visualize Route'}
            </button>
          </div>

          {showMapSearch || mapSearch.trim().length > 0 ? (
            <div className="absolute left-1/2 top-16 z-[1500] w-[min(calc(100%-16px),420px)] -translate-x-1/2">
              <div className="rounded-2xl bg-white/92 p-2 shadow-[0_12px_24px_rgba(0,0,0,0.16)] backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <MobileSearch
                    value={mapSearch}
                    onChange={setMapSearch}
                    placeholder="Search dispensaries on the map"
                    className="flex-1 bg-[#eef0f3]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMapSearch('');
                      setDebouncedMapSearch('');
                      setShowMapSearch(false);
                      lastSearchFocusRef.current = '';
                    }}
                    className="rounded-xl border border-[#d0d3d9] bg-white px-3 py-2 text-[13px] font-medium text-[#4b4f57]"
                  >
                    Clear
                  </button>
                </div>
                {mapSearch.trim().length > 0 ? (
                  <p className="mt-2 px-1 text-[12px] text-[#62666f]">
                    {highlightedSearchStore ? `Highlighting ${highlightedSearchStore.name}` : 'No dispensaries match this search yet'}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {showRouteOnly && routePlan.selectedStopIds.length >= 2 ? (
            <div className={cn('absolute left-3 z-[1500] rounded-xl bg-black/70 px-2.5 py-1.5 text-[11px] text-white', focusedStore ? 'bottom-[108px]' : 'bottom-3')}>
              {hasRoadRouteGeometry
                ? `${routePlan.optimizedRoute?.mode === 'transit' ? 'Transit' : routePlan.optimizedRoute?.mode === 'bike' ? 'Bike' : 'Driving'} route on roads`
                : 'Add 2+ stops and tap Optimize in Route view'}
            </div>
          ) : null}

          {pinColorMode === 'rep' && repLegend.length > 0 ? (
            <div className={cn('absolute left-3 z-[1500] max-w-[220px] rounded-xl bg-black/70 px-2.5 py-2 text-white', focusedStore ? 'bottom-[148px]' : 'bottom-12')}>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-white/70">Rep Colors</p>
              <div className="space-y-1">
                {repLegend.map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.label}</span>
                    </span>
                    <span className="text-white/70">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="absolute left-2 top-3 z-[1500] flex flex-col gap-2">
            <button
              type="button"
              aria-label="Center on your current location"
              title="Current location"
              className="grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow"
              onClick={centerOnCurrentLocation}
            >
              <Crosshair className="h-5 w-5 text-[#7f828a]" />
            </button>
            <button
              type="button"
              aria-label="Refresh territory data"
              title="Refresh territory data"
              className="grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow"
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <RefreshCw className="h-5 w-5 text-[#7f828a]" />
            </button>
          </div>

          <div className="absolute right-2 top-3 z-[1500] flex flex-col gap-2">
            <button
              type="button"
              aria-label="Search dispensaries on the map"
              title="Search map"
              className={cn('grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', showMapSearch || mapSearch.trim().length > 0 ? 'ring-2 ring-[#cd3814]' : '')}
              onClick={() => setShowMapSearch((current) => !current)}
            >
              <Search className={cn('h-5 w-5', showMapSearch || mapSearch.trim().length > 0 ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
            </button>
            <button
              type="button"
              aria-label="Open territory layers"
              title="Territory layers"
              className={cn('grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', showBoundaries ? 'ring-2 ring-[#cd3814]' : '')}
              onClick={() => setShowBoundarySheet(true)}
            >
              <Layers3 className={cn('h-5 w-5', showBoundaries ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
            </button>
            <button
              type="button"
              aria-label="Open filters"
              title="Filters"
              className={cn('relative grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', activeFiltersCount > 0 ? 'ring-2 ring-[#cd3814]' : '')}
              onClick={openFiltersSheet}
            >
              <Filter className={cn('h-5 w-5', activeFiltersCount > 0 ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
              {activeFiltersCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#cd3814] px-1 text-[11px] font-semibold text-white">{activeFiltersCount}</span> : null}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-28 pt-3">
          {storesQuery.isError ? (
            <div className="mb-3 rounded-lg border border-[#e6b3a7] bg-[#fdebe7] px-3 py-2 text-[13px] text-[#8f2410]">
              Live sync warning: {storesQuery.error instanceof Error ? storesQuery.error.message : 'Failed to refresh territory'}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <MobileSearch value={search} onChange={setSearch} placeholder="Search Locations" className="flex-1" />
            <button
              type="button"
              onClick={openFiltersSheet}
              className={cn('relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white', activeFiltersCount > 0 ? 'border-[#cd3814]' : 'border-[#c8c9cf]')}
            >
              <Filter className={cn('h-5 w-5', activeFiltersCount > 0 ? 'text-[#cd3814]' : 'text-[#6c7078]')} />
              {activeFiltersCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#cd3814] px-1 text-[11px] font-semibold text-white">{activeFiltersCount}</span> : null}
            </button>
          </div>
          <div className="mt-3 border-t border-[#c6c7cb]" />
          {grouped.map(([letter, list]) => (
            <section
              key={letter}
              ref={(element) => {
                sectionRefs.current[letter] = element;
              }}
            >
              <div className="border-b border-[#c6c7cb] px-1 py-2 text-[38px] text-[#8a8d95]">{letter}</div>
              {list.map((store) => {
                const selected = routePlan.selectedStopIds.includes(store.id);
                const pinColor = pinColorForStore(store, pinColorMode);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => setDetailStoreId(store.id)}
                    className="flex w-full items-center gap-3 border-b border-[#d0d1d4] px-1 py-3 text-left"
                  >
                    <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: pinColor }} />
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-lg',
                        selected ? 'border-[#4fb649] text-[#4fb649]' : 'border-[#b8bac0] text-transparent',
                      )}
                    >
                      ✓
                    </span>
                    <span className="truncate text-[22px] text-[#15171c]">{store.name}</span>
                  </button>
                );
              })}
            </section>
          ))}
          <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        </div>
      )}

      {view === 'map' && focusedStore ? (
        <div className="fixed bottom-[86px] left-0 right-0 z-[2500]">
          <div className="mx-auto max-w-[720px] bg-[#1d1f24]/95 text-white shadow-[0_-2px_8px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <button type="button" onClick={() => setDetailStoreId(focusedStore.id)} className="w-full border-b border-[#30333b] px-3 py-2 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[18px] font-semibold leading-tight">{focusedStore.name}</p>
                  <p className="truncate text-[13px] text-[#b6bac3]">{focusedStore.locationAddress ?? focusedStore.locationLabel ?? 'No address'}</p>
                  {focusedStore.isApproximate ? (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#f1cc78]">Approximate ({focusedStore.locationPrecision})</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    {focusedStore.pinKind === 'lead' ? 'Lead Status' : 'Status'}
                  </p>
                  <span className="mt-1 inline-flex max-w-[132px] truncate rounded-full border border-[#39a9ff]/45 bg-[#0f3654] px-2.5 py-1 text-[11px] font-semibold text-[#8fd5ff]">
                    {focusedStore.status}
                  </span>
                </div>
              </div>
            </button>
            <div className="grid grid-cols-[1fr_56px_56px] border-b border-[#30333b]">
              <button type="button" className="flex items-center gap-2 px-3 py-2 text-[14px] text-[#d5d9e1]" onClick={() => messageRep(focusedStore)}>
                <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ backgroundColor: pinColorForStore(focusedStore, pinColorMode) }} />
                {focusedStore.repNames[0] ?? 'Unassigned'}
              </button>
              <button type="button" onClick={() => routePlan.toggleStop(focusedStore.id)} className="grid place-items-center border-l border-[#30333b]">
                <Plus className={cn('h-6 w-6', selectedOnCard ? 'text-[#4fb649]' : 'text-[#d8dde6]')} />
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${focusedStore.lat},${focusedStore.lng}`}
                target="_blank"
                rel="noreferrer"
                className="grid place-items-center border-l border-[#30333b]"
              >
                <Navigation className="h-5 w-5 text-[#d8dde6]" />
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <StoreFilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        statuses={storesQuery.data?.filters.statuses ?? []}
        reps={storesQuery.data?.filters.reps ?? []}
        locationAvailabilityOptions={storesQuery.data?.filters.locationAvailability ?? []}
        selectedStatuses={draftStatuses}
        selectedReps={draftReps}
        locationAvailability={draftLocationAvailability}
        onToggleStatus={(value) => setDraftStatuses((current) => toggleListValue(current, value))}
        onToggleRep={(value) => setDraftReps((current) => toggleListValue(current, value))}
        onSetLocationAvailability={setDraftLocationAvailability}
        pinColorMode={draftPinColorMode}
        onSetPinColorMode={setDraftPinColorMode}
        onApply={applyDraftFilters}
        onSaveSelection={persistCurrentFilters}
        onClearAll={clearAllFilters}
        savedFiltersLabel={formatSavedTimestamp(savedFiltersAt)}
      />
      <TerritoryBoundarySheet
        open={showBoundarySheet}
        onClose={() => setShowBoundarySheet(false)}
        boundaries={boundaries}
        showBoundaries={showBoundaries}
        hiddenBoundaryIds={hiddenBoundaryIds}
        onToggleAll={toggleAllBoundaries}
        onToggleBoundary={toggleBoundaryVisibility}
        isAdmin={appAccess.isAdmin}
        onCreateBoundary={startCreatingBoundary}
        onEditBoundary={startEditingBoundary}
        onDeleteBoundary={deleteBoundary}
      />
      <TerritoryBoundaryEditor
        open={Boolean(boundaryEditor)}
        boundary={boundaryEditor}
        drawingMode={drawingBoundaryMode}
        saving={savingBoundary}
        onClose={closeBoundaryEditor}
        onChange={(patch) => setBoundaryEditor((current) => (current ? { ...current, ...patch } : current))}
        onSetDrawingMode={setDrawingBoundaryMode}
        onUndoLastPoint={() =>
          setBoundaryEditor((current) =>
            current
              ? {
                  ...current,
                  coordinates: current.coordinates.slice(0, -1),
                }
              : current,
          )
        }
        onDeletePoint={(index) =>
          setBoundaryEditor((current) =>
            current
              ? {
                  ...current,
                  coordinates: current.coordinates.filter((_, candidateIndex) => candidateIndex !== index),
                }
              : current,
          )
        }
        onClearPoints={() =>
          setBoundaryEditor((current) =>
            current
              ? {
                  ...current,
                  coordinates: [],
                }
              : current,
          )
        }
        onFinishDrawing={() => setDrawingBoundaryMode(false)}
        onSave={saveBoundary}
      />

      <AccountDetailSheet
        store={detailStoreId ? storeById.get(detailStoreId) ?? null : null}
        onClose={() => setDetailStoreId(null)}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={detailStoreId ? routePlan.selectedStopIds.includes(detailStoreId) : false}
        onCenterStore={(store) => {
          setFocusedId(store.id);
          setView('map');
          setFocusRequestToken((current) => current + 1);
        }}
      />
    </div>
  );
}
