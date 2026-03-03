'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import { pinColorForStore } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin } from '@/lib/territory/types';

interface MapCanvasInnerProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  routeCoordinates: [number, number][];
  focusedStoreId: string | null;
  onSelectStore: (storeId: string | null) => void;
}

const FALLBACK_CENTER: LatLngExpression = [39.8283, -98.5795];

export function TerritoryMapCanvasInner({ stores, selectedStopIds, orderedStopIds, routeCoordinates, focusedStoreId, onSelectStore }: MapCanvasInnerProps) {
  const selectedSet = useMemo(() => new Set(selectedStopIds), [selectedStopIds]);

  const orderMap = useMemo(() => {
    const entries = new Map<string, number>();
    orderedStopIds.forEach((id, index) => {
      entries.set(id, index + 1);
    });
    return entries;
  }, [orderedStopIds]);

  const mapCenter = useMemo<LatLngExpression>(() => {
    if (stores.length === 0) {
      return FALLBACK_CENTER;
    }

    const focus = focusedStoreId ? stores.find((store) => store.id === focusedStoreId) : null;
    if (focus) {
      return [focus.lat, focus.lng];
    }

    return [stores[0].lat, stores[0].lng];
  }, [stores, focusedStoreId]);

  const routeLatLngs = useMemo(() => routeCoordinates.map(([lng, lat]) => [lat, lng] as [number, number]), [routeCoordinates]);

  return (
    <>
      <style>
        {`
          @keyframes picc-focused-pin-pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45); }
            70% { box-shadow: 0 0 0 12px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
          }

          .picc-focused-pin {
            animation: picc-focused-pin-pulse 1.6s ease-in-out infinite;
          }
        `}
      </style>
      <MapContainer
        center={mapCenter}
        zoom={6}
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
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      <FitBounds stores={stores} focusedStoreId={focusedStoreId} />
      <MapClickClear onClear={() => onSelectStore(null)} />

      {routeLatLngs.length > 1 ? (
        <>
          <Polyline positions={routeLatLngs} color="#0f5f9e" weight={8} opacity={0.28} />
          <Polyline positions={routeLatLngs} color="#20a8ff" weight={5} opacity={0.95} />
        </>
      ) : null}

      {stores.map((store) => {
        const selected = selectedSet.has(store.id);
        const order = orderMap.get(store.id);
        const focused = focusedStoreId === store.id;

        return (
          <Marker
            key={store.id}
            position={[store.lat, store.lng]}
            icon={buildMarkerIcon(pinColorForStore(store, 'status'), selected, order, focused)}
            bubblingMouseEvents={false}
            eventHandlers={{
              click: () => onSelectStore(store.id),
            }}
          >
            <Popup>
              <div className="space-y-1">
                <p className="text-sm font-semibold">{store.name}</p>
                <p className="text-xs text-slate-600">{store.status}</p>
                <p className="text-xs text-slate-500">{store.locationAddress ?? store.locationLabel ?? 'No address available'}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
      </MapContainer>
    </>
  );
}

function FitBounds({ stores, focusedStoreId }: { stores: TerritoryStorePin[]; focusedStoreId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (stores.length === 0) {
      map.setView(FALLBACK_CENTER, 4);
      return;
    }

    const focus = focusedStoreId ? stores.find((store) => store.id === focusedStoreId) : null;
    if (focus) {
      map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 12), {
        duration: 0.45,
      });
      return;
    }

    const bounds = L.latLngBounds(stores.map((store) => [store.lat, store.lng] as [number, number]));
    map.flyToBounds(bounds, { padding: [32, 32], maxZoom: 11, duration: 0.45 });
  }, [focusedStoreId, map, stores]);

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

function buildMarkerIcon(color: string, selected: boolean, order: number | undefined, focused: boolean) {
  const badge = order
    ? `<span style="position:absolute;bottom:-8px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#0f172a;color:#fff;font-size:10px;line-height:18px;font-weight:700;text-align:center;">${order}</span>`
    : '';

  const size = focused ? 30 : selected ? 24 : 22;
  const borderColor = focused ? '#3b82f6' : selected ? '#0f172a' : '#ffffff';
  const shadow = focused ? '0 0 0 3px rgba(59,130,246,0.25)' : selected ? '0 0 0 2px rgba(15,23,42,0.25)' : '0 3px 8px rgba(15,23,42,0.28)';
  const focusedClass = focused ? ' picc-focused-pin' : '';
  const pinShape = selected
    ? `position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid ${borderColor};box-shadow:${shadow};transform:translateZ(0);`
    : `position:relative;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};border:3px solid ${borderColor};box-shadow:${shadow};transform:rotate(-45deg) translateZ(0);`;
  const innerLabelStyle = selected
    ? ''
    : 'display:none;';

  return L.divIcon({
    className: '',
    html: `<div class="${focusedClass.trim()}" style="${pinShape}"><span style="${innerLabelStyle}"></span>${badge}</div>`,
    iconSize: [size, size],
    iconAnchor: selected ? [Math.round(size / 2), Math.round(size / 2)] : [Math.round(size / 2) - 1, size],
    popupAnchor: [0, -10],
  });
}
