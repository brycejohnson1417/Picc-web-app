'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { MapCanvas } from '@/components/territory/map-canvas';
import { RouteSheet } from '@/components/territory/route-sheet';
import { TerritoryFilterBar } from '@/components/territory/filter-bar';
import { applyOptimizedOrder, clearRouteStops, initialTerritoryRouteState, removeRouteStop, resetOptimizedOrder, toggleRouteStop } from '@/lib/territory/route-store';
import type { RouteMode, TerritoryOptimizedRouteResponse, TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';

export function TerritoryClient() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [focusedStoreId, setFocusedStoreId] = useState<string | null>(null);
  const [routeState, setRouteState] = useState(initialTerritoryRouteState);
  const [routeMode, setRouteMode] = useState<RouteMode>('car');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<TerritoryOptimizedRouteResponse | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const storesQuery = useQuery({
    queryKey: ['territory-stores', selectedStatuses.join('|'), selectedReps.join('|'), debouncedSearch, refreshNonce],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (refreshNonce > 0) {
        params.set('refresh', '1');
      }
      if (debouncedSearch) params.set('q', debouncedSearch);
      for (const status of selectedStatuses) params.append('status', status);
      for (const rep of selectedReps) params.append('rep', rep);

      const response = await fetch(`/api/territory/stores?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load territory stores');
      }
      return (await response.json()) as TerritoryStoresResponse;
    },
    staleTime: 30000,
    placeholderData: (previousData) => previousData,
  });

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);

  const storeById = useMemo(() => {
    const map = new Map<string, TerritoryStorePin>();
    for (const store of stores) {
      map.set(store.id, store);
    }
    return map;
  }, [stores]);

  const focusedStore = focusedStoreId ? storeById.get(focusedStoreId) ?? null : null;

  useEffect(() => {
    setRouteState((current) => {
      const selectedStopIds = current.selectedStopIds.filter((id) => storeById.has(id));
      const orderedStopIds = current.orderedStopIds.filter((id) => storeById.has(id));

      if (selectedStopIds.length === current.selectedStopIds.length && orderedStopIds.length === current.orderedStopIds.length) {
        return current;
      }

      return {
        ...current,
        selectedStopIds,
        orderedStopIds,
      };
    });
  }, [storeById]);

  const selectedStops = useMemo(
    () => routeState.selectedStopIds.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store)),
    [routeState.selectedStopIds, storeById],
  );

  const orderedStops = useMemo(() => {
    if (routeState.orderedStopIds.length === 0) {
      return selectedStops;
    }

    const routeMap = new Map(selectedStops.map((stop) => [stop.id, stop]));
    return routeState.orderedStopIds.map((id) => routeMap.get(id)).filter((stop): stop is TerritoryStorePin => Boolean(stop));
  }, [routeState.orderedStopIds, selectedStops]);

  const orderedStopIds = orderedStops.map((stop) => stop.id);
  const routeCoordinates = optimizedRoute?.geometry?.coordinates ?? [];

  const totalDurationSeconds = optimizedRoute?.totalDurationSeconds ?? 0;
  const totalDistanceMeters = optimizedRoute?.totalDistanceMeters ?? 0;

  function toggleListValue(current: string[], value: string) {
    return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  }

  function resetRouteOptimization() {
    setOptimizedRoute(null);
    setRouteState((current) => resetOptimizedOrder(current));
  }

  function handleToggleStop(storeId: string) {
    setRouteState((current) => toggleRouteStop(current, storeId));
    resetRouteOptimization();
  }

  async function handleOptimizeRoute() {
    if (selectedStops.length < 2) {
      toast.error('Select at least 2 stops before optimizing.');
      return;
    }

    setOptimizing(true);
    try {
      const response = await fetch('/api/territory/optimize-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: routeMode,
          stops: selectedStops.map((stop) => ({
            id: stop.id,
            name: stop.name,
            lat: stop.lat,
            lng: stop.lng,
          })),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Route optimization failed');
      }

      const routePayload = payload as TerritoryOptimizedRouteResponse;
      setOptimizedRoute(routePayload);
      setRouteState((current) => applyOptimizedOrder(current, routePayload.orderedStopIds));
      toast.success('Route optimized.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Route optimization failed';
      toast.error(message);
    } finally {
      setOptimizing(false);
    }
  }

  function handleLaunchTransit() {
    if (orderedStops.length < 2) {
      toast.error('Select at least 2 stops to launch transit directions.');
      return;
    }

    const coordinateStrings = orderedStops.map((stop) => `${stop.lat},${stop.lng}`);
    const origin = coordinateStrings[0];
    const destination = coordinateStrings[coordinateStrings.length - 1];
    const waypoints = coordinateStrings.slice(1, -1).join('|');

    const params = new URLSearchParams({
      api: '1',
      travelmode: 'transit',
      origin,
      destination,
    });

    if (waypoints) {
      params.set('waypoints', waypoints);
    }

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  if (storesQuery.isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (storesQuery.isError) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Failed to load live territory data
        </div>
        <p className="text-sm">{storesQuery.error instanceof Error ? storesQuery.error.message : 'Unknown error'}</p>
        <Button size="sm" className="mt-3" onClick={() => storesQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="relative h-[calc(100dvh-9rem)] min-h-[640px] w-full">
        <div className="absolute left-2 right-2 top-2 z-[1000] md:left-4 md:right-4 md:top-4">
          <TerritoryFilterBar
            search={search}
            onSearchChange={setSearch}
            statuses={storesQuery.data?.filters.statuses ?? []}
            reps={storesQuery.data?.filters.reps ?? []}
            selectedStatuses={selectedStatuses}
            selectedReps={selectedReps}
            onToggleStatus={(value) => {
              setSelectedStatuses((current) => toggleListValue(current, value));
              setOptimizedRoute(null);
            }}
            onToggleRep={(value) => {
              setSelectedReps((current) => toggleListValue(current, value));
              setOptimizedRoute(null);
            }}
            onClearFilters={() => {
              setSearch('');
              setSelectedStatuses([]);
              setSelectedReps([]);
              setOptimizedRoute(null);
            }}
          />
        </div>

        <div className="absolute right-3 top-[12.6rem] z-[1000]">
          <Button variant="secondary" size="sm" onClick={() => setRefreshNonce((value) => value + 1)}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <MapCanvas
          stores={stores}
          selectedStopIds={routeState.selectedStopIds}
          orderedStopIds={orderedStopIds}
          routeCoordinates={routeCoordinates}
          focusedStoreId={focusedStoreId}
          onSelectStore={(storeId) => setFocusedStoreId(storeId)}
        />

        {stores.length === 0 ? (
          <div className="absolute left-2 right-2 top-1/2 z-[1000] -translate-y-1/2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-900 md:left-1/2 md:right-auto md:w-[520px] md:-translate-x-1/2">
            No mapped stores available yet. Tap Refresh to force a live Notion sync and geocode missing addresses.
          </div>
        ) : null}

        {focusedStore ? (
          <div className="absolute bottom-80 left-2 right-2 z-[1000] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-950 md:left-4 md:right-auto md:w-[360px]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{focusedStore.name}</p>
                <p className="text-xs text-slate-500">{focusedStore.status}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{focusedStore.locationAddress ?? focusedStore.locationLabel ?? 'No address'}</p>
              </div>
              <Button
                size="sm"
                onClick={() => handleToggleStop(focusedStore.id)}
                variant={routeState.selectedStopIds.includes(focusedStore.id) ? 'secondary' : 'default'}
              >
                {routeState.selectedStopIds.includes(focusedStore.id) ? 'Remove Stop' : 'Add Stop'}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-0 left-0 right-0 z-[1000]">
          <RouteSheet
            selectedStops={selectedStops}
            orderedStops={orderedStops}
            mode={routeMode}
            optimizing={optimizing}
            totalDurationSeconds={totalDurationSeconds}
            totalDistanceMeters={totalDistanceMeters}
            onSetMode={(mode) => {
              setRouteMode(mode);
              resetRouteOptimization();
            }}
            onOptimize={handleOptimizeRoute}
            onLaunchTransit={handleLaunchTransit}
            onRemoveStop={(storeId) => {
              setRouteState((current) => removeRouteStop(current, storeId));
              resetRouteOptimization();
            }}
            onClearStops={() => {
              setRouteState((current) => clearRouteStops(current));
              resetRouteOptimization();
            }}
          />
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700">
        <p>
          Source: live Notion cache ({storesQuery.data?.meta.recordsRead ?? 0} rows read, unresolved locations: {storesQuery.data?.meta.unresolvedLocationCount ?? 0}, synced:{' '}
          {storesQuery.data?.meta.syncedAt ? new Date(storesQuery.data.meta.syncedAt).toLocaleString() : 'n/a'}, last edit:{' '}
          {storesQuery.data?.meta.lastEditedMax ? new Date(storesQuery.data.meta.lastEditedMax).toLocaleString() : 'n/a'})
        </p>
        {storesQuery.data?.meta.syncing ? <p className="text-slate-600">Refreshing live Notion data in background.</p> : null}
        {storesQuery.data?.meta.stale ? <p className="text-amber-600">Showing stale cache while Notion sync recovers.</p> : null}
        {storesQuery.data?.meta.syncError ? <p className="text-amber-600">{storesQuery.data.meta.syncError}</p> : null}
      </div>
    </div>
  );
}
