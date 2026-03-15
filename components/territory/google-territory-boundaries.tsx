/// <reference types="google.maps" />

'use client';

import { useEffect, useMemo } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { TerritoryBoundary, TerritoryBoundaryCoordinates } from '@/lib/territory/types';

export interface TerritoryBoundaryDraft {
  id: string | null;
  name: string;
  color: string;
  borderWidth: number;
  coordinates: TerritoryBoundaryCoordinates;
}

interface GoogleTerritoryBoundariesProps {
  boundaries: TerritoryBoundary[];
  showBoundaries: boolean;
  hiddenBoundaryIds: string[];
  draftBoundary?: TerritoryBoundaryDraft | null;
  drawingMode?: boolean;
  onDraftCoordinatesChange?: (coordinates: TerritoryBoundaryCoordinates) => void;
}

function toLatLngPath(coordinates: TerritoryBoundaryCoordinates) {
  return coordinates.map(([lng, lat]) => ({ lng, lat }));
}

function samePoint(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

function readDraftPath(path: google.maps.MVCArray<google.maps.LatLng>): TerritoryBoundaryCoordinates {
  const next: TerritoryBoundaryCoordinates = [];
  for (let index = 0; index < path.getLength(); index += 1) {
    const point = path.getAt(index);
    next.push([point.lng(), point.lat()]);
  }
  return next;
}

function BoundaryDisplayLayer({
  boundaries,
  hiddenBoundaryIds,
  editingBoundaryId,
}: {
  boundaries: TerritoryBoundary[];
  hiddenBoundaryIds: string[];
  editingBoundaryId?: string | null;
}) {
  const map = useMap();
  const hiddenIds = useMemo(() => new Set(hiddenBoundaryIds), [hiddenBoundaryIds]);

  useEffect(() => {
    if (!map || typeof google === 'undefined') {
      return;
    }

    const polygons = boundaries
      .filter((boundary) => !hiddenIds.has(boundary.id))
      .filter((boundary) => boundary.id !== editingBoundaryId)
      .map((boundary) => {
        const polygon = new google.maps.Polygon({
          paths: toLatLngPath(boundary.coordinates),
          strokeColor: boundary.color,
          strokeOpacity: 0.95,
          strokeWeight: boundary.borderWidth,
          fillColor: boundary.color,
          fillOpacity: 0.18,
          clickable: false,
          zIndex: 1,
          map,
        });
        return polygon;
      });

    return () => {
      for (const polygon of polygons) {
        polygon.setMap(null);
      }
    };
  }, [boundaries, editingBoundaryId, hiddenIds, map]);

  return null;
}

function BoundaryDraftLayer({
  draftBoundary,
  onDraftCoordinatesChange,
}: {
  draftBoundary: TerritoryBoundaryDraft;
  onDraftCoordinatesChange?: (coordinates: TerritoryBoundaryCoordinates) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === 'undefined') {
      return;
    }

    const path = toLatLngPath(draftBoundary.coordinates);
    const polygon =
      path.length >= 3
        ? new google.maps.Polygon({
            paths: path,
            strokeColor: draftBoundary.color,
            strokeOpacity: 1,
            strokeWeight: draftBoundary.borderWidth,
            fillColor: draftBoundary.color,
            fillOpacity: 0.2,
            editable: true,
            zIndex: 3,
            map,
          })
        : null;

    const polyline =
      path.length >= 2
        ? new google.maps.Polyline({
            path,
            strokeColor: draftBoundary.color,
            strokeOpacity: 1,
            strokeWeight: draftBoundary.borderWidth,
            zIndex: 3,
            map,
          })
        : null;

    const pointMarkers = draftBoundary.coordinates.map(([lng, lat], index) =>
      new google.maps.Marker({
        position: { lng, lat },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: index === 0 ? 5.5 : 4.5,
          fillColor: draftBoundary.color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 4,
        map,
      }),
    );

    const listeners: google.maps.MapsEventListener[] = [];
    if (polygon && onDraftCoordinatesChange) {
      const draftPath = polygon.getPath();
      const emit = () => {
        onDraftCoordinatesChange(readDraftPath(draftPath));
      };
      listeners.push(draftPath.addListener('insert_at', emit));
      listeners.push(draftPath.addListener('remove_at', emit));
      listeners.push(draftPath.addListener('set_at', emit));
    }
    if (onDraftCoordinatesChange) {
      pointMarkers.forEach((marker, index) => {
        listeners.push(
          marker.addListener('click', () => {
            const next = draftBoundary.coordinates.filter((_, candidateIndex) => candidateIndex !== index);
            onDraftCoordinatesChange(next);
          }),
        );
      });
    }

    return () => {
      for (const listener of listeners) {
        listener.remove();
      }
      polygon?.setMap(null);
      polyline?.setMap(null);
      pointMarkers.forEach((marker) => marker.setMap(null));
    };
  }, [draftBoundary.borderWidth, draftBoundary.color, draftBoundary.coordinates, map, onDraftCoordinatesChange]);

  return null;
}

function BoundaryDrawingController({
  enabled,
  draftBoundary,
  onDraftCoordinatesChange,
}: {
  enabled: boolean;
  draftBoundary?: TerritoryBoundaryDraft | null;
  onDraftCoordinatesChange?: (coordinates: TerritoryBoundaryCoordinates) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !map || !draftBoundary || !onDraftCoordinatesChange || typeof google === 'undefined') {
      return;
    }

    map.setOptions({
      draggableCursor: 'crosshair',
    });

    const listener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const latLng = event.latLng;
      if (!latLng) {
        return;
      }

      const nextPoint: [number, number] = [latLng.lng(), latLng.lat()];
      const current = draftBoundary.coordinates;
      if (current.length > 0 && samePoint(current[current.length - 1], nextPoint)) {
        return;
      }

      onDraftCoordinatesChange([...current, nextPoint]);
    });

    return () => {
      listener.remove();
      map.setOptions({
        draggableCursor: null,
      });
    };
  }, [draftBoundary, enabled, map, onDraftCoordinatesChange]);

  return null;
}

export function GoogleTerritoryBoundaries({
  boundaries,
  showBoundaries,
  hiddenBoundaryIds,
  draftBoundary = null,
  drawingMode = false,
  onDraftCoordinatesChange,
}: GoogleTerritoryBoundariesProps) {
  if (!showBoundaries && !draftBoundary) {
    return null;
  }

  return (
    <>
      {showBoundaries ? (
        <BoundaryDisplayLayer
          boundaries={boundaries}
          hiddenBoundaryIds={hiddenBoundaryIds}
          editingBoundaryId={draftBoundary?.id ?? null}
        />
      ) : null}
      {draftBoundary ? <BoundaryDraftLayer draftBoundary={draftBoundary} onDraftCoordinatesChange={onDraftCoordinatesChange} /> : null}
      {draftBoundary ? (
        <BoundaryDrawingController
          enabled={drawingMode}
          draftBoundary={draftBoundary}
          onDraftCoordinatesChange={onDraftCoordinatesChange}
        />
      ) : null}
    </>
  );
}
