'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, ChevronRight, ListChecks, Loader2, MapPin, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import type { RouteMode, TerritoryOptimizedRouteResponse, TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import { splitRouteLegs, ROUTE_ORIGIN_ID, type RouteLocation } from '@/lib/territory/route-planning';
import { cn } from '@/lib/utils';

function firstLetter(name: string) {
  const normalized = name.trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

function formatDistance(meters: number) {
  if (!meters || meters < 0) return '0.0 mi';
  const miles = meters / 1609.34;
  return `${miles.toFixed(miles >= 100 ? 0 : 1)} mi`;
}

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0m';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return hours > 0 ? `${hours}h ${rem}m` : `${minutes}m`;
}

const MODE_OPTIONS: Array<{ value: RouteMode; label: string }> = [
  { value: 'car', label: 'Drive' },
  { value: 'bike', label: 'Bike' },
  { value: 'transit', label: 'Transit' },
];

export function RouteMobile() {
  const router = useRouter();
  const routePlan = useRoutePlan();
  const [tab, setTab] = useState<'current' | 'saved'>('current');
  const [showAddModal, setShowAddModal] = useState(false);
  const [savedEditing, setSavedEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [optMode, setOptMode] = useState<RouteMode>('car');
  const [optimizing, setOptimizing] = useState(false);
  const [originAddress, setOriginAddress] = useState('');
  const [originError, setOriginError] = useState('');
  const [locating, setLocating] = useState(false);
  const [showDirections, setShowDirections] = useState(false);
  useEffect(() => { setOriginAddress(routePlan.origin?.name ?? ''); }, [routePlan.origin?.name]);

  useEffect(() => {
    if (tab === 'current') {
      setSavedEditing(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!routePlan.optimizedRoute) {
      return;
    }
    setOptMode(routePlan.optimizedRoute.mode);
  }, [routePlan.optimizedRoute]);

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

  const activeOptimized = useMemo(() => {
    if (!routePlan.optimizedRoute) return null;
    const allStopsAvailable = routePlan.optimizedRoute.orderedStopIds.every((id) => storeById.has(id));
    if (!allStopsAvailable) return null;
    return routePlan.optimizedRoute;
  }, [routePlan.optimizedRoute, storeById]);

  const orderedStops = useMemo(() => {
    const ids = activeOptimized?.orderedStopIds ?? routePlan.orderedStopIds;
    if (ids.length === 0) return selectedStops;
    return ids.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store));
  }, [activeOptimized?.orderedStopIds, routePlan.orderedStopIds, selectedStops, storeById]);

  const missingIds = routePlan.selectedStopIds.filter(id => !storeById.has(id));
  const routeReady = missingIds.length === 0 && !storesQuery.isError && !storesQuery.isLoading && orderedStops.length <= 50;
  const navigationStops = routePlan.origin ? [{ ...routePlan.origin, id: ROUTE_ORIGIN_ID }, ...orderedStops] : orderedStops;
  const navigationSections = splitRouteLegs(navigationStops, optMode === 'transit' ? 2 : 5);
  const legs = activeOptimized?.legs ?? [];
  const totalDistanceMeters = activeOptimized?.totalDistanceMeters ?? legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const totalDurationSeconds = activeOptimized?.totalDurationSeconds ?? legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);

  function moveStop(stopId: string, direction: 'up' | 'down') {
    const currentOrder = orderedStops.map((stop) => stop.id);
    const currentIndex = currentOrder.indexOf(stopId);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    routePlan.setOrderedStopIds(nextOrder);
  }

  async function optimizeRoute(address?: string) {
    if (!routeReady) { toast.error('Resolve unavailable stores or reduce the route to 50 stores first.'); return; }
    if (orderedStops.length < 2 && !routePlan.origin && !address) {
      toast.error('Add at least 2 locations to optimize.');
      return;
    }

    const requestedAddress = address ?? (originAddress.trim() !== (routePlan.origin?.name ?? '') ? originAddress.trim() || undefined : undefined);
    setOptimizing(true);
    setOriginError('');
    try {
      const response = await fetch('/api/territory/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: optMode,
          optimize: !address,
          origin: routePlan.origin ?? undefined,
          originAddress: requestedAddress,
          stops: orderedStops.map((stop) => ({ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Optimization failed');
      }

      const data = payload as TerritoryOptimizedRouteResponse;
      routePlan.setOptimizedRoute(data);

      if (address) toast.success('Starting location applied');
      if (data.warning) {
        toast.warning(data.warning);
      } else if (data.estimationModel === 'transit-heuristic') {
        toast.success('Stop order updated. Transit times are estimates.');
      } else if (!address) {
        toast.success('Route optimized using road directions.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Optimization failed';
      if (requestedAddress) setOriginError(message);
      toast.error(message);
    } finally {
      setOptimizing(false);
    }
  }

  function directionsUrl(section: RouteLocation[]) {
    const coords = section.map(stop => `${stop.lat},${stop.lng}`);
    const params = new URLSearchParams({ api: '1', travelmode: optMode === 'transit' ? 'transit' : optMode === 'bike' ? 'bicycling' : 'driving', origin: coords[0], destination: coords[coords.length - 1] });
    if (coords.length > 2) params.set('waypoints', coords.slice(1, -1).join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function launchGo() {
    if (!routeReady || !navigationSections.length) { toast.error('Add two stores or a starting location, and resolve unavailable stores.'); return; }
    setShowDirections(true);
  }

  function useCurrentLocation() {
    setOriginError('');
    if (!navigator.geolocation) { setOriginError('Location is unavailable. Enter a starting address instead.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      routePlan.setOrigin({ name: 'Current location', lat: position.coords.latitude, lng: position.coords.longitude });
      setLocating(false);
    }, () => { setOriginError('Location access failed. Allow location access or enter an address.'); setLocating(false); }, { timeout: 10000, maximumAge: 60000 });
  }

  function launchCalendarDraft() {
    if (orderedStops.length === 0) {
      toast.error('Add at least 1 location to draft a calendar event.');
      return;
    }

    const details = orderedStops
      .map((stop, index) => `${index + 1}. ${stop.name}${stop.locationAddress ? ` - ${stop.locationAddress}` : ''}`)
      .join('\n');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `PICC ${optMode === 'transit' ? 'Transit' : optMode === 'bike' ? 'Bike' : 'Driving'} Route - ${new Date().toLocaleDateString()}`,
      details: `${routePlan.origin ? `Start: ${routePlan.origin.name}\n` : ''}${details}`,
    });

    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-[calc(100dvh-92px)] bg-[#f3f5f8] text-slate-900">
      <MobileHeader
        title="Route"
        right={
          tab === 'saved' ? (
            <button type="button" className="text-[24px]" onClick={() => setSavedEditing((value) => !value)}>
              {savedEditing ? 'Done' : 'Edit'}
            </button>
          ) : (
            <button type="button" className="grid h-10 w-10 place-items-center" onClick={() => setShowAddModal(true)} aria-label="Choose route accounts" disabled={optimizing}>
              <ListChecks className="h-8 w-8" />
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
        <div className={cn(selectedStops.length > 0 ? 'pb-[172px]' : 'pb-6')}>
          {routePlan.selectedCount > 50 ? <p role="alert" className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">This route contains more than 50 stores. Remove stores to enable optimization.</p> : null}
          {storesQuery.isLoading ? <p role="status" className="px-4 py-3 text-sm text-slate-600">Loading route accounts…</p> : null}
          {storesQuery.isError || (!storesQuery.isLoading && missingIds.length > 0) ? (
            <div role="alert" className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>{storesQuery.isError ? 'Accounts could not be loaded.' : `${missingIds.length} selected ${missingIds.length === 1 ? 'store is' : 'stores are'} unavailable. Your selection has been kept.`}</p>
              <button className="min-h-11 font-semibold underline" onClick={() => void storesQuery.refetch()}>Retry accounts</button>
              {!storesQuery.isError ? missingIds.map((id, index) => <div key={id} className="flex items-center justify-between gap-3"><span>Unavailable store {index + 1}</span><button className="min-h-11 underline" onClick={() => routePlan.removeStop(id)}>Remove unavailable store {index + 1}</button></div>) : null}
            </div>
          ) : null}
          {selectedStops.length === 0 ? (
            <div className="px-5 py-5">
              <div className="rounded-xl border border-[#cfd3dc] bg-white p-5 shadow-[0_16px_36px_rgba(24,33,45,0.08)]">
                <p className="text-[13px] font-semibold text-[#6b7280]">Current route</p>
                <h2 className="mt-1 text-[28px] font-semibold leading-tight text-[#23262d]">Start with the accounts you need to visit.</h2>
                <p className="mt-2 text-[15px] leading-6 text-[#60646f]">Pick accounts, reorder stops, then optimize for drive, bike, or transit.</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <RouteMetric label="Stops" value="0" />
                  <RouteMetric label="ETA" value="0m" />
                  <RouteMetric label="Miles" value="0.0" />
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#276fd3] px-4 text-[17px] font-semibold text-white transition active:scale-[0.99]"
                >
                  <ListChecks className="h-5 w-5" />
                  Choose accounts
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="font-semibold">{routePlan.selectedCount} / 50 stores</p><p className="text-sm text-slate-500">{activeOptimized ? 'Route calculated' : 'Ready to plan'}</p></div>
                  <button disabled={optimizing} onClick={() => setShowAddModal(true)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-blue-700 disabled:opacity-50">Choose Accounts</button>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <label htmlFor="route-origin" className="block text-sm font-semibold">Starting location</label>
                  <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); if (originAddress.trim()) void optimizeRoute(originAddress.trim()); }}>
                    <input id="route-origin" disabled={optimizing || locating} value={originAddress} onChange={event => { setOriginAddress(event.target.value); setOriginError(''); }} placeholder="Enter a street address" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base" />
                    <button disabled={optimizing || locating || !originAddress.trim() || !routeReady} className="min-h-11 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{optimizing ? 'Working…' : 'Apply'}</button>
                  </form>
                  <div className="flex flex-wrap items-center gap-x-4 text-sm">
                    <button disabled={locating || optimizing} onClick={useCurrentLocation} className="min-h-11 font-medium text-blue-700">{locating ? 'Finding location…' : 'Use current location'}</button>
                    {routePlan.origin ? <button disabled={optimizing} onClick={() => { routePlan.setOrigin(null); setOriginError(''); }} className="min-h-11 text-slate-600 underline">Remove start</button> : null}
                  </div>
                  <p className="text-xs leading-5 text-slate-500">{routePlan.origin ? `Start: ${routePlan.origin.name}. This starting location stays on this device and applies to loaded routes.` : 'Without a starting location, the first store stays first.'}</p>
                  {originError ? <p role="alert" className="mt-2 text-sm text-red-700">{originError}</p> : null}
                </div>
                <fieldset disabled={optimizing || locating} className="mt-3">
                  <SegmentedControl
                    value={optMode}
                    onChange={(value) => {
                      setOptMode(value as RouteMode);
                      routePlan.clearOptimizedRoute();
                    }}
                    options={MODE_OPTIONS}
                  />
                </fieldset>
                {optMode === 'transit' ? <p className="mt-2 text-center text-[14px] text-[#64666d]">Transit times are geographic estimates, not live schedules.</p> : null}
              </div>

              {activeOptimized?.warning ? <p role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Road directions unavailable. Distances and times below are straight-line estimates. Try optimizing again.</p> : null}
              {activeOptimized?.planningNote ? <p className="bg-blue-50 px-4 py-2 text-xs leading-5 text-blue-900">{activeOptimized.planningNote}</p> : null}
              <div className="border-b border-slate-200 px-4 py-3 text-slate-600">
                <p className="text-[16px]">{new Date().toLocaleDateString()}</p>
                <p className="flex items-center justify-between text-[19px] font-semibold">
                  CURRENT ROUTE
                  <span className="text-sm text-blue-700">{activeOptimized ? `${formatDuration(totalDurationSeconds)} · ${formatDistance(totalDistanceMeters)}` : 'Optimize for travel times'}</span>
                </p>
              </div>

              {orderedStops.map((stop, index) => {
                const previousLeg = legs.find(leg => leg.toStopId === stop.id);

                return (
                  <div key={stop.id}>
                    {previousLeg ? (
                      <p className="bg-[#d9d9dd] px-6 py-1 text-[16px] text-[#7a7d83]">
                        Travel {formatDuration(previousLeg?.durationSeconds ?? 0)} · {formatDistance(previousLeg?.distanceMeters ?? 0)}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-[44px_28px_minmax(0,1fr)_44px] items-center gap-2 border-b border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${stop.name} up`}
                          className="grid h-11 w-11 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:text-slate-200"
                          onClick={() => moveStop(stop.id, 'up')}
                          disabled={optimizing || index === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${stop.name} down`}
                          className="grid h-11 w-11 place-items-center rounded text-slate-500 hover:bg-slate-100 disabled:text-slate-200"
                          onClick={() => moveStop(stop.id, 'down')}
                          disabled={optimizing || index === orderedStops.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="mt-1 grid h-8 w-8 place-items-center rounded-full border-2 border-[#41b64b] text-[18px] font-semibold text-[#2c7f31]">{index + 1}</span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => router.push(`/accounts?storeId=${encodeURIComponent(stop.id)}`)}
                          className="block w-full text-left text-base font-semibold leading-snug text-slate-900 whitespace-normal break-words"
                        >
                          {stop.name}
                        </button>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {stop.locationAddress || `Stop ${index + 1}`}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: stop.statusColor || '#64748b' }} />{stop.status || 'Status unavailable'}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${stop.name}`}
                        disabled={optimizing} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => routePlan.removeStop(stop.id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <SavedRoutesList
          editing={savedEditing}
          onLoadRoute={() => {
            setTab('current');
            setSavedEditing(false);
          }}
        />
      )}

      {tab === 'current' && selectedStops.length > 0 ? (
        <div className="fixed bottom-[var(--picc-bottom-nav-clearance)] left-0 right-0 z-[2600]">
          <div className="mx-auto grid max-w-[var(--app-shell-max)] grid-cols-5 border-t border-[#c4c5cc] bg-[#f3f3f6] py-2 text-[#5a95e7]">
            <button onClick={launchGo} className="mx-2 rounded-3xl bg-[#3ac128] px-2 py-2 text-[20px] font-bold text-white">
              GO
            </button>
            <ActionIconButton label={optimizing ? '...' : 'optimize'} onClick={() => void optimizeRoute()} icon={<RotateCcw className="h-7 w-7" />} disabled={optimizing || locating || !routeReady} />
            <ActionIconButton
              label="save"
              onClick={async () => {
                if (selectedStops.length === 0) {
                  toast.error('Add at least 1 location before saving.');
                  return;
                }
                const suggestedName = `Route ${new Date().toLocaleDateString()}`;
                const name = window.prompt('Name this route', suggestedName);
                if (name === null) {
                  return;
                }
                if (!name.trim()) {
                  toast.error('Enter a route name before saving.');
                  return;
                }

                try {
                  await routePlan.saveCurrentRoute(name, {
                    mode: optMode,
                    optimizedRoute: activeOptimized,
                  });
                  toast.success('Route saved');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to save route');
                }
              }}
              icon={<Save className="h-7 w-7" />}
            />
            <ActionIconButton
              label="clear"
              disabled={optimizing}
              onClick={() => {
                routePlan.clearStops();
              }}
              icon={<X className="h-7 w-7" />}
            />
            <ActionIconButton label="calendar" onClick={launchCalendarDraft} icon={<CalendarDays className="h-7 w-7" />} />
          </div>
        </div>
      ) : null}

      <Dialog.Root open={showDirections} onOpenChange={setShowDirections}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[5200] bg-slate-950/40" />
          <Dialog.Content className="fixed bottom-0 left-1/2 z-[5201] max-h-[80dvh] w-full max-w-[var(--app-shell-max)] -translate-x-1/2 overflow-auto rounded-t-2xl bg-white p-5 pb-8 text-slate-900">
            <div className="flex items-center justify-between"><Dialog.Title className="text-lg font-semibold">Route directions</Dialog.Title><Dialog.Close aria-label="Close directions" className="grid h-11 w-11 place-items-center"><X className="h-5 w-5" /></Dialog.Close></div>
            <Dialog.Description className="mb-3 text-sm text-slate-600">Open each section in order. Sections share their connecting stop so Google Maps keeps every store.</Dialog.Description>
            {navigationSections.map((section, index) => <a key={index} href={directionsUrl(section)} target="_blank" rel="noopener noreferrer" className="mb-2 block rounded-lg border border-slate-200 px-4 py-3 hover:bg-blue-50"><span className="font-semibold text-blue-700">Section {index + 1} of {navigationSections.length}</span><span className="mt-1 block text-sm text-slate-600">{section[0].name} → {section[section.length - 1].name}</span></a>)}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {showAddModal ? (
        <AddLocationModal
          stores={stores}
          loading={storesQuery.isLoading || storesQuery.isFetching}
          error={storesQuery.error instanceof Error ? storesQuery.error.message : storesQuery.isError ? 'Failed to load accounts' : null}
          search={search}
          onSearchChange={setSearch}
          onClose={() => setShowAddModal(false)}
          selectedStopIds={routePlan.selectedStopIds}
          onToggleStop={routePlan.toggleStop}
          onRetry={() => {
            void storesQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function RouteMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e1e5ec] bg-[#f7f9fc] px-2 py-3">
      <p className="text-[18px] font-semibold text-[#22252c]">{value}</p>
      <p className="text-[12px] font-medium text-[#737985]">{label}</p>
    </div>
  );
}

function SavedRoutesList({ editing, onLoadRoute }: { editing: boolean; onLoadRoute: () => void }) {
  const routePlan = useRoutePlan();
  const [search, setSearch] = useState('');

  const routes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routePlan.savedRoutes;
    return routePlan.savedRoutes.filter((route) => route.name.toLowerCase().includes(q));
  }, [routePlan.savedRoutes, search]);

  if (routePlan.savedRoutesLoading && routePlan.savedRoutes.length === 0) {
    return <p className="px-6 py-8 text-[22px] text-[#6f7178]">Loading saved routes...</p>;
  }

  if (routePlan.savedRoutesError && routePlan.savedRoutes.length === 0) {
    return <p className="px-6 py-8 text-[22px] text-[#6f7178]">{routePlan.savedRoutesError}</p>;
  }

  if (routePlan.savedRoutes.length === 0) {
    return <p className="px-6 py-8 text-[22px] text-[#6f7178]">No saved routes yet.</p>;
  }

  return (
    <div className="pb-28 pt-3">
      <div className="px-4">
        <MobileSearch value={search} onChange={setSearch} placeholder="Search Routes" />
      </div>
      <div className="mt-2 border-t border-[#c9cad0]">
        {routes.map((route) => (
          <div key={route.id} className="grid grid-cols-[1fr_40px] items-center border-b border-[#c9cad0] px-2">
            <button
              type="button"
              onClick={() => {
                routePlan.loadSavedRoute(route.id);
                onLoadRoute();
              }}
              className="px-4 py-4 text-left"
            >
              <p className="text-[23px] text-[#3b3d44]">{route.name}</p>
              <p className="text-[20px] text-[#8f9299]">{new Date(route.createdAt).toLocaleDateString()}</p>
              <p className="text-[16px] text-[#6f7278]">{route.mode === 'transit' ? 'Transit' : route.mode === 'bike' ? 'Bike' : 'Drive'}</p>
            </button>
            {editing ? (
              <button
                type="button"
                aria-label={`Delete ${route.name}`}
                className="grid h-10 w-10 place-items-center rounded-xl text-[#c14a4a]"
                onClick={async () => {
                  try {
                    await routePlan.deleteSavedRoute(route.id);
                    toast.success('Route deleted');
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed to delete route');
                  }
                }}
              >
                <Trash2 className="h-6 w-6" />
              </button>
            ) : (
              <ChevronRight className="h-8 w-8 justify-self-center text-[#c3c5cc]" />
            )}
          </div>
        ))}
        {routes.length === 0 ? <p className="px-6 py-6 text-[19px] text-[#7e8189]">No routes match your search.</p> : null}
      </div>
    </div>
  );
}

function AddLocationModal({
  stores,
  loading,
  error,
  search,
  onSearchChange,
  onClose,
  selectedStopIds,
  onToggleStop,
  onRetry,
}: {
  stores: TerritoryStorePin[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  selectedStopIds: string[];
  onToggleStop: (id: string) => void;
  onRetry: () => void;
}) {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const trimmedSearch = search.trim();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((store) => {
      const haystack = [store.name, store.locationAddress ?? '', store.city ?? '', store.state ?? '', store.status].join(' ').toLowerCase();
      return haystack.includes(q);
    });
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

  const selectedCount = selectedStopIds.length;
  const resultLabel = loading && stores.length === 0
    ? 'Loading accounts...'
    : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'account' : 'accounts'}`;

  return (
    <div className="fixed inset-0 z-[5200] bg-black/35 backdrop-blur-[2px]">
      <div className="mx-auto flex h-full max-w-[var(--app-shell-max)] flex-col bg-[#eef1f5]">
        <div className="bg-[#c93412] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white shadow-[0_10px_28px_rgba(100,25,9,0.22)]">
          <div className="relative flex items-center justify-between py-2">
            <button onClick={onClose} className="min-w-14 text-left" aria-label="Close">
              <X className="h-8 w-8" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[24px] font-semibold">Choose Accounts</h1>
            <span className="min-w-14 text-right text-[16px] font-semibold text-white/80">{selectedCount}</span>
          </div>
        </div>

        <div className="border-b border-[#d5dae3] bg-white px-4 py-3">
          <MobileSearch value={search} onChange={onSearchChange} placeholder="Search Accounts" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 text-[14px] font-medium text-[#596170]">
              {resultLabel}
              {trimmedSearch ? <span className="text-[#8a91a0]"> for &quot;{trimmedSearch}&quot;</span> : null}
            </p>
            <p className="shrink-0 rounded-full bg-[#eef7ee] px-3 py-1 text-[13px] font-semibold text-[#237a2a]">{selectedCount} selected</p>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto pb-8">
          {loading && stores.length === 0 ? <AccountPickerSkeleton /> : null}

          {error && stores.length === 0 ? (
            <div className="m-4 rounded-xl border border-[#efc5b8] bg-[#fff3ef] p-4 text-[#8f2410]">
              <div className="flex items-center gap-2 text-[16px] font-semibold">
                <AlertTriangle className="h-5 w-5" />
                Accounts failed to load
              </div>
              <p className="mt-2 text-[14px] leading-5">{error}</p>
              <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-[#d58d7e] bg-white px-3 py-2 text-[14px] font-semibold">
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !error && filtered.length === 0 ? (
            <div className="m-4 rounded-xl border border-[#d8dde7] bg-white p-5 text-center">
              <p className="text-[19px] font-semibold text-[#252933]">No accounts match this search.</p>
              <p className="mt-2 text-[14px] leading-5 text-[#68707d]">Try a store name, city, status, or clear the search to browse all accounts.</p>
              {trimmedSearch ? (
                <button type="button" onClick={() => onSearchChange('')} className="mt-4 rounded-lg bg-[#276fd3] px-4 py-2 text-[14px] font-semibold text-white">
                  Clear search
                </button>
              ) : null}
            </div>
          ) : null}

          {groups.map(([letter, list]) => (
            <section
              key={letter}
              ref={(element) => {
                sectionRefs.current[letter] = element;
              }}
            >
              <div className="sticky top-0 z-10 border-b border-[#d5dae3] bg-[#eef1f5]/95 px-4 py-2 text-[22px] font-semibold text-[#6d7480] backdrop-blur">{letter}</div>
              <div className="divide-y divide-[#e0e4eb] bg-white">
                {list.map((store) => {
                  const selected = selectedStopIds.includes(store.id);
                  const meta = [store.city, store.state].filter(Boolean).join(', ');
                  return (
                    <button
                      key={store.id}
                      onClick={() => onToggleStop(store.id)}
                      className={cn(
                        'grid w-full grid-cols-[40px_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-left transition active:bg-[#eef4ff]',
                        selected ? 'bg-[#f0faf0]' : 'bg-white',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-[15px] font-bold transition',
                          selected ? 'border-[#34a13d] bg-[#34a13d] text-white' : 'border-[#b7bdc7] text-transparent',
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[19px] font-semibold text-[#181b22]">{store.name}</span>
                        <span className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-[#69717e]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{store.locationAddress || meta || store.status}</span>
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-[#d6dce6] bg-[#f8fafc] px-2 py-0.5 text-[12px] font-medium text-[#596170]">{store.status}</span>
                          {store.repNames.slice(0, 2).map((rep) => (
                            <span key={rep} className="rounded-full bg-[#edf4ff] px-2 py-0.5 text-[12px] font-medium text-[#2f65a7]">
                              {rep}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {groups.length > 0 ? <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} /> : null}
        </div>
      </div>
    </div>
  );
}

function AccountPickerSkeleton() {
  return (
    <div className="divide-y divide-[#e0e4eb] bg-white">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 px-4 py-3">
          <div className="mt-1 h-8 w-8 animate-pulse rounded-full bg-[#dbe1ea]" />
          <div className="min-w-0 space-y-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-[#dbe1ea]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[#e6ebf1]" />
            <div className="flex gap-2">
              <div className="h-5 w-16 animate-pulse rounded-full bg-[#e6ebf1]" />
              <div className="h-5 w-24 animate-pulse rounded-full bg-[#e6ebf1]" />
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 px-4 py-4 text-[14px] font-medium text-[#68707d]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading route accounts
      </div>
    </div>
  );
}

function ActionIconButton({ label, icon, onClick, disabled = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex flex-col items-center justify-center gap-1 text-[14px]', disabled ? 'opacity-50' : '')} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
