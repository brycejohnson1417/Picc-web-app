'use client';

import { CalendarDays, Check, ChevronRight, GripHorizontal, Loader2, LocateFixed, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import type { RouteMode, TerritoryOptimizedRouteResponse, TerritoryRouteAnchor, TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import { cn } from '@/lib/utils';

interface GeoPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

function firstLetter(name: string) {
  const normalized = name.trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

export function RouteMobile() {
  const router = useRouter();
  const routePlan = useRoutePlan();
  const [tab, setTab] = useState<'current' | 'saved'>('current');
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [travelMode, setTravelMode] = useState<'car' | 'bike' | 'transit'>('car');
  const [startChoice, setStartChoice] = useState('none');
  const [endChoice, setEndChoice] = useState('none');
  const [locating, setLocating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
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

  const selectedStops = useMemo(
    () => routePlan.selectedStopIds.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store)),
    [routePlan.selectedStopIds, storeById],
  );

  const orderedStops = useMemo(() => {
    const ids = optimized?.orderedStopIds.length ? optimized.orderedStopIds : routePlan.orderedStopIds;
    if (ids.length === 0) return selectedStops;
    return ids.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store));
  }, [optimized?.orderedStopIds, routePlan.orderedStopIds, selectedStops, storeById]);

  const endpointOptions = useMemo(() => {
    return [
      { value: 'none', label: 'None' },
      { value: 'current', label: currentLocation ? 'Current Location' : 'Use Current Location' },
      ...selectedStops.map((store) => ({ value: `store:${store.id}`, label: store.name })),
    ];
  }, [selectedStops, currentLocation]);

  const legs = optimized?.legs ?? [];

  function resolveChoice(choice: string): TerritoryRouteAnchor | null {
    if (choice === 'none') return null;
    if (choice === 'current') {
      if (!currentLocation) return null;
      return currentLocation;
    }
    if (choice.startsWith('store:')) {
      const id = choice.slice('store:'.length);
      const store = storeById.get(id);
      if (!store) return null;
      return {
        id: store.id,
        name: store.name,
        lat: store.lat,
        lng: store.lng,
      };
    }
    return null;
  }

  async function requestCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not available on this device');
      return;
    }
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        });
      });

      const point: GeoPoint = {
        id: '__current_location__',
        name: 'Current Location',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCurrentLocation(point);
      toast.success('Current location captured');
    } catch {
      toast.error('Unable to capture current location');
    } finally {
      setLocating(false);
    }
  }

  async function optimizeRoute() {
    const start = resolveChoice(startChoice);
    const end = resolveChoice(endChoice);

    if ((startChoice === 'current' || endChoice === 'current') && !currentLocation) {
      toast.error('Tap Use Current first to optimize from your location');
      return;
    }

    if (selectedStops.length < (start || end ? 1 : 2)) {
      toast.error(start || end ? 'Add at least 1 location to optimize with your start/end.' : 'Add at least 2 locations to optimize.');
      return;
    }

    setOptimizing(true);
    try {
      const optimizeMode: RouteMode = travelMode === 'transit' ? 'car' : travelMode;
      const response = await fetch('/api/territory/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: optimizeMode,
          stops: selectedStops.map((stop) => ({ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng })),
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
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

  function routeSequence() {
    const start = resolveChoice(startChoice);
    const end = resolveChoice(endChoice);
    const points: GeoPoint[] = [];

    if (start) points.push(start);
    for (const store of orderedStops) {
      points.push({ id: store.id, name: store.name, lat: store.lat, lng: store.lng });
    }
    if (end) points.push(end);

    if (!start && points.length > 0) {
      // No explicit origin means first route stop is origin.
      return points;
    }

    return points;
  }

  function launchGo() {
    const points = routeSequence();
    if (points.length < 2) {
      toast.error('Add at least 2 route points before launching directions');
      return;
    }

    const travelmode = travelMode === 'car' ? 'driving' : travelMode === 'bike' ? 'bicycling' : 'transit';
    const params = new URLSearchParams({
      api: '1',
      travelmode,
      origin: `${points[0].lat},${points[0].lng}`,
      destination: `${points[points.length - 1].lat},${points[points.length - 1].lng}`,
    });

    const waypoints = points.slice(1, -1).map((point) => `${point.lat},${point.lng}`).join('|');
    if (waypoints) {
      params.set('waypoints', waypoints);
    }

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[#e6e6e9]">
      <MobileHeader
        title="Route"
        right={
          tab === 'saved' ? (
            <button type="button" className="text-[14px]">Edit</button>
          ) : (
            <button type="button" onClick={() => setShowAddModal(true)} aria-label="Add locations">
              <Plus className="ml-auto h-7 w-7" />
            </button>
          )
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
        <div className="pb-[152px]">
          <div className="border-b border-[#c9cad0] px-4 py-3">
            <SegmentedControl
              value={travelMode}
              onChange={(value) => setTravelMode(value as 'car' | 'bike' | 'transit')}
              options={[
                { value: 'car', label: 'Car' },
                { value: 'bike', label: 'Bike' },
                { value: 'transit', label: 'Transit' },
              ]}
            />

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <select
                value={startChoice}
                onChange={(event) => setStartChoice(event.target.value)}
                className="rounded-lg border border-[#c9cad0] bg-white px-3 py-2 text-[14px] text-[#3b3d44]"
              >
                {endpointOptions.map((option) => (
                  <option key={`start-${option.value}`} value={option.value}>
                    Start: {option.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={requestCurrentLocation} disabled={locating} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#c9cad0] bg-white px-3 py-2 text-[13px]">
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                Use Current
              </button>
            </div>

            <div className="mt-2">
              <select
                value={endChoice}
                onChange={(event) => setEndChoice(event.target.value)}
                className="w-full rounded-lg border border-[#c9cad0] bg-white px-3 py-2 text-[14px] text-[#3b3d44]"
              >
                {endpointOptions.map((option) => (
                  <option key={`end-${option.value}`} value={option.value}>
                    End: {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedStops.length === 0 ? (
            <div className="px-8 py-10 text-center">
              <h2 className="text-[34px] font-semibold text-[#5f5d5e]">Let&apos;s hit the road!</h2>
              <p className="mt-3 text-[15px] leading-6 text-[#606066]">
                Add accounts to build a route, then optimize for car, bike, or transit handoff.
              </p>
              <button type="button" onClick={() => setShowAddModal(true)} className="mt-6 w-full rounded-2xl bg-[#4f8edf] px-6 py-3 text-[16px] font-semibold text-white">
                + Add Location
              </button>
            </div>
          ) : (
            <>
              <div className="border-b border-[#c9cad0] px-4 py-3">
                <button type="button" onClick={() => setShowAddModal(true)} className="w-full rounded-2xl bg-[#4f8edf] px-6 py-3 text-[16px] font-semibold text-white">
                  + Add Location
                </button>
                <p className="mt-2 text-center text-[13px] font-semibold text-[#595c62]">
                  <Check className="mr-1 inline h-4 w-4" /> Route Updated
                </p>
              </div>

              <div className="border-b border-[#c7c8ce] px-4 py-2 text-[#6f7278]">
                <p className="text-[12px]">{new Date().toLocaleDateString()}</p>
                <p className="flex items-center justify-between text-[13px] font-semibold">
                  CURRENT ROUTE
                  <span className="text-[#4f8edf]">{Math.max(0, Math.round((optimized?.totalDurationSeconds ?? 0) / 60))} min</span>
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
                    {index > 0 ? <p className="bg-[#d9d9dd] px-4 py-1 text-[12px] text-[#7a7d83]">Travel Time {travelMinutes} minutes</p> : null}
                    <div className="grid grid-cols-[18px_26px_54px_48px_minmax(0,1fr)_18px] items-center gap-2 border-b border-[#cbccd2] px-3 py-2.5">
                      <GripHorizontal className="h-4 w-4 text-[#b8b9be]" />
                      <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#41b64b] text-[12px] font-semibold text-[#2c7f31]">{index + 1}</span>
                      <div>
                        <p className="text-[12px] font-semibold text-[#4d4f55]">{timeLabel}</p>
                        <p className="text-[11px] text-[#979aa2]">Time</p>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-[#4d4f55]">00:30</p>
                        <p className="text-[11px] text-[#979aa2]">Length</p>
                      </div>
                      <button type="button" onClick={() => routePlan.removeStop(stop.id)} className="min-w-0 truncate text-left text-[15px] font-semibold text-[#3c3e44]">
                        {stop.name}
                      </button>
                      <ChevronRight className="h-4 w-4 text-[#c1c2c8]" />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <SavedRoutesList onRouteLoaded={() => setTab('current')} />
      )}

      {tab === 'current' ? (
        <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-0 right-0 z-[2600]">
          <div className="mx-auto grid max-w-[480px] grid-cols-5 border-t border-[#c4c5cc] bg-[#f3f3f6] py-2 text-[#5a95e7]">
            <button type="button" onClick={launchGo} className="mx-2 rounded-2xl bg-[#3ac128] px-2 py-2 text-[15px] font-bold text-white">
              GO
            </button>
            <ActionIconButton label="optimize" onClick={optimizeRoute} icon={optimizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />} disabled={optimizing} />
            <ActionIconButton
              label="save"
              onClick={() => {
                const name = `Route ${new Date().toLocaleDateString()}`;
                routePlan.saveCurrentRoute(name);
                toast.success('Route saved');
              }}
              icon={<Save className="h-5 w-5" />}
            />
            <ActionIconButton
              label="clear"
              onClick={() => {
                routePlan.clearStops();
                routePlan.setOrderedStopIds([]);
                setOptimized(null);
              }}
              icon={<X className="h-5 w-5" />}
            />
            <ActionIconButton label="calendar" onClick={() => router.push('/calendar')} icon={<CalendarDays className="h-5 w-5" />} />
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

function SavedRoutesList({ onRouteLoaded }: { onRouteLoaded: () => void }) {
  const routePlan = useRoutePlan();

  if (routePlan.savedRoutes.length === 0) {
    return <p className="px-6 py-8 text-[14px] text-[#6f7178]">No saved routes yet.</p>;
  }

  return (
    <div className="pb-28 pt-3">
      <div className="px-4">
        <MobileSearch value="" onChange={() => {}} placeholder="Search Routes" />
      </div>
      <div className="mt-2 border-t border-[#c9cad0]">
        {routePlan.savedRoutes.map((route) => (
          <button
            key={route.id}
            type="button"
            onClick={() => {
              routePlan.loadSavedRoute(route.id);
              onRouteLoaded();
            }}
            className="grid w-full grid-cols-[1fr_24px] items-center border-b border-[#c9cad0] px-4 py-3 text-left"
          >
            <div>
              <p className="text-[15px] text-[#3b3d44]">{route.name}</p>
              <p className="text-[13px] text-[#8f9299]">{new Date(route.createdAt).toLocaleDateString()}</p>
              <p className="text-[13px] text-[#6f7278]">Bryce Johnson</p>
            </div>
            <ChevronRight className="h-6 w-6 text-[#c3c5cc]" />
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
        <div className="bg-[#c93412] px-4 py-3 text-white">
          <div className="relative flex items-center justify-between">
            <button type="button" onClick={onClose} className="min-w-14 text-left" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold">Add Locations</h1>
            <span className="min-w-14 text-right text-[13px] text-white/75">Route</span>
          </div>
        </div>

        <div className="px-4 py-3">
          <MobileSearch value={search} onChange={onSearchChange} placeholder="Search Locations" />
        </div>

        <div className="relative h-[calc(100dvh-220px)] overflow-auto border-t border-[#c8c9ce] pb-8">
          {groups.map(([letter, list]) => (
            <section
              key={letter}
              ref={(element) => {
                sectionRefs.current[letter] = element;
              }}
            >
              <div className="border-b border-[#c6c7cb] px-4 py-1.5 text-[14px] font-semibold text-[#8a8d95]">{letter}</div>
              {list.map((store) => {
                const selected = selectedStopIds.includes(store.id);
                return (
                  <button type="button" key={store.id} onClick={() => onToggleStop(store.id)} className="flex w-full items-center gap-3 border-b border-[#d0d1d4] px-4 py-2.5 text-left">
                    <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs', selected ? 'border-[#49b84c] text-[#49b84c]' : 'border-[#b7b9bf] text-transparent')}>
                      ✓
                    </span>
                    <span className="truncate text-[15px] text-[#15171c]">{store.name}</span>
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
    <button type="button" onClick={onClick} className="flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px]" disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
