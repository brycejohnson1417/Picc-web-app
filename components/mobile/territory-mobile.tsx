'use client';

import dynamic from 'next/dynamic';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { TerritoryFocusedCard } from '@/components/mobile/territory-focused-card';
import { TerritoryListPane } from '@/components/mobile/territory-list-pane';
import { TerritoryMapOverlayControls } from '@/components/mobile/territory-map-overlay-controls';
import {
  TerritoryBoundaryEditor,
  TerritoryBoundarySheet,
  TerritoryMarkerEditor,
  type TerritoryBoundaryEditorState,
} from '@/components/mobile/territory-boundary-sheet';
import { StoreFilterSheet } from '@/components/mobile/store-filter-sheet';
import { useTerritoryData } from '@/components/mobile/use-territory-data';
import { useTerritoryOverlays } from '@/components/mobile/use-territory-overlays';
import { MapRenderBoundary } from '@/components/mobile/map-render-boundary';
import { createRepColorMap, type PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { clearSavedTerritoryFilters, countActiveTerritoryFilters, loadSavedTerritoryFilters, persistSavedTerritoryFilters, type TerritorySavedFiltersPayload } from '@/lib/territory/filter-storage';
import { useRoutePlan } from '@/lib/territory/route-plan-client';

const TerritoryMapMobile = dynamic(
  () => import('@/components/mobile/territory-map-mobile').then((module) => module.TerritoryMapMobile),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-[#d8d8dc]" />,
  },
);
const TERRITORY_UI_STORAGE_KEY = 'picc-territory-ui-state';

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

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function notionPageUrl(pageId: string) {
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
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
  const [selectedReferralSources, setSelectedReferralSources] = useState<string[]>([]);
  const [includeNoReferralSource, setIncludeNoReferralSource] = useState(false);
  const [selectedVendorDayStatuses, setSelectedVendorDayStatuses] = useState<string[]>([]);
  const [locationAvailability, setLocationAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [hasSampleOrderDate, setHasSampleOrderDate] = useState(false);
  const [noLastSampleDeliveryDate, setNoLastSampleDeliveryDate] = useState(false);
  const [sampleAccountTypeFilter, setSampleAccountTypeFilter] = useState<'all' | 'customers' | 'non_customers'>('all');
  const [lastOrderDateFilter, setLastOrderDateFilter] = useState<'all' | 'last_month' | 'last_2_months' | 'three_plus_months'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showMapSearch, setShowMapSearch] = useState(false);
  const [pinColorMode, setPinColorMode] = useState<PinColorMode>('status');
  const [draftStatuses, setDraftStatuses] = useState<string[]>([]);
  const [draftReps, setDraftReps] = useState<string[]>([]);
  const [draftReferralSources, setDraftReferralSources] = useState<string[]>([]);
  const [draftIncludeNoReferralSource, setDraftIncludeNoReferralSource] = useState(false);
  const [draftVendorDayStatuses, setDraftVendorDayStatuses] = useState<string[]>([]);
  const [draftLocationAvailability, setDraftLocationAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [draftHasSampleOrderDate, setDraftHasSampleOrderDate] = useState(false);
  const [draftNoLastSampleDeliveryDate, setDraftNoLastSampleDeliveryDate] = useState(false);
  const [draftSampleAccountTypeFilter, setDraftSampleAccountTypeFilter] = useState<'all' | 'customers' | 'non_customers'>('all');
  const [draftLastOrderDateFilter, setDraftLastOrderDateFilter] = useState<'all' | 'last_month' | 'last_2_months' | 'three_plus_months'>('all');
  const [draftPinColorMode, setDraftPinColorMode] = useState<PinColorMode>('status');
  const [savedFiltersAt, setSavedFiltersAt] = useState<string | null>(null);
  const [focusRequestToken, setFocusRequestToken] = useState(0);
  const [locationRequestToken, setLocationRequestToken] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showRepLegend, setShowRepLegend] = useState(false);
  const [lassoSelection, setLassoSelection] = useState<TerritoryBoundaryEditorState | null>(null);
  const [lassoDrawingMode, setLassoDrawingMode] = useState(false);
  const [lassoSelectedIds, setLassoSelectedIds] = useState<string[]>([]);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(TERRITORY_UI_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        view?: 'map' | 'list';
        focusedId?: string | null;
        detailStoreId?: string | null;
        mapSearch?: string;
      };
      if (saved.view === 'map' || saved.view === 'list') {
        setView(saved.view);
      }
      if (typeof saved.focusedId === 'string') {
        setFocusedId(saved.focusedId);
      }
      if (typeof saved.detailStoreId === 'string') {
        setDetailStoreId(saved.detailStoreId);
      }
      if (typeof saved.mapSearch === 'string') {
        setMapSearch(saved.mapSearch);
        setDebouncedMapSearch(saved.mapSearch.trim());
      }
    } catch {
      // Ignore session storage parse failures.
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        TERRITORY_UI_STORAGE_KEY,
        JSON.stringify({
          view,
          focusedId,
          detailStoreId,
          mapSearch,
        }),
      );
    } catch {
      // Ignore session storage write failures.
    }
  }, [detailStoreId, focusedId, mapSearch, view]);

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
    const parsed = loadSavedTerritoryFilters();
    if (!parsed) {
      return;
    }

    setSearch(typeof parsed.search === 'string' ? parsed.search : '');
    setDebouncedSearch(typeof parsed.search === 'string' ? parsed.search.trim() : '');
    setSelectedStatuses(Array.isArray(parsed.selectedStatuses) ? parsed.selectedStatuses.filter((value): value is string => typeof value === 'string') : []);
    setSelectedReps(Array.isArray(parsed.selectedReps) ? parsed.selectedReps.filter((value): value is string => typeof value === 'string') : []);
    setSelectedReferralSources(
      Array.isArray(parsed.selectedReferralSources)
        ? parsed.selectedReferralSources.filter((value): value is string => typeof value === 'string')
        : [],
    );
    setIncludeNoReferralSource(Boolean(parsed.includeNoReferralSource));
    setSelectedVendorDayStatuses(
      Array.isArray(parsed.selectedVendorDayStatuses)
        ? parsed.selectedVendorDayStatuses.filter((value): value is string => typeof value === 'string')
        : [],
    );
    setLocationAvailability(parsed.locationAvailability === 'available' || parsed.locationAvailability === 'unavailable' ? parsed.locationAvailability : 'all');
    setHasSampleOrderDate(Boolean(parsed.hasSampleOrderDate));
    setNoLastSampleDeliveryDate(Boolean(parsed.noLastSampleDeliveryDate));
    setSampleAccountTypeFilter(
      parsed.sampleAccountTypeFilter === 'customers' || parsed.sampleAccountTypeFilter === 'non_customers'
        ? parsed.sampleAccountTypeFilter
        : 'all',
    );
    setLastOrderDateFilter(
      parsed.lastOrderDateFilter === 'last_month' ||
        parsed.lastOrderDateFilter === 'last_2_months' ||
        parsed.lastOrderDateFilter === 'three_plus_months'
        ? parsed.lastOrderDateFilter
        : 'all',
    );
    setShowRouteOnly(Boolean(parsed.showRouteOnly));
    setPinColorMode(parsed.pinColorMode === 'rep' ? 'rep' : 'status');
    setSavedFiltersAt(typeof parsed.savedAt === 'string' ? parsed.savedAt : null);
    toast.success('Loaded saved territory filters');
  }, []);

  const { storesQuery, boundariesQuery, markersQuery } = useTerritoryData({
    search: debouncedSearch,
    selectedStatuses,
    selectedReps,
    selectedReferralSources,
    includeNoReferralSource,
    selectedVendorDayStatuses,
    locationAvailability,
    hasSampleOrderDate,
    noLastSampleDeliveryDate,
    sampleAccountTypeFilter,
    lastOrderDateFilter,
    refreshNonce,
  });

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const boundaries = useMemo(() => boundariesQuery.data?.boundaries ?? [], [boundariesQuery.data?.boundaries]);
  const markers = useMemo(() => markersQuery.data?.markers ?? [], [markersQuery.data?.markers]);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const mapStores = useMemo(() => {
    let nextStores = stores;
    if (showRouteOnly) {
      nextStores = nextStores.filter((store) => routePlan.selectedStopIds.includes(store.id));
    }
    return nextStores;
  }, [showRouteOnly, stores, routePlan.selectedStopIds]);

  const listStores = useMemo(() => {
    if (lassoSelectedIds.length === 0) {
      return mapStores;
    }
    const selectedSet = new Set(lassoSelectedIds);
    return mapStores.filter((store) => selectedSet.has(store.id));
  }, [lassoSelectedIds, mapStores]);

  useEffect(() => {
    if (showRouteOnly && routePlan.selectedStopIds.length === 0) {
      setShowRouteOnly(false);
    }
  }, [showRouteOnly, routePlan.selectedStopIds.length]);

  useEffect(() => {
    if (!lassoSelection || lassoSelection.coordinates.length < 3) {
      setLassoSelectedIds([]);
      return;
    }

    const nextIds = stores
      .filter((store) => pointInPolygon([store.lng, store.lat], lassoSelection.coordinates))
      .map((store) => store.id);
    setLassoSelectedIds(nextIds);
  }, [lassoSelection, stores]);

  useEffect(() => {
    if (!focusedId) return;
    if (mapStores.some((store) => store.id === focusedId)) return;
    setFocusedId(null);
  }, [focusedId, mapStores]);

  const {
    showBoundaries,
    hiddenBoundaryIds,
    showMarkers,
    hiddenMarkerIds,
    showBoundarySheet,
    setShowBoundarySheet,
    boundaryEditor,
    setBoundaryEditor,
    drawingBoundaryMode,
    setDrawingBoundaryMode,
    savingBoundary,
    markerEditor,
    setMarkerEditor,
    savingMarker,
    searchingMarkerAddress,
    toggleBoundaryVisibility,
    toggleAllBoundaries,
    toggleMarkerVisibility,
    toggleAllMarkers,
    closeBoundaryEditor,
    closeMarkerEditor,
    startCreatingBoundary,
    startEditingBoundary,
    startCreatingMarker,
    startEditingMarker,
    deleteBoundary,
    deleteMarker,
    saveBoundary,
    searchMarkerAddress,
    saveMarker,
  } = useTerritoryOverlays({
    boundaries,
    markers,
    boundariesLoading: boundariesQuery.isLoading,
    queryClient,
    onShowMap: () => setView('map'),
    onCenterLocation: (location) => {
      setCurrentLocation(location);
      setLocationRequestToken((current) => current + 1);
    },
  });

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
    for (const store of listStores) {
      const letter = firstLetter(store.name);
      const list = groups.get(letter) ?? [];
      list.push(store);
      groups.set(letter, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [listStores]);

  const repLegend = useMemo(() => {
    if (pinColorMode !== 'rep') {
      return [] as Array<{ label: string; color: string; count: number }>;
    }
    const counts = new Map<string, number>();
    for (const store of mapStores) {
      const label = store.repNames.find((name) => name.trim().length > 0) ?? 'Unassigned';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const colorMap = createRepColorMap([...counts.keys()]);
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count, color: colorMap.get(label) ?? '#64748b' }))
      .sort((a, b) => {
        const countDiff = b.count - a.count;
        if (countDiff !== 0) {
          return countDiff;
        }
        return a.label.localeCompare(b.label);
      });
  }, [mapStores, pinColorMode]);

  const repColorMap = useMemo(() => createRepColorMap(repLegend.map((entry) => entry.label)), [repLegend]);

  useEffect(() => {
    if (pinColorMode !== 'rep') {
      setShowRepLegend(false);
    }
  }, [pinColorMode]);

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

    return [...mapStores].sort((left, right) => {
      const scoreDiff = scoreStore(left) - scoreStore(right);
      if (scoreDiff !== 0) return scoreDiff;
      return left.name.localeCompare(right.name);
    })[0] ?? null;
  }, [debouncedMapSearch, mapStores]);

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
  const activeFiltersCount = countActiveTerritoryFilters({
    selectedStatuses,
    selectedReps,
    selectedReferralSources,
    includeNoReferralSource,
    selectedVendorDayStatuses,
    locationAvailability,
    hasSampleOrderDate,
    noLastSampleDeliveryDate,
    sampleAccountTypeFilter,
    lastOrderDateFilter,
  });
  const canVisualizeRoute = routePlan.selectedStopIds.length >= 2;

  function openFiltersSheet() {
    setDraftStatuses(selectedStatuses);
    setDraftReps(selectedReps);
    setDraftReferralSources(selectedReferralSources);
    setDraftIncludeNoReferralSource(includeNoReferralSource);
    setDraftVendorDayStatuses(selectedVendorDayStatuses);
    setDraftLocationAvailability(locationAvailability);
    setDraftHasSampleOrderDate(hasSampleOrderDate);
    setDraftNoLastSampleDeliveryDate(noLastSampleDeliveryDate);
    setDraftSampleAccountTypeFilter(sampleAccountTypeFilter);
    setDraftLastOrderDateFilter(lastOrderDateFilter);
    setDraftPinColorMode(pinColorMode);
    setShowFilters(true);
  }

  function applyDraftFilters() {
    setSelectedStatuses(draftStatuses);
    setSelectedReps(draftReps);
    setSelectedReferralSources(draftReferralSources);
    setIncludeNoReferralSource(draftIncludeNoReferralSource);
    setSelectedVendorDayStatuses(draftVendorDayStatuses);
    setLocationAvailability(draftLocationAvailability);
    setHasSampleOrderDate(draftHasSampleOrderDate);
    setNoLastSampleDeliveryDate(draftNoLastSampleDeliveryDate);
    setSampleAccountTypeFilter(draftSampleAccountTypeFilter);
    setLastOrderDateFilter(draftLastOrderDateFilter);
    setPinColorMode(draftPinColorMode);
    setShowFilters(false);
  }

  function persistCurrentFilters() {
    const payload: TerritorySavedFiltersPayload = {
      search: search.trim(),
      selectedStatuses,
      selectedReps,
      selectedReferralSources,
      includeNoReferralSource,
      selectedVendorDayStatuses,
      locationAvailability,
      hasSampleOrderDate,
      noLastSampleDeliveryDate,
      sampleAccountTypeFilter,
      lastOrderDateFilter,
      showRouteOnly,
      pinColorMode,
      savedAt: new Date().toISOString(),
    };
    persistSavedTerritoryFilters(payload);
    setSavedFiltersAt(payload.savedAt);
    toast.success('Filters saved');
  }

  function clearAllFilters() {
    setSearch('');
    setDebouncedSearch('');
    setSelectedStatuses([]);
    setSelectedReps([]);
    setSelectedReferralSources([]);
    setIncludeNoReferralSource(false);
    setSelectedVendorDayStatuses([]);
    setLocationAvailability('all');
    setHasSampleOrderDate(false);
    setNoLastSampleDeliveryDate(false);
    setSampleAccountTypeFilter('all');
    setLastOrderDateFilter('all');
    setShowRouteOnly(false);
    setPinColorMode('status');
    setDraftStatuses([]);
    setDraftReps([]);
    setDraftReferralSources([]);
    setDraftIncludeNoReferralSource(false);
    setDraftVendorDayStatuses([]);
    setDraftLocationAvailability('all');
    setDraftHasSampleOrderDate(false);
    setDraftNoLastSampleDeliveryDate(false);
    setDraftSampleAccountTypeFilter('all');
    setDraftLastOrderDateFilter('all');
    setDraftPinColorMode('status');
    setSavedFiltersAt(null);
    setLassoSelection(null);
    setLassoDrawingMode(false);
    setLassoSelectedIds([]);
    clearSavedTerritoryFilters();
    toast.success('Filters cleared');
  }

  function toggleLassoMode() {
    if (lassoSelection) {
      setLassoSelection(null);
      setLassoDrawingMode(false);
      setLassoSelectedIds([]);
      return;
    }

    setLassoSelection({
      id: 'selection',
      name: 'Selection',
      description: '',
      color: '#2563eb',
      borderWidth: 2,
      coordinates: [],
    });
    setLassoDrawingMode(true);
    setShowRouteOnly(false);
    setView('map');
    toast.message('Tap the map to draw a lasso, then tap Finish Lasso.');
  }

  function finishLasso() {
    if (!lassoSelection || lassoSelection.coordinates.length < 3) {
      toast.error('Add at least 3 points to finish the lasso.');
      return;
    }

    setLassoDrawingMode(false);
    setView('list');
    toast.success(`Selected ${lassoSelectedIds.length} account${lassoSelectedIds.length === 1 ? '' : 's'}.`);
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
    <div className="relative min-h-[calc(100dvh-76px)] bg-[#e6e6e9] lg:min-h-[calc(100dvh-64px)]">
      <MobileHeader className="z-[2600]">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-2 lg:max-w-none">
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
        <div className="relative h-[calc(100dvh-122px)] min-h-[360px] md:h-[calc(100dvh-116px)] lg:h-[calc(100dvh-112px)]">
          <MapRenderBoundary onReset={() => setRefreshNonce((value) => value + 1)}>
            <TerritoryMapMobile
              stores={mapStores}
              boundaries={boundaries}
              markers={markers}
              showBoundaries={showBoundaries}
              hiddenBoundaryIds={hiddenBoundaryIds}
              showMarkers={showMarkers}
              hiddenMarkerIds={hiddenMarkerIds}
              draftBoundary={boundaryEditor ? { ...boundaryEditor } : null}
              drawingBoundaryMode={drawingBoundaryMode}
              selectionBoundaryDraft={lassoSelection ? { ...lassoSelection } : null}
              selectionDrawingMode={lassoDrawingMode}
              selectedStopIds={routePlan.selectedStopIds}
              orderedStopIds={routePlan.orderedStopIds}
              focusedStoreId={focusedStore?.id ?? null}
              highlightedStoreId={highlightedSearchStore?.id ?? null}
              currentLocation={currentLocation}
              locationRequestToken={locationRequestToken}
              focusRequestToken={focusRequestToken}
              routeCoordinates={routeCoordinates}
              pinColorMode={pinColorMode}
              repColorMap={repColorMap}
              onSelectStore={setFocusedId}
              onDraftBoundaryChange={(coordinates) =>
                setBoundaryEditor((current) => (current ? { ...current, coordinates } : current))
              }
              onSelectionBoundaryChange={(coordinates) =>
                setLassoSelection((current) => (current ? { ...current, coordinates } : current))
              }
            />
          </MapRenderBoundary>

          <TerritoryMapOverlayControls
            canVisualizeRoute={canVisualizeRoute}
            showRouteOnly={showRouteOnly}
            onToggleRouteVisualization={toggleRouteVisualization}
            lassoActive={Boolean(lassoSelection)}
            lassoDrawingMode={lassoDrawingMode}
            onToggleLassoMode={toggleLassoMode}
            onFinishLasso={finishLasso}
            showMapSearch={showMapSearch}
            mapSearch={mapSearch}
            onMapSearchChange={setMapSearch}
            onClearMapSearch={() => {
              setMapSearch('');
              setDebouncedMapSearch('');
              setShowMapSearch(false);
              lastSearchFocusRef.current = '';
            }}
            highlightedSearchStoreName={highlightedSearchStore?.name ?? null}
            hasRoadRouteGeometry={hasRoadRouteGeometry}
            routeModeLabel={
              routePlan.optimizedRoute?.mode === 'transit'
                ? 'Transit'
                : routePlan.optimizedRoute?.mode === 'bike'
                  ? 'Bike'
                  : 'Driving'
            }
            pinColorMode={pinColorMode}
            repLegend={repLegend}
            showRepLegend={showRepLegend}
            onToggleRepLegend={() => setShowRepLegend((current) => !current)}
            focusedStoreVisible={Boolean(focusedStore)}
            onCenterCurrentLocation={centerOnCurrentLocation}
            onRefreshData={() => setRefreshNonce((value) => value + 1)}
            onToggleMapSearch={() => setShowMapSearch((current) => !current)}
            onOpenBoundarySheet={() => setShowBoundarySheet(true)}
            showBoundaries={showBoundaries}
            onOpenFilters={openFiltersSheet}
            activeFiltersCount={activeFiltersCount}
          />
        </div>
      ) : (
        <TerritoryListPane
          storesQueryError={storesQuery.isError ? (storesQuery.error instanceof Error ? storesQuery.error : new Error('Failed to refresh territory')) : null}
          search={search}
          onSearchChange={setSearch}
          activeFiltersCount={activeFiltersCount}
          onOpenFilters={openFiltersSheet}
          lassoSelectedCount={lassoSelectedIds.length}
          onClearLassoSelection={() => {
            setLassoSelection(null);
            setLassoDrawingMode(false);
            setLassoSelectedIds([]);
          }}
          groupedStores={grouped}
          sectionRefs={sectionRefs}
          routeSelectedIds={routePlan.selectedStopIds}
          pinColorMode={pinColorMode}
          repColorMap={repColorMap}
          onOpenStore={setDetailStoreId}
        />
      )}

      {view === 'map' && focusedStore ? (
        <TerritoryFocusedCard
          store={focusedStore}
          selectedOnRoute={selectedOnCard}
          pinColorMode={pinColorMode}
          repColorMap={repColorMap}
          onOpenDetails={setDetailStoreId}
          onMessageRep={messageRep}
          onToggleRouteStop={routePlan.toggleStop}
          notionPageUrl={notionPageUrl(focusedStore.notionPageId)}
        />
      ) : null}

      <StoreFilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        statuses={storesQuery.data?.filters.statuses ?? []}
        reps={storesQuery.data?.filters.reps ?? []}
        referralSources={storesQuery.data?.filters.referralSources ?? []}
        vendorDayStatuses={storesQuery.data?.filters.vendorDayStatuses ?? []}
        locationAvailabilityOptions={storesQuery.data?.filters.locationAvailability ?? []}
        selectedStatuses={draftStatuses}
        selectedReps={draftReps}
        selectedReferralSources={draftReferralSources}
        includeNoReferralSource={draftIncludeNoReferralSource}
        selectedVendorDayStatuses={draftVendorDayStatuses}
        locationAvailability={draftLocationAvailability}
        hasSampleOrderDate={draftHasSampleOrderDate}
        noLastSampleDeliveryDate={draftNoLastSampleDeliveryDate}
        sampleAccountTypeFilter={draftSampleAccountTypeFilter}
        lastOrderDateFilter={draftLastOrderDateFilter}
        onToggleStatus={(value) => setDraftStatuses((current) => toggleListValue(current, value))}
        onToggleRep={(value) => setDraftReps((current) => toggleListValue(current, value))}
        onToggleReferralSource={(value) => setDraftReferralSources((current) => toggleListValue(current, value))}
        onSetIncludeNoReferralSource={setDraftIncludeNoReferralSource}
        onToggleVendorDayStatus={(value) => setDraftVendorDayStatuses((current) => toggleListValue(current, value))}
        onSetLocationAvailability={setDraftLocationAvailability}
        onSetHasSampleOrderDate={setDraftHasSampleOrderDate}
        onSetNoLastSampleDeliveryDate={setDraftNoLastSampleDeliveryDate}
        onSetSampleAccountTypeFilter={setDraftSampleAccountTypeFilter}
        onSetLastOrderDateFilter={setDraftLastOrderDateFilter}
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
        markers={markers}
        showMarkers={showMarkers}
        hiddenMarkerIds={hiddenMarkerIds}
        onToggleAllMarkers={toggleAllMarkers}
        onToggleMarker={toggleMarkerVisibility}
        onCreateMarker={startCreatingMarker}
        onEditMarker={startEditingMarker}
        onDeleteMarker={deleteMarker}
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
      <TerritoryMarkerEditor
        open={Boolean(markerEditor)}
        marker={markerEditor}
        saving={savingMarker}
        searching={searchingMarkerAddress}
        onClose={closeMarkerEditor}
        onChange={(patch) => setMarkerEditor((current) => (current ? { ...current, ...patch } : current))}
        onSearchAddress={searchMarkerAddress}
        onSave={saveMarker}
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
