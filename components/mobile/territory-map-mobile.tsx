'use client';

import type { PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { MapLibreTerritoryMap, type TerritoryLayerMode } from '@/components/territory/maplibre-territory-map';

interface TerritoryMapMobileProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  routeCoordinates: [number, number][];
  pinColorMode: PinColorMode;
  layerMode: TerritoryLayerMode;
  onSelectStore: (id: string | null) => void;
}

export function TerritoryMapMobile({
  stores,
  selectedStopIds,
  orderedStopIds,
  focusedStoreId,
  routeCoordinates,
  pinColorMode,
  layerMode,
  onSelectStore,
}: TerritoryMapMobileProps) {
  return (
    <MapLibreTerritoryMap
      stores={stores}
      selectedStopIds={selectedStopIds}
      orderedStopIds={orderedStopIds}
      focusedStoreId={focusedStoreId}
      routeCoordinates={routeCoordinates}
      pinColorMode={pinColorMode}
      layerMode={layerMode}
      fitPadding={24}
      maxFitZoom={11}
      defaultZoom={10.2}
      onSelectStore={onSelectStore}
    />
  );
}
