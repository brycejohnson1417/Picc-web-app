'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedMarker, APIProvider, Map as GoogleMap, Marker, Pin, useMap } from '@vis.gl/react-google-maps';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { GoogleTerritoryBoundaries, type TerritoryBoundaryDraft } from '@/components/territory/google-territory-boundaries';
import { GoogleTerritoryMarkers, GoogleTerritoryMarkersFallback } from '@/components/territory/google-territory-markers';
import { pinColorForStore, pinGlyphColorForStore, pinGlyphForStore, type PinColorMode } from '@/lib/territory/pin-colors';
import type { GoogleMyMapsViewportBounds } from '@/lib/territory/google-my-maps-export';
import type { TerritoryBoundary, TerritoryMarker, TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

export type MapCameraMode = 'follow-selection' | 'manual-focus';

interface GoogleTerritoryMapProps {
  stores: TerritoryStorePin[];
  repColorMap?: Map<string, string>;
  boundaries?: TerritoryBoundary[];
  markers?: TerritoryMarker[];
  showBoundaries?: boolean;
  hiddenBoundaryIds?: string[];
  showMarkers?: boolean;
  hiddenMarkerIds?: string[];
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
  routeCoordinates: [number, number][];
  pinColorMode?: PinColorMode;
  onSelectStore: (storeId: string | null) => void;
  onDraftBoundaryChange?: (coordinates: [number, number][]) => void;
  onSelectionBoundaryChange?: (coordinates: [number, number][]) => void;
  onViewportBoundsChange?: (bounds: GoogleMyMapsViewportBounds | null) => void;
  className?: string;
  fitPadding?: number;
  maxFitZoom?: number;
  defaultZoom?: number;
  cameraMode?: MapCameraMode;
  focusRequestToken?: number;
}

type RuntimeMapConfigResponse = {
  apiKey: string | null;
  mapId: string | null;
  configured: boolean;
  error?: string;
};

const FALLBACK_CENTER = { lat: 39.8283, lng: -98.5795 };
let runtimeMapConfigCache: RuntimeMapConfigResponse | null = null;
const MAP_CONFIG_STORAGE_KEY = 'picc:territory-map-config';

type RoutePoint = { lat: number; lng: number };

type GooglePolyline = {
  setPath: (path: RoutePoint[]) => void;
  setMap: (map: null) => void;
};

type GoogleMapsApi = {
  Polyline: new (options: {
    map: unknown;
    geodesic: boolean;
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
  }) => GooglePolyline;
  LatLngBounds: typeof google.maps.LatLngBounds;
};

type WindowWithGoogleAuthFailure = Window & {
  gm_authFailure?: () => void;
};

function getGoogleMapsApi() {
  if (typeof window === 'undefined') {
    return null;
  }
  const windowWithGoogle = window as Window & {
    google?: {
      maps?: GoogleMapsApi;
    };
  };
  return windowWithGoogle.google?.maps ?? null;
}

function hideMidRightGoogleControls(mapRoot: HTMLDivElement | null) {
  if (!mapRoot) {
    return;
  }

  const mapRect = mapRoot.getBoundingClientRect();
  if (mapRect.width === 0 || mapRect.height === 0) {
    return;
  }

  const controls = Array.from(mapRoot.querySelectorAll<HTMLElement>('button, [role="button"]'));
  for (const control of controls) {
    const rect = control.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) {
      continue;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const withinRightEdge = centerX >= mapRect.right - 120;
    const withinMiddleBand = centerY >= mapRect.top + mapRect.height * 0.18 && centerY <= mapRect.top + mapRect.height * 0.72;

    if (!withinRightEdge || !withinMiddleBand) {
      continue;
    }

    const wrapper = control.closest<HTMLElement>('.gmnoprint, [style*="position: absolute"], [style*="z-index"]');
    const target = wrapper ?? control;
    target.style.display = 'none';
    target.setAttribute('data-picc-hidden-map-control', 'true');
  }
}

function isFiniteLatLng(lat: unknown, lng: unknown) {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function RouteLine({ routeCoordinates }: { routeCoordinates: [number, number][] }) {
  const map = useMap();
  const polylineRef = useRef<GooglePolyline | null>(null);

  useEffect(() => {
    const mapsApi = getGoogleMapsApi();
    if (!map || !mapsApi) {
      return;
    }

    if (!polylineRef.current) {
      polylineRef.current = new mapsApi.Polyline({
        map,
        geodesic: true,
        strokeColor: '#20a8ff',
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
    }

    const points = routeCoordinates
      .filter((coord): coord is [number, number] => Array.isArray(coord) && coord.length === 2 && isFiniteLatLng(coord[1], coord[0]))
      .map((coord) => ({ lat: coord[1], lng: coord[0] }));

    polylineRef.current.setPath(points);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, routeCoordinates]);

  return null;
}

function FitController({
  stores,
  focusedStoreId,
  fitPadding,
  maxFitZoom,
  defaultZoom,
  cameraMode,
  focusRequestToken,
}: {
  stores: TerritoryStorePin[];
  focusedStoreId: string | null;
  fitPadding: number;
  maxFitZoom: number;
  defaultZoom: number;
  cameraMode: MapCameraMode;
  focusRequestToken?: number;
}) {
  const map = useMap();
  const hasInitializedRef = useRef(false);
  const lastFocusRequestRef = useRef<number | null>(null);

  useEffect(() => {
    const mapsApi = getGoogleMapsApi();
    if (!map || !mapsApi) {
      return;
    }

    if (cameraMode === 'follow-selection') {
      if (stores.length === 0) {
        map.setCenter(FALLBACK_CENTER);
        map.setZoom(Math.max(3, Math.min(defaultZoom, 5)));
        return;
      }

      const focused = focusedStoreId ? stores.find((store) => store.id === focusedStoreId) : null;
      if (focused) {
        map.panTo({ lat: focused.lat, lng: focused.lng });
        map.setZoom(Math.max(map.getZoom() ?? 10, 13));
        return;
      }

      const bounds = new mapsApi.LatLngBounds();
      for (const store of stores) {
        bounds.extend({ lat: store.lat, lng: store.lng });
      }

      map.fitBounds(bounds, fitPadding);
      const zoom = map.getZoom();
      if (typeof zoom === 'number' && zoom > maxFitZoom) {
        map.setZoom(maxFitZoom);
      }
      return;
    }

    if (stores.length === 0) {
      return;
    }
    if (hasInitializedRef.current) {
      return;
    }

    const bounds = new mapsApi.LatLngBounds();
    for (const store of stores) {
      bounds.extend({ lat: store.lat, lng: store.lng });
    }

    map.fitBounds(bounds, fitPadding);
    const zoom = map.getZoom();
    if (typeof zoom === 'number' && zoom > maxFitZoom) {
      map.setZoom(maxFitZoom);
    }
    hasInitializedRef.current = true;
  }, [cameraMode, defaultZoom, fitPadding, focusedStoreId, map, maxFitZoom, stores]);

  useEffect(() => {
    if (cameraMode !== 'manual-focus') {
      return;
    }

    if (typeof focusRequestToken !== 'number' || !Number.isFinite(focusRequestToken)) {
      return;
    }

    if (lastFocusRequestRef.current === focusRequestToken) {
      return;
    }
    lastFocusRequestRef.current = focusRequestToken;

    const focused = focusedStoreId ? stores.find((store) => store.id === focusedStoreId) : null;
    if (!map || !focused) {
      return;
    }

    map.panTo({ lat: focused.lat, lng: focused.lng });
    map.setZoom(Math.max(map.getZoom() ?? defaultZoom, 13));
  }, [cameraMode, defaultZoom, focusRequestToken, focusedStoreId, map, stores]);

  return null;
}

function CurrentLocationController({
  currentLocation,
  locationRequestToken,
}: {
  currentLocation?: { lat: number; lng: number } | null;
  locationRequestToken?: number;
}) {
  const map = useMap();
  const lastRequestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !currentLocation) {
      return;
    }

    if (typeof locationRequestToken !== 'number' || !Number.isFinite(locationRequestToken)) {
      return;
    }

    if (lastRequestRef.current === locationRequestToken) {
      return;
    }

    lastRequestRef.current = locationRequestToken;
    map.panTo(currentLocation);
    map.setZoom(Math.max(map.getZoom() ?? 12, 14));
  }, [currentLocation, locationRequestToken, map]);

  return null;
}

function ViewportBoundsController({
  onViewportBoundsChange,
}: {
  onViewportBoundsChange?: (bounds: GoogleMyMapsViewportBounds | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !onViewportBoundsChange || typeof google === 'undefined') {
      return;
    }

    const emitBounds = () => {
      const bounds = map.getBounds();
      const northEast = bounds?.getNorthEast();
      const southWest = bounds?.getSouthWest();
      if (!northEast || !southWest) {
        onViewportBoundsChange(null);
        return;
      }

      onViewportBoundsChange({
        north: northEast.lat(),
        east: northEast.lng(),
        south: southWest.lat(),
        west: southWest.lng(),
      });
    };

    emitBounds();
    const listeners = [map.addListener('idle', emitBounds), map.addListener('bounds_changed', emitBounds)];
    return () => {
      for (const listener of listeners) {
        listener.remove();
      }
    };
  }, [map, onViewportBoundsChange]);

  return null;
}

function markerScale({
  focused,
  highlighted,
  selected,
  approximate,
}: {
  focused: boolean;
  highlighted: boolean;
  selected: boolean;
  approximate: boolean;
}) {
  if (focused) return 1.35;
  if (highlighted) return 1.26;
  if (selected) return 1.18;
  if (approximate) return 1.08;
  return 1;
}

const fallbackMarkerIconCache = new Map<string, string>();

function fallbackMarkerIcon(fillColor: string, approximate: boolean, preferredPartner: boolean, glyph: string, glyphColor: string, scale = 1) {
  const key = `${fillColor}|${approximate ? 'approx' : 'exact'}|${preferredPartner ? 'preferred' : 'standard'}|${glyph}|${glyphColor}|${scale}`;
  const existing = fallbackMarkerIconCache.get(key);
  if (existing) {
    return existing;
  }

  const width = Math.round(30 * scale);
  const height = Math.round(38 * scale);
  const stroke = preferredPartner ? '#111111' : approximate ? '#111827' : '#ffffff';
  const markerGlyph = glyph
    ? `<text x="15" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="${glyph.length > 2 ? '7.2' : '8.8'}" font-weight="800" fill="${glyphColor}">${glyph}</text>`
    : approximate
      ? `<circle cx="15" cy="13" r="4" fill="white" fill-opacity="0.65"/>`
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 30 38">
    <path d="M15 1C8.37258 1 3 6.37258 3 13C3 22 15 37 15 37C15 37 27 22 27 13C27 6.37258 21.6274 1 15 1Z" fill="${fillColor}" stroke="${stroke}" stroke-width="${preferredPartner ? '2.6' : '2'}"/>
    ${markerGlyph}
  </svg>`;
  const encoded = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  fallbackMarkerIconCache.set(key, encoded);
  return encoded;
}

export function GoogleTerritoryMap({
  stores,
  repColorMap,
  boundaries = [],
  markers = [],
  showBoundaries = true,
  hiddenBoundaryIds = [],
  showMarkers = true,
  hiddenMarkerIds = [],
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
  routeCoordinates,
  pinColorMode = 'status',
  onSelectStore,
  onDraftBoundaryChange,
  onSelectionBoundaryChange,
  onViewportBoundsChange,
  className,
  fitPadding = 36,
  maxFitZoom = 12,
  defaultZoom = 10,
  cameraMode = 'follow-selection',
  focusRequestToken,
}: GoogleTerritoryMapProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const buildTimeApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
  const buildTimeMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || '';
  const [runtimeApiKey, setRuntimeApiKey] = useState('');
  const [runtimeMapId, setRuntimeMapId] = useState('');
  const [configLoading, setConfigLoading] = useState(buildTimeApiKey.length === 0);
  const [configError, setConfigError] = useState('');
  const [mapLoadError, setMapLoadError] = useState('');

  const safeStores = useMemo(
    () => stores.filter((store) => store.locationPrecision !== 'unavailable' && isFiniteLatLng(store.lat, store.lng)),
    [stores],
  );

  const selectedSet = useMemo(() => new Set(selectedStopIds), [selectedStopIds]);
  void orderedStopIds;

  useEffect(() => {
    if (buildTimeApiKey) {
      setConfigLoading(false);
      return;
    }

    if (runtimeMapConfigCache?.apiKey) {
      setRuntimeApiKey((runtimeMapConfigCache.apiKey ?? '').trim());
      setRuntimeMapId((runtimeMapConfigCache.mapId ?? '').trim());
      setConfigLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        const cached = window.sessionStorage.getItem(MAP_CONFIG_STORAGE_KEY);
        if (cached) {
          const payload = JSON.parse(cached) as RuntimeMapConfigResponse;
          runtimeMapConfigCache = payload;
          setRuntimeApiKey((payload.apiKey ?? '').trim());
          setRuntimeMapId((payload.mapId ?? '').trim());
          setConfigLoading(false);
          return;
        }
      } catch {
        // Ignore session storage cache failures.
      }
    }

    let cancelled = false;

    async function loadRuntimeMapConfig() {
      setConfigLoading(true);
      setConfigError('');
      try {
        const response = await fetch('/api/territory/map-config');
        const payload = (await response.json().catch(() => ({}))) as RuntimeMapConfigResponse;
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to read Google Maps config');
        }

        if (!cancelled) {
          runtimeMapConfigCache = payload;
          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.setItem(MAP_CONFIG_STORAGE_KEY, JSON.stringify(payload));
            } catch {
              // Ignore session storage cache failures.
            }
          }
          setRuntimeApiKey((payload.apiKey ?? '').trim());
          setRuntimeMapId((payload.mapId ?? '').trim());
        }
      } catch (error) {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : 'Failed to read map config');
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    }

    void loadRuntimeMapConfig();
    return () => {
      cancelled = true;
    };
  }, [buildTimeApiKey]);

  const apiKey = buildTimeApiKey || runtimeApiKey;
  const mapId = buildTimeMapId || runtimeMapId || undefined;
  const useAdvancedMarkers = Boolean(mapId);

  useEffect(() => {
    setMapLoadError('');
  }, [apiKey, mapId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const windowWithAuthFailure = window as WindowWithGoogleAuthFailure;
    const previousAuthFailure = windowWithAuthFailure.gm_authFailure;
    windowWithAuthFailure.gm_authFailure = () => {
      setMapLoadError('Google Maps auth failed for this domain. Confirm API key restrictions allow this host.');
      previousAuthFailure?.();
    };

    return () => {
      windowWithAuthFailure.gm_authFailure = previousAuthFailure;
    };
  }, []);

  useEffect(() => {
    const root = mapRootRef.current;
    if (!root || typeof window === 'undefined') {
      return;
    }

    const run = () => hideMidRightGoogleControls(root);
    const frame = window.requestAnimationFrame(run);
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true, attributes: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [safeStores.length, focusedStoreId, routeCoordinates.length, runtimeMapId]);

  if (!apiKey && configLoading) {
    return (
      <div
        className={cn(
          'picc-shell-enter grid h-full w-full place-items-center rounded-xl border border-slate-300 bg-slate-100 text-sm text-slate-700',
          className,
        )}
      >
        <div className="rounded-lg bg-white/90 px-3 py-2 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" />
          <p className="mt-2">Loading Google Maps configuration...</p>
        </div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div
        className={cn(
          'picc-shell-enter grid h-full w-full place-items-center rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900',
          className,
        )}
      >
        <div className="mx-4 rounded-xl border border-amber-300 bg-white/85 p-4 text-left">
          Google Maps API key is not configured. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
          {configError ? <span className="mt-2 block text-xs text-amber-800">{configError}</span> : null}
        </div>
      </div>
    );
  }

  if (mapLoadError) {
    return (
      <div
        className={cn(
          'picc-shell-enter grid h-full w-full place-items-center rounded-xl border border-red-300 bg-red-50 text-sm text-red-900',
          className,
        )}
      >
        <div className="mx-4 rounded-xl border border-red-300 bg-white/85 p-4">
          <div className="mb-1 inline-flex items-center gap-1.5 font-medium text-red-900">
            <AlertTriangle className="h-4 w-4" />
            Google Maps failed to load.
          </div>
          <p className="mt-1 text-xs text-red-800">{mapLoadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={mapRootRef} className={cn('h-full w-full overflow-hidden rounded-xl', className)}>
      <APIProvider
        apiKey={apiKey}
        libraries={useAdvancedMarkers ? ['marker'] : undefined}
        authReferrerPolicy="origin"
        onError={(error) => {
          const message = error instanceof Error ? error.message : String(error ?? 'Google Maps failed to load');
          setMapLoadError(message);
        }}
      >
        <GoogleMap
          mapId={mapId}
          defaultCenter={FALLBACK_CENTER}
          defaultZoom={defaultZoom}
          gestureHandling="greedy"
          disableDefaultUI
          fullscreenControl={false}
          mapTypeControl={false}
          streetViewControl={false}
          cameraControl={false}
          rotateControl={false}
          clickableIcons={false}
          className="h-full w-full"
          onClick={() => {
            if (!drawingBoundaryMode) {
              onSelectStore(null);
            }
          }}
        >
          <FitController
            stores={safeStores}
            focusedStoreId={focusedStoreId}
            fitPadding={fitPadding}
            maxFitZoom={maxFitZoom}
            defaultZoom={defaultZoom}
            cameraMode={cameraMode}
            focusRequestToken={focusRequestToken}
          />
          <CurrentLocationController currentLocation={currentLocation} locationRequestToken={locationRequestToken} />
          <ViewportBoundsController onViewportBoundsChange={onViewportBoundsChange} />
          <RouteLine routeCoordinates={routeCoordinates} />
          <GoogleTerritoryBoundaries
            boundaries={boundaries}
            showBoundaries={showBoundaries}
            hiddenBoundaryIds={hiddenBoundaryIds}
            draftBoundary={draftBoundary}
            drawingMode={drawingBoundaryMode}
            onDraftCoordinatesChange={onDraftBoundaryChange}
            selectionBoundaryDraft={selectionBoundaryDraft}
            selectionDrawingMode={selectionDrawingMode}
            onSelectionCoordinatesChange={onSelectionBoundaryChange}
          />
          {useAdvancedMarkers ? (
            <GoogleTerritoryMarkers
              markers={markers}
              hiddenMarkerIds={hiddenMarkerIds}
              showMarkers={showMarkers}
            />
          ) : (
            <GoogleTerritoryMarkersFallback
              markers={markers}
              hiddenMarkerIds={hiddenMarkerIds}
              showMarkers={showMarkers}
            />
          )}

          {safeStores.map((store) => {
            const focused = focusedStoreId === store.id;
            const highlighted = highlightedStoreId === store.id;
            const selected = selectedSet.has(store.id);
            const approximate = Boolean(store.isApproximate);
            const preferredPartner = Boolean(store.isPreferredPartner);
            const glyph = pinGlyphForStore(store, pinColorMode);
            const glyphColor = pinGlyphColorForStore(store, pinColorMode);
            const scale = markerScale({ focused, highlighted, selected, approximate });
            const borderColor = preferredPartner ? '#111111' : approximate ? '#111827' : '#ffffff';
            const background = pinColorForStore(store, pinColorMode, repColorMap);

            if (useAdvancedMarkers) {
              return (
                <AdvancedMarker
                  key={store.id}
                  position={{ lat: store.lat, lng: store.lng }}
                  onClick={() => onSelectStore(store.id)}
                    title={store.name}
                >
                  <Pin
                    background={background}
                    borderColor={borderColor}
                    glyphColor={glyphColor}
                    scale={scale}
                    glyph={glyph}
                  />
                </AdvancedMarker>
              );
            }

            return (
              <Marker
                key={store.id}
                position={{ lat: store.lat, lng: store.lng }}
                onClick={() => onSelectStore(store.id)}
                title={store.name}
                opacity={approximate ? 0.78 : 1}
                icon={{
                  url: fallbackMarkerIcon(background, approximate, preferredPartner, glyph, glyphColor, scale),
                }}
              />
            );
          })}
          {currentLocation ? (
            useAdvancedMarkers ? (
              <AdvancedMarker position={currentLocation} title="Your current location">
                <Pin background="#2563eb" borderColor="#ffffff" glyphColor="#ffffff" scale={0.92} />
              </AdvancedMarker>
            ) : (
              <Marker position={currentLocation} title="Your current location" />
            )
          ) : null}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
