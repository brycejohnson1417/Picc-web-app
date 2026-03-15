'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedMarker, APIProvider, Map as GoogleMap, Marker, Pin, useMap } from '@vis.gl/react-google-maps';
import { GoogleTerritoryBoundaries, type TerritoryBoundaryDraft } from '@/components/territory/google-territory-boundaries';
import { pinColorForStore, type PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryBoundary, TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

export type MapCameraMode = 'follow-selection' | 'manual-focus';

interface GoogleTerritoryMapProps {
  stores: TerritoryStorePin[];
  boundaries?: TerritoryBoundary[];
  showBoundaries?: boolean;
  hiddenBoundaryIds?: string[];
  draftBoundary?: TerritoryBoundaryDraft | null;
  drawingBoundaryMode?: boolean;
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  routeCoordinates: [number, number][];
  pinColorMode?: PinColorMode;
  onSelectStore: (storeId: string | null) => void;
  onDraftBoundaryChange?: (coordinates: [number, number][]) => void;
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
  const lastStoreSignatureRef = useRef('');
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
      if (lastStoreSignatureRef.current === '__empty__') {
        return;
      }
      map.setCenter(FALLBACK_CENTER);
      map.setZoom(Math.max(3, Math.min(defaultZoom, 5)));
      lastStoreSignatureRef.current = '__empty__';
      return;
    }

    const signature = stores.map((store) => `${store.id}:${store.lat.toFixed(5)}:${store.lng.toFixed(5)}`).join('|');
    if (signature === lastStoreSignatureRef.current) {
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
    lastStoreSignatureRef.current = signature;
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

function markerScale({ focused, selected, approximate }: { focused: boolean; selected: boolean; approximate: boolean }) {
  if (focused) return 1.35;
  if (selected) return 1.18;
  if (approximate) return 1.08;
  return 1;
}

const fallbackMarkerIconCache = new Map<string, string>();

function fallbackMarkerIcon(fillColor: string, approximate: boolean) {
  const key = `${fillColor}|${approximate ? 'approx' : 'exact'}`;
  const existing = fallbackMarkerIconCache.get(key);
  if (existing) {
    return existing;
  }

  const stroke = approximate ? '#111827' : '#ffffff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">
    <path d="M15 1C8.37258 1 3 6.37258 3 13C3 22 15 37 15 37C15 37 27 22 27 13C27 6.37258 21.6274 1 15 1Z" fill="${fillColor}" stroke="${stroke}" stroke-width="2"/>
    <circle cx="15" cy="13" r="4" fill="white" fill-opacity="${approximate ? '0.65' : '0.95'}"/>
  </svg>`;
  const encoded = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  fallbackMarkerIconCache.set(key, encoded);
  return encoded;
}

export function GoogleTerritoryMap({
  stores,
  boundaries = [],
  showBoundaries = true,
  hiddenBoundaryIds = [],
  draftBoundary = null,
  drawingBoundaryMode = false,
  selectedStopIds,
  orderedStopIds,
  focusedStoreId,
  routeCoordinates,
  pinColorMode = 'status',
  onSelectStore,
  onDraftBoundaryChange,
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

    let cancelled = false;

    async function loadRuntimeMapConfig() {
      setConfigLoading(true);
      setConfigError('');
      try {
        const response = await fetch('/api/territory/map-config', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as RuntimeMapConfigResponse;
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to read Google Maps config');
        }

        if (!cancelled) {
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
      <div className={cn('grid h-full w-full place-items-center rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-700', className)}>
        Loading Google Maps configuration...
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className={cn('grid h-full w-full place-items-center rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900', className)}>
        Google Maps API key is not configured. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
        {configError ? <span className="mt-2 block text-xs text-amber-800">{configError}</span> : null}
      </div>
    );
  }

  if (mapLoadError) {
    return (
      <div className={cn('grid h-full w-full place-items-center rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900', className)}>
        <div>
          <p>Google Maps failed to load.</p>
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
          <RouteLine routeCoordinates={routeCoordinates} />
          <GoogleTerritoryBoundaries
            boundaries={boundaries}
            showBoundaries={showBoundaries}
            hiddenBoundaryIds={hiddenBoundaryIds}
            draftBoundary={draftBoundary}
            drawingMode={drawingBoundaryMode}
            onDraftCoordinatesChange={onDraftBoundaryChange}
          />

          {safeStores.map((store) => {
            const focused = focusedStoreId === store.id;
            const selected = selectedSet.has(store.id);
            const approximate = Boolean(store.isApproximate);
            const glyph = approximate ? '≈' : '';

            if (useAdvancedMarkers) {
              return (
                <AdvancedMarker
                  key={store.id}
                  position={{ lat: store.lat, lng: store.lng }}
                  onClick={() => onSelectStore(store.id)}
                  title={store.name}
                >
                  <Pin
                    background={pinColorForStore(store, pinColorMode)}
                    borderColor={approximate ? '#111827' : '#ffffff'}
                    glyphColor="#ffffff"
                    scale={markerScale({ focused, selected, approximate })}
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
                  url: fallbackMarkerIcon(pinColorForStore(store, pinColorMode), approximate),
                }}
              />
            );
          })}
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
