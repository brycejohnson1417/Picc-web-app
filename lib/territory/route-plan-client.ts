'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteMode, TerritoryOptimizedRouteResponse } from '@/lib/territory/types';

export interface SavedRoute {
  id: string;
  name: string;
  stopIds: string[];
  createdAt: string;
  updatedAt?: string;
  mode?: RouteMode;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  optimizedRoute?: TerritoryOptimizedRouteResponse | null;
}

interface RoutePlanStorage {
  selectedStopIds: string[];
  orderedStopIds: string[];
  savedRoutes: SavedRoute[];
  optimizedRoute: TerritoryOptimizedRouteResponse | null;
  updatedAt: string;
}

const STORAGE_KEY = 'picc_route_plan_v1';
const EVENT_NAME = 'picc-route-plan-updated';

const INITIAL_STATE: RoutePlanStorage = {
  selectedStopIds: [],
  orderedStopIds: [],
  savedRoutes: [],
  optimizedRoute: null,
  updatedAt: new Date(0).toISOString(),
};

function isValidStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isValidRouteMode(value: unknown): value is RouteMode {
  return value === 'car' || value === 'bike' || value === 'transit';
}

function isValidGeometry(value: unknown): value is NonNullable<TerritoryOptimizedRouteResponse['geometry']> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  return (
    candidate.type === 'LineString' &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.every(
      (point) => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    )
  );
}

function isValidOptimizedRoute(value: unknown): value is TerritoryOptimizedRouteResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as TerritoryOptimizedRouteResponse;
  if (!isValidRouteMode(candidate.mode)) return false;
  if (!isValidStringArray(candidate.orderedStopIds)) return false;
  if (!Array.isArray(candidate.legs)) return false;
  if (!Number.isFinite(candidate.totalDistanceMeters) || !Number.isFinite(candidate.totalDurationSeconds)) return false;
  if (candidate.geometry !== null && !isValidGeometry(candidate.geometry)) return false;
  return true;
}

function readStorage(): RoutePlanStorage {
  if (typeof window === 'undefined') {
    return INITIAL_STATE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return INITIAL_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<RoutePlanStorage>;
    const selectedStopIds = isValidStringArray(parsed.selectedStopIds) ? parsed.selectedStopIds : [];
    const orderedStopIds = isValidStringArray(parsed.orderedStopIds) ? parsed.orderedStopIds : [];
    const optimizedRoute = isValidOptimizedRoute(parsed.optimizedRoute) ? parsed.optimizedRoute : null;
    const savedRoutes = Array.isArray(parsed.savedRoutes)
      ? parsed.savedRoutes.filter((route): route is SavedRoute => {
          if (!route || typeof route !== 'object') return false;
          const candidate = route as SavedRoute;
          const modeIsValid = candidate.mode === undefined || isValidRouteMode(candidate.mode);
          const optimizedRouteIsValid = candidate.optimizedRoute === undefined || candidate.optimizedRoute === null || isValidOptimizedRoute(candidate.optimizedRoute);
          return (
            typeof candidate.id === 'string' &&
            typeof candidate.name === 'string' &&
            isValidStringArray(candidate.stopIds) &&
            typeof candidate.createdAt === 'string' &&
            modeIsValid &&
            optimizedRouteIsValid
          );
        })
      : [];

    return {
      selectedStopIds,
      orderedStopIds,
      savedRoutes,
      optimizedRoute,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return INITIAL_STATE;
  }
}

function writeStorage(state: RoutePlanStorage) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function uniqueIds(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function routeFingerprint(route: SavedRoute) {
  return `${route.name.trim().toLowerCase()}|${route.mode ?? ''}|${route.stopIds.join('|')}`;
}

function mergeSavedRoutes(remoteRoutes: SavedRoute[], cachedRoutes: SavedRoute[]) {
  const remoteFingerprints = new Set(remoteRoutes.map(routeFingerprint));
  const localOnlyRoutes = cachedRoutes.filter((route) => route.id.startsWith('route_') && !remoteFingerprints.has(routeFingerprint(route)));
  return [...remoteRoutes, ...localOnlyRoutes].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function useRoutePlan() {
  const [state, setState] = useState<RoutePlanStorage>(INITIAL_STATE);
  const [savedRoutesLoading, setSavedRoutesLoading] = useState(true);
  const [savedRoutesError, setSavedRoutesError] = useState<string | null>(null);

  const updateState = useCallback((updater: (prev: RoutePlanStorage) => RoutePlanStorage) => {
    const next = updater(readStorage());
    const normalized: RoutePlanStorage = {
      ...next,
      selectedStopIds: uniqueIds(next.selectedStopIds),
      orderedStopIds: uniqueIds(next.orderedStopIds.filter((id) => next.selectedStopIds.includes(id))),
      savedRoutes: next.savedRoutes,
      optimizedRoute:
        next.optimizedRoute && next.optimizedRoute.orderedStopIds.every((id) => next.selectedStopIds.includes(id))
          ? next.optimizedRoute
          : null,
      updatedAt: new Date().toISOString(),
    };
    writeStorage(normalized);
    setState(normalized);
  }, []);

  const refreshSavedRoutes = useCallback(async () => {
    setSavedRoutesLoading(true);
    setSavedRoutesError(null);

    try {
      const response = await fetch('/api/territory/saved-routes', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; routes?: SavedRoute[] };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load saved routes');
      }

      const remoteRoutes = Array.isArray(payload.routes) ? payload.routes : [];
      updateState((prev) => ({
        ...prev,
        savedRoutes: mergeSavedRoutes(remoteRoutes, prev.savedRoutes),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load saved routes';
      setSavedRoutesError(message);
    } finally {
      setSavedRoutesLoading(false);
    }
  }, [updateState]);

  useEffect(() => {
    const refresh = () => setState(readStorage());
    refresh();
    void refreshSavedRoutes();
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refreshSavedRoutes]);

  const orderedStopIds = useMemo(() => {
    if (state.orderedStopIds.length > 0) {
      return state.orderedStopIds;
    }
    return state.selectedStopIds;
  }, [state.orderedStopIds, state.selectedStopIds]);

  return {
    selectedStopIds: state.selectedStopIds,
    orderedStopIds,
    savedRoutes: state.savedRoutes,
    optimizedRoute: state.optimizedRoute,
    savedRoutesLoading,
    savedRoutesError,
    selectedCount: state.selectedStopIds.length,
    toggleStop: (stopId: string) =>
      updateState((prev) => {
        const exists = prev.selectedStopIds.includes(stopId);
        return {
          ...prev,
          selectedStopIds: exists ? prev.selectedStopIds.filter((id) => id !== stopId) : [...prev.selectedStopIds, stopId],
          orderedStopIds: exists ? prev.orderedStopIds.filter((id) => id !== stopId) : prev.orderedStopIds,
          optimizedRoute: null,
        };
      }),
    removeStop: (stopId: string) =>
      updateState((prev) => ({
        ...prev,
        selectedStopIds: prev.selectedStopIds.filter((id) => id !== stopId),
        orderedStopIds: prev.orderedStopIds.filter((id) => id !== stopId),
        optimizedRoute: null,
      })),
    clearStops: () =>
      updateState((prev) => ({
        ...prev,
        selectedStopIds: [],
        orderedStopIds: [],
        optimizedRoute: null,
      })),
    setOrderedStopIds: (orderedIds: string[]) =>
      updateState((prev) => ({
        ...prev,
        orderedStopIds: orderedIds.filter((id) => prev.selectedStopIds.includes(id)),
        optimizedRoute: null,
      })),
    setOptimizedRoute: (optimizedRoute: TerritoryOptimizedRouteResponse | null) =>
      updateState((prev) => ({
        ...prev,
        orderedStopIds: optimizedRoute ? optimizedRoute.orderedStopIds.filter((id) => prev.selectedStopIds.includes(id)) : prev.orderedStopIds,
        optimizedRoute:
          optimizedRoute && optimizedRoute.orderedStopIds.every((id) => prev.selectedStopIds.includes(id))
            ? optimizedRoute
            : null,
      })),
    clearOptimizedRoute: () =>
      updateState((prev) => ({
        ...prev,
        optimizedRoute: null,
      })),
    refreshSavedRoutes,
    saveCurrentRoute: async (
      name: string,
      options?: {
        mode?: RouteMode;
        optimizedRoute?: TerritoryOptimizedRouteResponse | null;
      },
    ) => {
      const current = readStorage();
      const stopIds = (current.orderedStopIds.length > 0 ? current.orderedStopIds : current.selectedStopIds).filter(Boolean);
      if (stopIds.length === 0) {
        throw new Error('Add at least 1 location before saving.');
      }

      const response = await fetch('/api/territory/saved-routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || `Route ${new Date().toLocaleDateString()}`,
          mode: options?.mode ?? current.optimizedRoute?.mode ?? 'car',
          stopIds,
          totalDistanceMeters: options?.optimizedRoute?.totalDistanceMeters ?? current.optimizedRoute?.totalDistanceMeters ?? 0,
          totalDurationSeconds: options?.optimizedRoute?.totalDurationSeconds ?? current.optimizedRoute?.totalDurationSeconds ?? 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; route?: SavedRoute };

      if (!response.ok || !payload.route) {
        throw new Error(payload.error ?? 'Failed to save route');
      }

      const savedRoute: SavedRoute = {
        ...payload.route,
        optimizedRoute: options?.optimizedRoute ?? current.optimizedRoute,
      };

      updateState((prev) => ({
        ...prev,
        savedRoutes: [savedRoute, ...prev.savedRoutes.filter((route) => route.id !== savedRoute.id)].slice(0, 100),
      }));

      return savedRoute;
    },
    loadSavedRoute: (routeId: string) =>
      updateState((prev) => {
        const route = prev.savedRoutes.find((item) => item.id === routeId);
        if (!route) return prev;
        return {
          ...prev,
          selectedStopIds: route.stopIds,
          orderedStopIds: route.stopIds,
          optimizedRoute: route.optimizedRoute ?? null,
        };
      }),
    deleteSavedRoute: async (routeId: string) => {
      if (routeId.startsWith('route_')) {
        updateState((prev) => ({
          ...prev,
          savedRoutes: prev.savedRoutes.filter((route) => route.id !== routeId),
        }));
        return;
      }

      const response = await fetch(`/api/territory/saved-routes/${encodeURIComponent(routeId)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to delete saved route');
      }

      updateState((prev) => ({
        ...prev,
        savedRoutes: prev.savedRoutes.filter((route) => route.id !== routeId),
      }));
    },
  };
}
