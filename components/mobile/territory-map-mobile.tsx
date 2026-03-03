'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import { pinColorForStore, type PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin } from '@/lib/territory/types';

interface TerritoryMapMobileProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  routeCoordinates: [number, number][];
  pinColorMode: PinColorMode;
  onSelectStore: (id: string | null) => void;
}

const FALLBACK_CENTER: LatLngExpression = [39.8283, -98.5795];

export function TerritoryMapMobile({
  stores,
  selectedStopIds,
  orderedStopIds,
  focusedStoreId,
  routeCoordinates,
  pinColorMode,
  onSelectStore,
}: TerritoryMapMobileProps) {
  const selectedSet = useMemo(() => new Set(selectedStopIds), [selectedStopIds]);
  const orderMap = useMemo(() => {
    const map = new Map<string, number>();
    orderedStopIds.forEach((id, index) => map.set(id, index + 1));
    return map;
  }, [orderedStopIds]);

  const center = useMemo<LatLngExpression>(() => {
    const focused = focusedStoreId ? stores.find((store) => store.id === focusedStoreId) : null;
    if (focused) return [focused.lat, focused.lng];
    if (stores[0]) return [stores[0].lat, stores[0].lng];
    return FALLBACK_CENTER;
  }, [stores, focusedStoreId]);

  const routeLine = useMemo(() => routeCoordinates.map(([lng, lat]) => [lat, lng] as [number, number]), [routeCoordinates]);

  return (
    <>
      <style>
        {`
          @keyframes picc-mobile-focused-pin-pulse {
            0% { box-shadow: 0 0 0 0 rgba(79, 142, 223, 0.5); }
            70% { box-shadow: 0 0 0 11px rgba(79, 142, 223, 0); }
            100% { box-shadow: 0 0 0 0 rgba(79, 142, 223, 0); }
          }

          .picc-mobile-focused-pin {
            animation: picc-mobile-focused-pin-pulse 1.5s ease-in-out infinite;
          }
        `}
      </style>
      <MapContainer
        center={center}
        zoom={11}
        className="h-full w-full [filter:saturate(1.08)_contrast(1.03)]"
        zoomControl={false}
        preferCanvas
        zoomAnimation
        fadeAnimation
        markerZoomAnimation
        inertia
        inertiaDeceleration={2200}
        zoomSnap={0.25}
        zoomDelta={0.5}
      >
        <TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <FitMapBounds stores={stores} focusedStoreId={focusedStoreId} />
        <MapClickClear onClear={() => onSelectStore(null)} />

        {routeLine.length > 1 ? (
          <>
            <Polyline positions={routeLine} color="#0f5f9e" weight={9} opacity={0.28} />
            <Polyline positions={routeLine} color="#20a8ff" weight={5} opacity={0.95} />
          </>
        ) : null}

        {stores.map((store) => {
          const selected = selectedSet.has(store.id);
          const order = orderMap.get(store.id);
          const focused = focusedStoreId === store.id;
          const pinColor = pinColorForStore(store, pinColorMode);

          return (
            <Marker
              key={store.id}
              position={[store.lat, store.lng]}
              icon={selected ? buildSelectedPin(order ?? 1, focused) : buildDefaultPin(pinColor, focused)}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => onSelectStore(store.id) }}
            />
          );
        })}
      </MapContainer>
    </>
  );
}

function FitMapBounds({ stores, focusedStoreId }: { stores: TerritoryStorePin[]; focusedStoreId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (stores.length === 0) {
      map.setView(FALLBACK_CENTER, 4);
      return;
    }

    const focused = focusedStoreId ? stores.find((store) => store.id === focusedStoreId) : null;
    if (focused) {
      map.flyTo([focused.lat, focused.lng], Math.max(map.getZoom(), 13), { duration: 0.4 });
      return;
    }

    const bounds = L.latLngBounds(stores.map((store) => [store.lat, store.lng] as [number, number]));
    map.flyToBounds(bounds, { padding: [24, 24], maxZoom: 11, duration: 0.45 });
  }, [map, stores, focusedStoreId]);

  return null;
}

function MapClickClear({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click() {
      onClear();
    },
  });
  return null;
}

function buildDefaultPin(color: string, focused: boolean) {
  const size = focused ? 26 : 20;
  const focusedClass = focused ? 'picc-mobile-focused-pin' : '';
  const border = focused ? '#4f8edf' : '#ffffff';

  return L.divIcon({
    className: '',
    html: `<div class="${focusedClass}" style="width:${size}px;height:${size}px;background:${color};border:2px solid ${border};border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 9px rgba(0,0,0,0.26);"></div>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2) - 1, size],
  });
}

function buildSelectedPin(order: number, focused: boolean) {
  const size = focused ? 32 : 26;
  const focusedClass = focused ? 'picc-mobile-focused-pin' : '';
  return L.divIcon({
    className: '',
    html: `<div class="${focusedClass}" style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:#47b649;border:3px solid #dff5d8;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:grid;place-items:center;font-weight:700;font-size:14px;color:#18411a;">${order}</div>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
  });
}
