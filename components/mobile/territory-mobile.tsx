'use client';

import dynamic from 'next/dynamic';
import { Filter, ListFilter, MapPinned, MessageCircleMore, Navigation, Plus, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { StoreFilterSheet } from '@/components/mobile/store-filter-sheet';
import { MapRenderBoundary } from '@/components/mobile/map-render-boundary';
import { pinColorForStore, repColorForLabel, type PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';
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

type SavedFiltersPayload = {
  search: string;
  selectedStatuses: string[];
  selectedReps: string[];
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
  const routePlan = useRoutePlan();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showRouteOnly, setShowRouteOnly] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [pinColorMode, setPinColorMode] = useState<PinColorMode>('status');
  const [savedFiltersAt, setSavedFiltersAt] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SavedFiltersPayload>;

      setSearch(typeof parsed.search === 'string' ? parsed.search : '');
      setDebouncedSearch(typeof parsed.search === 'string' ? parsed.search.trim() : '');
      setSelectedStatuses(Array.isArray(parsed.selectedStatuses) ? parsed.selectedStatuses.filter((value): value is string => typeof value === 'string') : []);
      setSelectedReps(Array.isArray(parsed.selectedReps) ? parsed.selectedReps.filter((value): value is string => typeof value === 'string') : []);
      setShowRouteOnly(Boolean(parsed.showRouteOnly));
      setPinColorMode(parsed.pinColorMode === 'rep' ? 'rep' : 'status');
      setSavedFiltersAt(typeof parsed.savedAt === 'string' ? parsed.savedAt : null);
      toast.success('Loaded saved territory filters');
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  const storesQuery = useQuery({
    queryKey: ['territory-mobile', debouncedSearch, selectedStatuses.join('|'), selectedReps.join('|'), refreshNonce],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      for (const status of selectedStatuses) params.append('status', status);
      for (const rep of selectedReps) params.append('rep', rep);
      if (refreshNonce > 0) params.set('refresh', '1');
      const response = await fetch(`/api/territory/stores?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load stores');
      }
      return (await response.json()) as TerritoryStoresResponse;
    },
    staleTime: 30000,
    placeholderData: (previousData) => previousData,
  });

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
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
    if (selectedReps.length > 0 && pinColorMode !== 'rep') {
      setPinColorMode('rep');
    }
    if (selectedReps.length === 0 && selectedStatuses.length > 0 && pinColorMode !== 'status') {
      setPinColorMode('status');
    }
  }, [selectedReps.length, selectedStatuses.length, pinColorMode]);

  useEffect(() => {
    if (!focusedId) return;
    if (displayedStores.some((store) => store.id === focusedId)) return;
    setFocusedId(null);
  }, [focusedId, displayedStores]);

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

  const routeCoordinates = routePlan.optimizedRoute?.geometry?.coordinates ?? orderedStops.map((stop) => [stop.lng, stop.lat] as [number, number]);
  const hasRoadRouteGeometry = Boolean(routePlan.optimizedRoute?.geometry?.coordinates?.length);

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

  const selectedOnCard = focusedStore ? routePlan.selectedStopIds.includes(focusedStore.id) : false;
  const activeFiltersCount = selectedStatuses.length + selectedReps.length;

  function persistCurrentFilters() {
    const payload: SavedFiltersPayload = {
      search: search.trim(),
      selectedStatuses,
      selectedReps,
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
    setShowRouteOnly(false);
    setPinColorMode('status');
    setSavedFiltersAt(null);
    window.localStorage.removeItem(FILTER_STORAGE_KEY);
    toast.success('Filters cleared');
  }

  function toggleRouteOnly() {
    if (!showRouteOnly && routePlan.selectedStopIds.length === 0) {
      toast.message('Add locations to your route first.');
      return;
    }
    setShowRouteOnly((value) => !value);
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

  return (
    <div className="relative min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader
        className="z-[2600]"
        left={<span className="text-[20px]">Visualize</span>}
        right={<span className="text-[20px]">Places</span>}
      >
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as 'map' | 'list')}
          options={[
            { value: 'map', label: 'Map' },
            { value: 'list', label: 'List' },
          ]}
          className="mx-auto max-w-[360px]"
        />
      </MobileHeader>

      {view === 'map' ? (
        <div className="relative h-[calc(100vh-260px)] min-h-[520px]">
          <MapRenderBoundary onReset={() => setRefreshNonce((value) => value + 1)}>
            <TerritoryMapMobile
              stores={displayedStores}
              selectedStopIds={routePlan.selectedStopIds}
              orderedStopIds={routePlan.orderedStopIds}
              focusedStoreId={focusedStore?.id ?? null}
              routeCoordinates={routeCoordinates}
              pinColorMode={pinColorMode}
              onSelectStore={setFocusedId}
            />
          </MapRenderBoundary>

          {routePlan.selectedStopIds.length >= 2 ? (
            <div className="absolute bottom-4 left-3 z-[1500] rounded-xl bg-black/70 px-3 py-2 text-[13px] text-white">
              {hasRoadRouteGeometry
                ? `${routePlan.optimizedRoute?.mode === 'transit' ? 'Transit' : routePlan.optimizedRoute?.mode === 'bike' ? 'Bike' : 'Driving'} route on roads`
                : 'Add 2+ stops and tap Optimize in Route view'}
            </div>
          ) : null}

          {pinColorMode === 'rep' && repLegend.length > 0 ? (
            <div className="absolute bottom-20 left-3 z-[1500] max-w-[240px] rounded-xl bg-black/70 px-3 py-2 text-white">
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

          <div className="absolute left-3 top-6 z-[1500] flex flex-col gap-3">
            <button
              type="button"
              aria-label="Open focused account details"
              className="grid h-12 w-12 place-items-center rounded-xl bg-white/90 shadow"
              onClick={() => {
                if (!focusedStore) {
                  toast.message('Select a location first.');
                  return;
                }
                setDetailStoreId(focusedStore.id);
              }}
            >
              <MapPinned className="h-6 w-6 text-[#7f828a]" />
            </button>
            <button
              type="button"
              aria-label="Refresh territory data"
              className="grid h-12 w-12 place-items-center rounded-xl bg-white/90 shadow"
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <RefreshCw className="h-6 w-6 text-[#7f828a]" />
            </button>
          </div>

          <div className="absolute right-3 top-6 z-[1500] flex flex-col gap-3">
            <button type="button" aria-label="Switch to list view" className="grid h-12 w-12 place-items-center rounded-xl bg-white/90 shadow" onClick={() => setView('list')}>
              <Search className="h-6 w-6 text-[#7f828a]" />
            </button>
            <button
              type="button"
              aria-label="Open filters"
              className={cn('relative grid h-12 w-12 place-items-center rounded-xl bg-white/90 shadow', activeFiltersCount > 0 ? 'ring-2 ring-[#cd3814]' : '')}
              onClick={() => setShowFilters(true)}
            >
              <Filter className={cn('h-6 w-6', activeFiltersCount > 0 ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
              {activeFiltersCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#cd3814] px-1 text-[11px] font-semibold text-white">{activeFiltersCount}</span> : null}
            </button>
            <button type="button" aria-label="Toggle route filter" className={cn('grid h-12 w-12 place-items-center rounded-xl bg-white/90 shadow', showRouteOnly ? 'ring-2 ring-[#4f8edf]' : '')} onClick={toggleRouteOnly}>
              <ListFilter className={cn('h-6 w-6', showRouteOnly ? 'text-[#4f8edf]' : 'text-[#7f828a]')} />
            </button>
            <button type="button" aria-label="Message account rep" className="grid h-12 w-12 place-items-center rounded-xl bg-white/90 shadow" onClick={() => messageRep(focusedStore)}>
              <MessageCircleMore className="h-6 w-6 text-[#d25a3f]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-28 pt-3">
          <div className="flex items-center gap-2">
            <MobileSearch value={search} onChange={setSearch} placeholder="Search Locations" className="flex-1" />
            <button
              type="button"
              onClick={() => setShowFilters(true)}
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
        <div className="fixed bottom-[92px] left-0 right-0 z-[2500]">
          <div className="mx-auto max-w-[480px] bg-[#1d1f24] text-white shadow-[0_-2px_8px_rgba(0,0,0,0.35)]">
            <button type="button" onClick={() => setDetailStoreId(focusedStore.id)} className="w-full border-b border-[#30333b] px-4 py-3 text-left">
              <p className="truncate text-[22px] font-semibold">{focusedStore.name}</p>
              <p className="truncate text-[17px] text-[#b6bac3]">{focusedStore.locationAddress ?? focusedStore.locationLabel ?? 'No address'}</p>
            </button>
            <div className="grid grid-cols-[1fr_72px_72px] border-b border-[#30333b]">
              <button type="button" className="flex items-center gap-2 px-4 py-2 text-[17px] text-[#d5d9e1]" onClick={() => messageRep(focusedStore)}>
                <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: pinColorForStore(focusedStore, pinColorMode) }} />
                {focusedStore.repNames[0] ?? 'Unassigned'}
              </button>
              <button type="button" onClick={() => routePlan.toggleStop(focusedStore.id)} className="grid place-items-center border-l border-[#30333b]">
                <Plus className={cn('h-8 w-8', selectedOnCard ? 'text-[#4fb649]' : 'text-[#d8dde6]')} />
              </button>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${focusedStore.lat},${focusedStore.lng}`}
                target="_blank"
                rel="noreferrer"
                className="grid place-items-center border-l border-[#30333b]"
              >
                <Navigation className="h-7 w-7 text-[#d8dde6]" />
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
        selectedStatuses={selectedStatuses}
        selectedReps={selectedReps}
        onToggleStatus={(value) => setSelectedStatuses((current) => toggleListValue(current, value))}
        onToggleRep={(value) => setSelectedReps((current) => toggleListValue(current, value))}
        pinColorMode={pinColorMode}
        onSetPinColorMode={setPinColorMode}
        onSaveSelection={persistCurrentFilters}
        onClearAll={clearAllFilters}
        savedFiltersLabel={formatSavedTimestamp(savedFiltersAt)}
      />

      <AccountDetailSheet
        store={detailStoreId ? storeById.get(detailStoreId) ?? null : null}
        onClose={() => setDetailStoreId(null)}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={detailStoreId ? routePlan.selectedStopIds.includes(detailStoreId) : false}
        onCenterStore={(store) => {
          setFocusedId(store.id);
          setView('map');
        }}
      />
    </div>
  );
}
