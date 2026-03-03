'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface SavedRoute {
  id: string;
  name: string;
  stopIds: string[];
  createdAt: string;
}

interface RoutePlanStorage {
  selectedStopIds: string[];
  orderedStopIds: string[];
  savedRoutes: SavedRoute[];
  updatedAt: string;
}

const STORAGE_KEY = 'picc_route_plan_v1';
const EVENT_NAME = 'picc-route-plan-updated';

const INITIAL_STATE: RoutePlanStorage = {
  selectedStopIds: [],
  orderedStopIds: [],
  savedRoutes: [],
  updatedAt: new Date(0).toISOString(),
};

function isValidStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
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
    const savedRoutes = Array.isArray(parsed.savedRoutes)
      ? parsed.savedRoutes.filter((route): route is SavedRoute => {
          if (!route || typeof route !== 'object') return false;
          const candidate = route as SavedRoute;
          return typeof candidate.id === 'string' && typeof candidate.name === 'string' && isValidStringArray(candidate.stopIds) && typeof candidate.createdAt === 'string';
        })
      : [];

    return {
      selectedStopIds,
      orderedStopIds,
      savedRoutes,
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

export function useRoutePlan() {
  const [state, setState] = useState<RoutePlanStorage>(INITIAL_STATE);

  useEffect(() => {
    const refresh = () => setState(readStorage());
    refresh();
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const updateState = useCallback((updater: (prev: RoutePlanStorage) => RoutePlanStorage) => {
    const next = updater(readStorage());
    const normalized: RoutePlanStorage = {
      ...next,
      selectedStopIds: uniqueIds(next.selectedStopIds),
      orderedStopIds: uniqueIds(next.orderedStopIds.filter((id) => next.selectedStopIds.includes(id))),
      savedRoutes: next.savedRoutes,
      updatedAt: new Date().toISOString(),
    };
    writeStorage(normalized);
    setState(normalized);
  }, []);

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
    selectedCount: state.selectedStopIds.length,
    toggleStop: (stopId: string) =>
      updateState((prev) => {
        const exists = prev.selectedStopIds.includes(stopId);
        return {
          ...prev,
          selectedStopIds: exists ? prev.selectedStopIds.filter((id) => id !== stopId) : [...prev.selectedStopIds, stopId],
          orderedStopIds: exists ? prev.orderedStopIds.filter((id) => id !== stopId) : prev.orderedStopIds,
        };
      }),
    removeStop: (stopId: string) =>
      updateState((prev) => ({
        ...prev,
        selectedStopIds: prev.selectedStopIds.filter((id) => id !== stopId),
        orderedStopIds: prev.orderedStopIds.filter((id) => id !== stopId),
      })),
    clearStops: () =>
      updateState((prev) => ({
        ...prev,
        selectedStopIds: [],
        orderedStopIds: [],
      })),
    setOrderedStopIds: (orderedIds: string[]) =>
      updateState((prev) => ({
        ...prev,
        orderedStopIds: orderedIds.filter((id) => prev.selectedStopIds.includes(id)),
      })),
    saveCurrentRoute: (name: string) =>
      updateState((prev) => ({
        ...prev,
        savedRoutes: [
          {
            id: `route_${Date.now()}`,
            name: name.trim() || `Route ${new Date().toLocaleDateString()}`,
            stopIds: prev.orderedStopIds.length > 0 ? prev.orderedStopIds : prev.selectedStopIds,
            createdAt: new Date().toISOString(),
          },
          ...prev.savedRoutes,
        ].slice(0, 100),
      })),
    loadSavedRoute: (routeId: string) =>
      updateState((prev) => {
        const route = prev.savedRoutes.find((item) => item.id === routeId);
        if (!route) return prev;
        return {
          ...prev,
          selectedStopIds: route.stopIds,
          orderedStopIds: route.stopIds,
        };
      }),
    deleteSavedRoute: (routeId: string) =>
      updateState((prev) => ({
        ...prev,
        savedRoutes: prev.savedRoutes.filter((route) => route.id !== routeId),
      })),
  };
}
