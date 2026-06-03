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
  selectionBoundaryDraft?: TerritoryBoundaryDraft | null;
  selectionDrawingMode?: boolean;
  onSelectionCoordinatesChange?: (coordinates: TerritoryBoundaryCoordinates) => void;
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

function updateCoordinateAtIndex(
  coordinates: TerritoryBoundaryCoordinates,
  index: number,
  nextPoint: [number, number],
): TerritoryBoundaryCoordinates {
  return coordinates.map((point, pointIndex) => (pointIndex === index ? nextPoint : point));
}

function sqDistanceToSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const deltaX = px - x1;
    const deltaY = py - y1;
    return deltaX * deltaX + deltaY * deltaY;
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projectedX = x1 + t * dx;
  const projectedY = y1 + t * dy;
  const deltaX = px - projectedX;
  const deltaY = py - projectedY;
  return deltaX * deltaX + deltaY * deltaY;
}

function insertCoordinateAtNearestSegment(
  coordinates: TerritoryBoundaryCoordinates,
  nextPoint: [number, number],
  isClosed: boolean,
): TerritoryBoundaryCoordinates {
  if (coordinates.length < 2) {
    return [...coordinates, nextPoint];
  }

  const segmentCount = isClosed ? coordinates.length : coordinates.length - 1;
  let bestInsertIndex = coordinates.length;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = coordinates[index];
    const end = coordinates[(index + 1) % coordinates.length];
    const distance = sqDistanceToSegment(nextPoint, start, end);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestInsertIndex = index + 1;
    }
  }

  const next = [...coordinates];
  next.splice(bestInsertIndex, 0, nextPoint);
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
  drawingMode,
  onDraftCoordinatesChange,
}: {
  draftBoundary: TerritoryBoundaryDraft;
  drawingMode: boolean;
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
            draggable: true,
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
            editable: true,
            zIndex: 3,
            map,
          })
        : null;

    const listeners: google.maps.MapsEventListener[] = [];
    const pointMarkers =
      path.length < 3
        ? draftBoundary.coordinates.map(([lng, lat], index) =>
            new google.maps.Marker({
              position: { lng, lat },
              draggable: true,
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
          )
        : [];

    const attachEditablePathListeners = (editablePath: google.maps.MVCArray<google.maps.LatLng>) => {
      if (!onDraftCoordinatesChange) {
        return;
      }
      const emit = () => {
        onDraftCoordinatesChange(readDraftPath(editablePath));
      };
      listeners.push(editablePath.addListener('insert_at', emit));
      listeners.push(editablePath.addListener('remove_at', emit));
      listeners.push(editablePath.addListener('set_at', emit));
    };

    if (polygon) {
      attachEditablePathListeners(polygon.getPath());
      if (onDraftCoordinatesChange) {
        listeners.push(
          polygon.addListener('dragend', () => {
            onDraftCoordinatesChange(readDraftPath(polygon.getPath()));
          }),
        );
        if (!drawingMode) {
          listeners.push(
            polygon.addListener('click', (event: google.maps.PolyMouseEvent) => {
              const latLng = event.latLng;
              if (!latLng) {
                return;
              }
              onDraftCoordinatesChange(
                insertCoordinateAtNearestSegment(readDraftPath(polygon.getPath()), [latLng.lng(), latLng.lat()], true),
              );
            }),
          );
        }
      }
    }

    if (polyline) {
      attachEditablePathListeners(polyline.getPath());
      if (onDraftCoordinatesChange && !drawingMode) {
        listeners.push(
          polyline.addListener('click', (event: google.maps.PolyMouseEvent) => {
            const latLng = event.latLng;
            if (!latLng) {
              return;
            }
            onDraftCoordinatesChange(
              insertCoordinateAtNearestSegment(readDraftPath(polyline.getPath()), [latLng.lng(), latLng.lat()], false),
            );
          }),
        );
      }
    }

    if (onDraftCoordinatesChange && pointMarkers.length > 0) {
      pointMarkers.forEach((marker, index) => {
        listeners.push(
          marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
            const latLng = event.latLng;
            if (!latLng) {
              return;
            }
            onDraftCoordinatesChange(
              updateCoordinateAtIndex(draftBoundary.coordinates, index, [latLng.lng(), latLng.lat()]),
            );
          }),
        );
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
  }, [draftBoundary.borderWidth, draftBoundary.color, draftBoundary.coordinates, drawingMode, map, onDraftCoordinatesChange]);

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
  selectionBoundaryDraft = null,
  selectionDrawingMode = false,
  onSelectionCoordinatesChange,
}: GoogleTerritoryBoundariesProps) {
  if (!showBoundaries && !draftBoundary && !selectionBoundaryDraft) {
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
      {draftBoundary ? (
        <BoundaryDraftLayer
          draftBoundary={draftBoundary}
          drawingMode={drawingMode}
          onDraftCoordinatesChange={onDraftCoordinatesChange}
        />
      ) : null}
      {draftBoundary ? (
        <BoundaryDrawingController
          enabled={drawingMode}
          draftBoundary={draftBoundary}
          onDraftCoordinatesChange={onDraftCoordinatesChange}
        />
      ) : null}
      {selectionBoundaryDraft ? (
        <BoundaryDraftLayer
          draftBoundary={selectionBoundaryDraft}
          drawingMode={selectionDrawingMode}
          onDraftCoordinatesChange={onSelectionCoordinatesChange}
        />
      ) : null}
      {selectionBoundaryDraft ? (
        <BoundaryDrawingController
          enabled={selectionDrawingMode}
          draftBoundary={selectionBoundaryDraft}
          onDraftCoordinatesChange={onSelectionCoordinatesChange}
        />
      ) : null}
    </>
  );
}
