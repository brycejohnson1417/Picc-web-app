export type VisitEventType = 'visit_start' | 'visit_complete';

export interface TerritoryVisitEvent {
  type: VisitEventType;
  stopId: string;
  createdAt: string;
}

export interface TerritoryRouteState {
  selectedStopIds: string[];
  orderedStopIds: string[];
  visitEvents: TerritoryVisitEvent[];
}

export const initialTerritoryRouteState: TerritoryRouteState = {
  selectedStopIds: [],
  orderedStopIds: [],
  visitEvents: [],
};

export function toggleRouteStop(state: TerritoryRouteState, stopId: string): TerritoryRouteState {
  const exists = state.selectedStopIds.includes(stopId);
  const selectedStopIds = exists ? state.selectedStopIds.filter((id) => id !== stopId) : [...state.selectedStopIds, stopId];

  return {
    ...state,
    selectedStopIds,
    orderedStopIds: exists ? state.orderedStopIds.filter((id) => id !== stopId) : state.orderedStopIds,
  };
}

export function removeRouteStop(state: TerritoryRouteState, stopId: string): TerritoryRouteState {
  return {
    ...state,
    selectedStopIds: state.selectedStopIds.filter((id) => id !== stopId),
    orderedStopIds: state.orderedStopIds.filter((id) => id !== stopId),
  };
}

export function clearRouteStops(state: TerritoryRouteState): TerritoryRouteState {
  return {
    ...state,
    selectedStopIds: [],
    orderedStopIds: [],
  };
}

export function applyOptimizedOrder(state: TerritoryRouteState, orderedStopIds: string[]): TerritoryRouteState {
  return {
    ...state,
    orderedStopIds,
  };
}

export function resetOptimizedOrder(state: TerritoryRouteState): TerritoryRouteState {
  return {
    ...state,
    orderedStopIds: [],
  };
}

export function recordVisitEvent(state: TerritoryRouteState, type: VisitEventType, stopId: string): TerritoryRouteState {
  return {
    ...state,
    visitEvents: [
      ...state.visitEvents,
      {
        type,
        stopId,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
