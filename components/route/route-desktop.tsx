'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Plus, Route, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import type { RouteMode, TerritoryOptimizedRouteResponse, TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';

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

export function RouteDesktop() {
  const routePlan = useRoutePlan();
  const [search, setSearch] = useState('');
  const [optMode, setOptMode] = useState<RouteMode>('car');
  const [optimizing, setOptimizing] = useState(false);

  const storesQuery = useQuery({
    queryKey: ['route-desktop-stores'],
    queryFn: async () => {
      const response = await fetch('/api/territory/stores', { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load stores');
      }
      return (await response.json()) as TerritoryStoresResponse;
    },
    staleTime: 30000,
  });

  const stores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);

  const selectedStops = useMemo(
    () => routePlan.selectedStopIds.map((id) => storeById.get(id)).filter((store): store is TerritoryStorePin => Boolean(store)),
    [routePlan.selectedStopIds, storeById],
  );

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

  const visibleStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores.slice(0, 120);
    return stores
      .filter((store) =>
        [store.name, store.status, store.city ?? '', store.state ?? '', store.licenseNumber ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 120);
  }, [search, stores]);

  async function optimizeRoute() {
    if (selectedStops.length < 2) {
      toast.error('Select at least 2 stops to optimize');
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

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Optimization failed');
      }

      routePlan.setOptimizedRoute(payload as TerritoryOptimizedRouteResponse);
      toast.success('Route optimized');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Optimization failed');
    } finally {
      setOptimizing(false);
    }
  }

  function openDirections() {
    if (orderedStops.length < 2) {
      toast.error('Need at least 2 stops to navigate');
      return;
    }

    const coords = orderedStops.map((stop) => `${stop.lat},${stop.lng}`);
    const mode = optMode === 'transit' ? 'transit' : optMode === 'bike' ? 'bicycling' : 'driving';

    const params = new URLSearchParams({
      api: '1',
      travelmode: mode,
      origin: coords[0],
      destination: coords[coords.length - 1],
    });

    const waypoints = coords.slice(1, -1).join('|');
    if (waypoints) params.set('waypoints', waypoints);

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  function saveRoute() {
    if (orderedStops.length === 0) {
      toast.error('Add stops before saving');
      return;
    }

    routePlan.saveCurrentRoute(`Route ${new Date().toLocaleDateString()}`, {
      mode: optMode,
      optimizedRoute: activeOptimized,
    });
    toast.success('Route saved');
  }

  const totalDistance = activeOptimized?.totalDistanceMeters ?? activeOptimized?.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0) ?? 0;
  const totalDuration = activeOptimized?.totalDurationSeconds ?? activeOptimized?.legs.reduce((sum, leg) => sum + leg.durationSeconds, 0) ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card className="min-h-[720px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Route Planner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={optMode === 'car' ? 'default' : 'outline'} onClick={() => setOptMode('car')}>Drive</Button>
            <Button variant={optMode === 'transit' ? 'default' : 'outline'} onClick={() => setOptMode('transit')}>Transit</Button>
            <Button variant={optMode === 'bike' ? 'default' : 'outline'} onClick={() => setOptMode('bike')}>Bike</Button>
            <Button onClick={optimizeRoute} disabled={optimizing || selectedStops.length < 2}>{optimizing ? 'Optimizing...' : 'Optimize'}</Button>
            <Button variant="outline" onClick={openDirections} disabled={orderedStops.length < 2}>
              <ExternalLink className="mr-1 h-4 w-4" /> Launch
            </Button>
            <Button variant="secondary" onClick={saveRoute}>Save</Button>
            <Button variant="danger" onClick={() => routePlan.clearStops()} disabled={routePlan.selectedStopIds.length === 0}>Clear</Button>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Summary</p>
            <p className="text-slate-600">{orderedStops.length} stops · {formatDuration(totalDuration)} · {formatDistance(totalDistance)}</p>
          </div>

          <div className="space-y-2">
            {orderedStops.length === 0 ? <p className="text-sm text-slate-500">No stops selected.</p> : null}
            {orderedStops.map((stop, index) => (
              <div key={stop.id} className="flex items-center justify-between rounded-lg border p-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{index + 1}. {stop.name}</p>
                  <p className="truncate text-xs text-slate-500">{stop.locationAddress ?? stop.locationLabel ?? 'No address'} · {stop.status}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => routePlan.removeStop(stop.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[720px]">
        <CardHeader>
          <CardTitle>Add Stops</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stores" />
          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {storesQuery.isLoading ? <p className="text-sm text-slate-500">Loading stores...</p> : null}
            {storesQuery.isError ? <p className="text-sm text-red-600">{storesQuery.error instanceof Error ? storesQuery.error.message : 'Failed to load stores'}</p> : null}
            {visibleStores.map((store) => {
              const selected = routePlan.selectedStopIds.includes(store.id);
              return (
                <div key={store.id} className="flex items-center justify-between rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{store.name}</p>
                    <p className="truncate text-xs text-slate-500">{store.city && store.state ? `${store.city}, ${store.state}` : store.status}</p>
                  </div>
                  <Button size="sm" variant={selected ? 'secondary' : 'default'} onClick={() => routePlan.toggleStop(store.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {selected ? 'Added' : 'Add'}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
