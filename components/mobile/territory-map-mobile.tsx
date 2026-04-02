'use client';

import type { PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryBoundary, TerritoryMarker, TerritoryStorePin } from '@/lib/territory/types';
import type { TerritoryBoundaryDraft } from '@/components/territory/google-territory-boundaries';
import { GoogleTerritoryMap } from '@/components/territory/google-territory-map';

interface TerritoryMapMobileProps {
  stores: TerritoryStorePin[];
  repColorMap?: Map<string, string>;
  boundaries: TerritoryBoundary[];
  markers: TerritoryMarker[];
  showBoundaries: boolean;
  hiddenBoundaryIds: string[];
  showMarkers: boolean;
  hiddenMarkerIds: string[];
  draftBoundary?: TerritoryBoundaryDraft | null;
  drawingBoundaryMode?: boolean;
  selectionBoundaryDraft?: TerritoryBoundaryDraft | null;
  selectionDrawingMode?: boolean;
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
  onSelectionBoundaryChange?: (coordinates: [number, number][]) => void;
}

export function TerritoryMapMobile({
  stores,
  repColorMap,
  boundaries,
  markers,
  showBoundaries,
  hiddenBoundaryIds,
  showMarkers,
  hiddenMarkerIds,
  draftBoundary = null,
  drawingBoundaryMode = false,
  selectionBoundaryDraft = null,
  selectionDrawingMode = false,
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
  onSelectionBoundaryChange,
}: TerritoryMapMobileProps) {
  return (
    <GoogleTerritoryMap
      stores={stores}
      repColorMap={repColorMap}
      boundaries={boundaries}
      markers={markers}
      showBoundaries={showBoundaries}
      hiddenBoundaryIds={hiddenBoundaryIds}
      showMarkers={showMarkers}
      hiddenMarkerIds={hiddenMarkerIds}
      draftBoundary={draftBoundary}
      drawingBoundaryMode={drawingBoundaryMode}
      selectionBoundaryDraft={selectionBoundaryDraft}
      selectionDrawingMode={selectionDrawingMode}
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
      onSelectionBoundaryChange={onSelectionBoundaryChange}
    />
  );
}
