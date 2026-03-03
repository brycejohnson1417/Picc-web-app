'use client';

import { CalendarDays, Check, ChevronRight, GripHorizontal, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import type { RouteMode, TerritoryOptimizedRouteResponse, TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import { cn } from '@/lib/utils';

function firstLetter(name: string) {
  const normalized = name.trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

export function RouteMobile() {
  const routePlan = useRoutePlan();
  const [tab, setTab] = useState<'current' | 'saved'>('current');
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [optMode] = useState<RouteMode>('car');
  const [optimizing, setOptimizing] = useState(false);
  const [optimized, setOptimized] = useState<TerritoryOptimizedRouteResponse | null>(null);

  const storesQuery = useQuery({
    queryKey: ['route-mobile-stores'],
    queryFn: async () => {
      const response = await fetch('/api/territory/stores');
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

  const selectedStops = useMemo(() => routePlan.selectedStopIds.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store)), [routePlan.selectedStopIds, storeById]);

  const orderedStops = useMemo(() => {
    const ids = optimized?.orderedStopIds ?? routePlan.orderedStopIds;
    if (ids.length === 0) return selectedStops;
    return ids.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store));
  }, [optimized?.orderedStopIds, routePlan.orderedStopIds, selectedStops, storeById]);

  const legs = optimized?.legs ?? [];

  async function optimizeRoute() {
    if (selectedStops.length < 2) {
      toast.error('Add at least 2 locations to optimize.');
      return;
    }

    setOptimizing(true);
    try {
      const response = await fetch('/api/territory/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: optMode,
          stops: selectedStops.map((stop) => ({ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Optimization failed');
      }

      const data = payload as TerritoryOptimizedRouteResponse;
      setOptimized(data);
      routePlan.setOrderedStopIds(data.orderedStopIds);
      toast.success('Route optimized');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Optimization failed');
    } finally {
      setOptimizing(false);
    }
  }

  function launchGo() {
    if (orderedStops.length < 2) {
      toast.error('Add at least 2 locations to launch directions.');
      return;
    }
    const coords = orderedStops.map((stop) => `${stop.lat},${stop.lng}`);
    const params = new URLSearchParams({
      api: '1',
      travelmode: 'driving',
      origin: coords[0],
      destination: coords[coords.length - 1],
    });
    const waypoints = coords.slice(1, -1).join('|');
    if (waypoints) params.set('waypoints', waypoints);
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader
        title="Route"
        right={
          tab === 'saved' ? <button className="text-[24px]">Edit</button> : <Plus className="ml-auto h-10 w-10" />
        }
      >
        <SegmentedControl
          value={tab}
          onChange={(value) => setTab(value as 'current' | 'saved')}
          options={[
            { value: 'current', label: 'Current Route' },
            { value: 'saved', label: 'Saved Routes' },
          ]}
        />
      </MobileHeader>

      {tab === 'current' ? (
        <div className="pb-[172px]">
          {selectedStops.length === 0 ? (
            <div className="px-10 py-12 text-center">
              <h2 className="text-[56px] font-semibold text-[#5f5d5e]">Let&apos;s hit the road!</h2>
              <p className="mt-4 text-[22px] leading-8 text-[#606066]">
                Create an optimize route by adding accounts or addresses with the button below. Get out there and sell with less hassle!
              </p>
              <button onClick={() => setShowAddModal(true)} className="mt-8 w-full rounded-[38px] bg-[#4f8edf] px-6 py-4 text-[23px] font-semibold text-white">
                + Add Location
              </button>
            </div>
          ) : (
            <>
              <div className="border-b border-[#c9cad0] px-6 py-5">
                <button onClick={() => setShowAddModal(true)} className="w-full rounded-[38px] bg-[#4f8edf] px-6 py-4 text-[23px] font-semibold text-white">
                  + Add Location
                </button>
                <p className="mt-3 text-center text-[20px] font-semibold text-[#595c62]">
                  <Check className="mr-2 inline h-6 w-6" /> Route Updated
                </p>
              </div>

              <div className="border-b border-[#c7c8ce] px-4 py-2 text-[#6f7278]">
                <p className="text-[16px]">{new Date().toLocaleDateString()}</p>
                <p className="flex items-center justify-between text-[19px] font-semibold">
                  CURRENT ROUTE
                  <span className="text-[#4f8edf]">STATS</span>
                </p>
              </div>

              {orderedStops.map((stop, index) => {
                const leg = legs[index - 1];
                const travelMinutes = leg ? Math.max(1, Math.round(leg.durationSeconds / 60)) : index === 0 ? 0 : 8;
                const etaDate = new Date();
                etaDate.setHours(9, 0, 0, 0);
                etaDate.setMinutes(etaDate.getMinutes() + index * 35 + (index === 0 ? 0 : travelMinutes));
                const timeLabel = etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '');

                return (
                  <div key={stop.id}>
                    {index > 0 ? <p className="bg-[#d9d9dd] px-6 py-1 text-[16px] text-[#7a7d83]">Travel Time {travelMinutes} minutes</p> : null}
                    <div className="grid grid-cols-[34px_38px_86px_86px_1fr_22px] items-center gap-2 border-b border-[#cbccd2] px-4 py-3">
                      <GripHorizontal className="h-6 w-6 text-[#b8b9be]" />
                      <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#41b64b] text-[18px] font-semibold text-[#2c7f31]">{index + 1}</span>
                      <div>
                        <p className="text-[17px] font-semibold text-[#4d4f55]">{timeLabel}</p>
                        <p className="text-[14px] text-[#979aa2]">Time</p>
                      </div>
                      <div>
                        <p className="text-[17px] font-semibold text-[#4d4f55]">00:30</p>
                        <p className="text-[14px] text-[#979aa2]">Length</p>
                      </div>
                      <button type="button" onClick={() => routePlan.removeStop(stop.id)} className="truncate text-left text-[23px] font-semibold text-[#3c3e44]">
                        {stop.name}
                      </button>
                      <ChevronRight className="h-6 w-6 text-[#c1c2c8]" />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <SavedRoutesList />
      )}

      {tab === 'current' ? (
        <div className="fixed bottom-[92px] left-0 right-0 z-[2600]">
          <div className="mx-auto grid max-w-[480px] grid-cols-5 border-t border-[#c4c5cc] bg-[#f3f3f6] py-2 text-[#5a95e7]">
            <button onClick={launchGo} className="mx-2 rounded-3xl bg-[#3ac128] px-2 py-2 text-[20px] font-bold text-white">
              GO
            </button>
            <ActionIconButton label="optimize" onClick={optimizeRoute} icon={<RotateCcw className="h-7 w-7" />} disabled={optimizing} />
            <ActionIconButton
              label="save"
              onClick={() => {
                const name = `Route ${new Date().toLocaleDateString()}`;
                routePlan.saveCurrentRoute(name);
                toast.success('Route saved');
              }}
              icon={<Save className="h-7 w-7" />}
            />
            <ActionIconButton
              label="clear"
              onClick={() => {
                routePlan.clearStops();
                routePlan.setOrderedStopIds([]);
                setOptimized(null);
              }}
              icon={<X className="h-7 w-7" />}
            />
            <ActionIconButton label="+ calendar" onClick={() => toast.message('Calendar sync is next')} icon={<CalendarDays className="h-7 w-7" />} />
          </div>
        </div>
      ) : null}

      {showAddModal ? (
        <AddLocationModal
          stores={stores}
          search={search}
          onSearchChange={setSearch}
          onClose={() => setShowAddModal(false)}
          selectedStopIds={routePlan.selectedStopIds}
          onToggleStop={routePlan.toggleStop}
        />
      ) : null}
    </div>
  );
}

function SavedRoutesList() {
  const routePlan = useRoutePlan();

  if (routePlan.savedRoutes.length === 0) {
    return <p className="px-6 py-8 text-[22px] text-[#6f7178]">No saved routes yet.</p>;
  }

  return (
    <div className="pb-28 pt-3">
      <div className="px-4">
        <MobileSearch value="" onChange={() => {}} placeholder="Search Routes" />
      </div>
      <div className="mt-2 border-t border-[#c9cad0]">
        {routePlan.savedRoutes.map((route) => (
          <button key={route.id} onClick={() => routePlan.loadSavedRoute(route.id)} className="grid w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-6 py-4 text-left">
            <div>
              <p className="text-[23px] text-[#3b3d44]">{route.name}</p>
              <p className="text-[20px] text-[#8f9299]">{new Date(route.createdAt).toLocaleDateString()}</p>
              <p className="text-[20px] text-[#6f7278]">Bryce Johnson</p>
            </div>
            <ChevronRight className="h-8 w-8 text-[#c3c5cc]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AddLocationModal({
  stores,
  search,
  onSearchChange,
  onClose,
  selectedStopIds,
  onToggleStop,
}: {
  stores: TerritoryStorePin[];
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  selectedStopIds: string[];
  onToggleStop: (id: string) => void;
}) {
  const [mode, setMode] = useState<'accounts' | 'quick-stop'>('accounts');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((store) => store.name.toLowerCase().includes(q));
  }, [stores, search]);

  const groups = useMemo(() => {
    const map = new Map<string, TerritoryStorePin[]>();
    for (const store of filtered) {
      const letter = firstLetter(store.name);
      const list = map.get(letter) ?? [];
      list.push(store);
      map.set(letter, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="fixed inset-0 z-[5200] bg-black/35">
      <div className="mx-auto h-full max-w-[480px] bg-[#e6e6e9]">
        <div className="bg-[#c93412] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white">
          <div className="mb-2 flex items-center justify-between text-sm opacity-90">
            <span className="font-semibold">12:18</span>
            <span className="font-semibold">100%</span>
          </div>
          <div className="relative flex items-center justify-between py-2">
            <button onClick={onClose} className="min-w-14 text-left" aria-label="Close">
              <X className="h-8 w-8" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[28px] font-semibold">Add Locations</h1>
            <span className="min-w-14 text-right text-[24px] text-white/45">Add to route</span>
          </div>
          <SegmentedControl
            value={mode}
            onChange={(value) => setMode(value as 'accounts' | 'quick-stop')}
            options={[
              { value: 'accounts', label: 'Accounts' },
              { value: 'quick-stop', label: 'Quick Stop' },
            ]}
          />
        </div>

        <div className="px-4 py-3">
          <MobileSearch value={search} onChange={onSearchChange} placeholder="Search Locations" />
        </div>

        <div className="relative h-[calc(100vh-320px)] overflow-auto border-t border-[#c8c9ce] pb-8">
          {groups.map(([letter, list]) => (
            <section
              key={letter}
              ref={(element) => {
                sectionRefs.current[letter] = element;
              }}
            >
              <div className="border-b border-[#c6c7cb] px-4 py-2 text-[38px] text-[#8a8d95]">{letter}</div>
              {list.map((store) => {
                const selected = selectedStopIds.includes(store.id);
                return (
                  <button key={store.id} onClick={() => onToggleStop(store.id)} className="flex w-full items-center gap-3 border-b border-[#d0d1d4] px-4 py-3 text-left">
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-lg', selected ? 'border-[#49b84c] text-[#49b84c]' : 'border-[#b7b9bf] text-transparent')}>
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
      </div>
    </div>
  );
}

function ActionIconButton({ label, icon, onClick, disabled = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 text-[14px]" disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
