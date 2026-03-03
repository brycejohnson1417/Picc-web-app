'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Filter, LocateFixed, Navigation, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { StoreFilterSheet } from '@/components/mobile/store-filter-sheet';
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

function firstLetter(name: string) {
  const normalized = name.trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

export function TerritoryMobile() {
  const routePlan = useRoutePlan();
  const searchParams = useSearchParams();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const focusParam = searchParams.get('focus');

  useEffect(() => {
    if (!focusParam) return;
    setFocusedId(focusParam);
    setView('map');
  }, [focusParam]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

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

  const focusedStore = useMemo(() => {
    if (!focusedId) return null;
    return storeById.get(focusedId) ?? null;
  }, [focusedId, storeById]);

  const orderedStops = useMemo(() => {
    const ids = routePlan.orderedStopIds.length > 0 ? routePlan.orderedStopIds : routePlan.selectedStopIds;
    return ids.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store));
  }, [routePlan.orderedStopIds, routePlan.selectedStopIds, storeById]);

  const routeCoordinates = orderedStops.map((stop) => [stop.lng, stop.lat] as [number, number]);

  const grouped = useMemo(() => {
    const groups = new Map<string, TerritoryStorePin[]>();
    for (const store of stores) {
      const letter = firstLetter(store.name);
      const list = groups.get(letter) ?? [];
      list.push(store);
      groups.set(letter, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stores]);

  const selectedOnCard = focusedStore ? routePlan.selectedStopIds.includes(focusedStore.id) : false;

  return (
    <div className="relative min-h-[calc(100dvh-84px)] bg-[#e6e6e9]">
      <MobileHeader className="z-[2600]" left={<span className="text-[16px]">Visualize</span>} right={<span className="text-[16px]">Places</span>}>
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value as 'map' | 'list')}
          options={[
            { value: 'map', label: 'Map' },
            { value: 'list', label: 'List' },
          ]}
          className="mx-auto max-w-[280px]"
        />
      </MobileHeader>

      {view === 'map' ? (
        <div className="relative h-[calc(100dvh-142px)] min-h-[420px]">
          <TerritoryMapMobile
            stores={stores}
            selectedStopIds={routePlan.selectedStopIds}
            orderedStopIds={routePlan.orderedStopIds}
            focusedStoreId={focusedStore?.id ?? null}
            routeCoordinates={routeCoordinates}
            onSelectStore={setFocusedId}
          />

          <div className="absolute left-3 top-4 z-[1500] flex flex-col gap-2">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 shadow"
              onClick={() => setFocusedId(null)}
              title="Recenter"
            >
              <LocateFixed className="h-5 w-5 text-[#7f828a]" />
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 shadow"
              onClick={() => setRefreshNonce((v) => v + 1)}
              title="Refresh"
            >
              <Navigation className="h-5 w-5 text-[#7f828a]" />
            </button>
          </div>

          <div className="absolute right-3 top-4 z-[1500] flex flex-col gap-2">
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 shadow" onClick={() => setView('list')} title="List">
              <Search className="h-5 w-5 text-[#7f828a]" />
            </button>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-white/95 shadow" onClick={() => setShowFilters(true)} title="Filters">
              <Filter className="h-5 w-5 text-[#7f828a]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-28 pt-3">
          <div className="flex items-center gap-2">
            <MobileSearch value={search} onChange={setSearch} placeholder="Search Locations" className="flex-1" />
            <button type="button" onClick={() => setShowFilters(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#c8c9cf] bg-white">
              <Filter className="h-5 w-5 text-[#6c7078]" />
            </button>
          </div>
          <div className="mt-2 border-t border-[#c6c7cb]" />
          {grouped.map(([letter, list]) => (
            <section
              key={letter}
              ref={(element) => {
                sectionRefs.current[letter] = element;
              }}
            >
              <div className="border-b border-[#c6c7cb] px-1 py-1.5 text-[14px] font-semibold text-[#8a8d95]">{letter}</div>
              {list.map((store) => {
                const selected = routePlan.selectedStopIds.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => setDetailStoreId(store.id)}
                    className="flex w-full items-center gap-3 border-b border-[#d0d1d4] px-2 py-3 text-left active:bg-black/5"
                    aria-label={`Open ${store.name}`}
                  >
                    <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs', selected ? 'border-[#4fb649] text-[#4fb649]' : 'border-[#b8bac0] text-transparent')}>
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-[#15171c]">{store.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9b9ea6]" />
                  </button>
                );
              })}
            </section>
          ))}
          <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        </div>
      )}

      {view === 'map' && focusedStore ? (
        <div className="fixed bottom-[84px] left-0 right-0 z-[2500]">
          <div className="mx-auto max-w-[480px] bg-[#1d1f24] text-white shadow-[0_-2px_8px_rgba(0,0,0,0.35)]">
            <button type="button" onClick={() => setDetailStoreId(focusedStore.id)} className="w-full border-b border-[#30333b] px-4 py-2.5 text-left">
              <p className="truncate text-[16px] font-semibold">{focusedStore.name}</p>
              <p className="truncate text-[13px] text-[#b6bac3]">{focusedStore.locationAddress ?? focusedStore.locationLabel ?? 'No address'}</p>
            </button>
            <div className="grid grid-cols-[1fr_56px_56px] border-b border-[#30333b]">
              <button type="button" className="flex items-center gap-2 px-4 py-2 text-[13px] text-[#d5d9e1]">
                <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ backgroundColor: focusedStore.statusColor }} />
                {focusedStore.repNames[0] ?? 'Unassigned'}
              </button>
              <button type="button" onClick={() => routePlan.toggleStop(focusedStore.id)} className="grid place-items-center border-l border-[#30333b]" title="Add to route">
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
        selectedStatuses={selectedStatuses}
        selectedReps={selectedReps}
        onToggleStatus={(value) => {
          setSelectedStatuses((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
        }}
        onToggleRep={(value) => {
          setSelectedReps((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
        }}
        onReset={() => {
          setSelectedStatuses([]);
          setSelectedReps([]);
        }}
      />

      <AccountDetailSheet
        store={detailStoreId ? storeById.get(detailStoreId) ?? null : null}
        onClose={() => setDetailStoreId(null)}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={detailStoreId ? routePlan.selectedStopIds.includes(detailStoreId) : false}
        onCenterOnMap={(id) => {
          setDetailStoreId(null);
          setFocusedId(id);
          setView('map');
        }}
      />
    </div>
  );
}
