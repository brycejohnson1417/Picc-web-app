'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import type { TerritoryStorePin } from '@/lib/territory/types';

interface TerritoryMapMobileProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  routeCoordinates: [number, number][];
  onSelectStore: (id: string) => void;
}

const FALLBACK_CENTER: LatLngExpression = [39.8283, -98.5795];

export function TerritoryMapMobile({ stores, selectedStopIds, orderedStopIds, focusedStoreId, routeCoordinates, onSelectStore }: TerritoryMapMobileProps) {
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
    <MapContainer center={center} zoom={11} className="h-full w-full" zoomControl={false}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" />
      <FitMapBounds stores={stores} focusedStoreId={focusedStoreId} />
      {routeLine.length > 1 ? <Polyline positions={routeLine} color="#3ea5ff" weight={6} opacity={0.9} /> : null}

      {stores.map((store) => {
        const selected = selectedSet.has(store.id);
        const order = orderMap.get(store.id);
        return (
          <Marker
            key={store.id}
            position={[store.lat, store.lng]}
            icon={selected ? buildSelectedPin(order ?? 1) : buildDefaultPin(store.statusColor, store.pinKind)}
            eventHandlers={{ click: () => onSelectStore(store.id) }}
          />
        );
      })}
    </MapContainer>
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
      map.setView([focused.lat, focused.lng], 13);
      return;
    }

    const bounds = L.latLngBounds(stores.map((store) => [store.lat, store.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
  }, [map, stores, focusedStoreId]);

  return null;
}

function buildDefaultPin(color: string, pinKind: 'lead' | 'customer' | 'other') {
  const shapeStyle =
    pinKind === 'customer'
      ? 'border-radius:6px;transform:rotate(45deg);'
      : pinKind === 'lead'
        ? 'border-radius:50% 50% 50% 0;transform:rotate(-45deg);'
        : 'border-radius:50%;transform:none;';

  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;${shapeStyle}background:${color};border:2px solid #ffffff;box-shadow:0 3px 7px rgba(0,0,0,0.25);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 17],
  });
}

function buildSelectedPin(order: number) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:24px;height:24px;border-radius:50%;background:#47b649;border:3px solid #dff5d8;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:grid;place-items:center;font-weight:700;font-size:14px;color:#18411a;">${order}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 20],
  });
}
