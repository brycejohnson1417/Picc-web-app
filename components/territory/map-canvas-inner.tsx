'use client';

import type { TerritoryStorePin } from '@/lib/territory/types';
import { MapLibreTerritoryMap } from '@/components/territory/maplibre-territory-map';

interface MapCanvasInnerProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  routeCoordinates: [number, number][];
  focusedStoreId: string | null;
  onSelectStore: (storeId: string | null) => void;
}

export function TerritoryMapCanvasInner({
  stores,
  selectedStopIds,
  orderedStopIds,
  routeCoordinates,
  focusedStoreId,
  onSelectStore,
}: MapCanvasInnerProps) {
  return (
    <MapLibreTerritoryMap
      stores={stores}
      selectedStopIds={selectedStopIds}
      orderedStopIds={orderedStopIds}
      focusedStoreId={focusedStoreId}
      routeCoordinates={routeCoordinates}
      layerMode="pins"
      pinColorMode="status"
      fitPadding={32}
      maxFitZoom={11}
      defaultZoom={6}
      onSelectStore={onSelectStore}
    />
  );
}
