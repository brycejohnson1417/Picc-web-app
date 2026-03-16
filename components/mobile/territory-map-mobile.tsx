'use client';

import type { PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryBoundary, TerritoryStorePin } from '@/lib/territory/types';
import type { TerritoryBoundaryDraft } from '@/components/territory/google-territory-boundaries';
import { GoogleTerritoryMap } from '@/components/territory/google-territory-map';

interface TerritoryMapMobileProps {
  stores: TerritoryStorePin[];
  boundaries: TerritoryBoundary[];
  showBoundaries: boolean;
  hiddenBoundaryIds: string[];
  draftBoundary?: TerritoryBoundaryDraft | null;
  drawingBoundaryMode?: boolean;
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  highlightedStoreId?: string | null;
  currentLocation?: { lat: number; lng: number } | null;
  locationRequestToken?: number;
  focusRequestToken: number;
  routeCoordinates: [number, number][];
  pinColorMode: PinColorMode;
  onSelectStore: (id: string | null) => void;
  onDraftBoundaryChange?: (coordinates: [number, number][]) => void;
}

export function TerritoryMapMobile({
  stores,
  boundaries,
  showBoundaries,
  hiddenBoundaryIds,
  draftBoundary = null,
  drawingBoundaryMode = false,
  selectedStopIds,
  orderedStopIds,
  focusedStoreId,
  highlightedStoreId = null,
  currentLocation = null,
  locationRequestToken,
  focusRequestToken,
  routeCoordinates,
  pinColorMode,
  onSelectStore,
  onDraftBoundaryChange,
}: TerritoryMapMobileProps) {
  return (
    <GoogleTerritoryMap
      stores={stores}
      boundaries={boundaries}
      showBoundaries={showBoundaries}
      hiddenBoundaryIds={hiddenBoundaryIds}
      draftBoundary={draftBoundary}
      drawingBoundaryMode={drawingBoundaryMode}
      selectedStopIds={selectedStopIds}
      orderedStopIds={orderedStopIds}
      focusedStoreId={focusedStoreId}
      highlightedStoreId={highlightedStoreId}
      currentLocation={currentLocation}
      locationRequestToken={locationRequestToken}
      routeCoordinates={routeCoordinates}
      pinColorMode={pinColorMode}
      cameraMode="manual-focus"
      focusRequestToken={focusRequestToken}
      fitPadding={24}
      maxFitZoom={11}
      defaultZoom={10.2}
      className="rounded-none"
      onSelectStore={onSelectStore}
      onDraftBoundaryChange={onDraftBoundaryChange}
    />
  );
}
