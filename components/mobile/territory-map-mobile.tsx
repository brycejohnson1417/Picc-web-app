'use client';

import type { PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { GoogleTerritoryMap } from '@/components/territory/google-territory-map';

interface TerritoryMapMobileProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  focusRequestToken: number;
  routeCoordinates: [number, number][];
  pinColorMode: PinColorMode;
  onSelectStore: (id: string | null) => void;
}

export function TerritoryMapMobile({
  stores,
  selectedStopIds,
  orderedStopIds,
  focusedStoreId,
  focusRequestToken,
  routeCoordinates,
  pinColorMode,
  onSelectStore,
}: TerritoryMapMobileProps) {
  return (
    <GoogleTerritoryMap
      stores={stores}
      selectedStopIds={selectedStopIds}
      orderedStopIds={orderedStopIds}
      focusedStoreId={focusedStoreId}
      routeCoordinates={routeCoordinates}
      pinColorMode={pinColorMode}
      cameraMode="manual-focus"
      focusRequestToken={focusRequestToken}
      fitPadding={24}
      maxFitZoom={11}
      defaultZoom={10.2}
      className="rounded-none"
      onSelectStore={onSelectStore}
    />
  );
}
