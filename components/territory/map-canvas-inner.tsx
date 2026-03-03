'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import type { TerritoryStorePin } from '@/lib/territory/types';

interface MapCanvasInnerProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  routeCoordinates: [number, number][];
  focusedStoreId: string | null;
  onSelectStore: (storeId: string) => void;
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
    <MapContainer center={mapCenter} zoom={6} className="h-full w-full" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds stores={stores} focusedStoreId={focusedStoreId} />

      {routeLatLngs.length > 1 ? <Polyline positions={routeLatLngs} color="#0f172a" weight={4} opacity={0.85} /> : null}

      {stores.map((store) => {
        const selected = selectedSet.has(store.id);
        const order = orderMap.get(store.id);

        return (
          <Marker
            key={store.id}
            position={[store.lat, store.lng]}
            icon={buildMarkerIcon(store.statusColor, store.pinKind, selected, order)}
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
      map.setView([focus.lat, focus.lng], 11);
      return;
    }

    const bounds = L.latLngBounds(stores.map((store) => [store.lat, store.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
  }, [focusedStoreId, map, stores]);

  return null;
}

function buildMarkerIcon(color: string, pinKind: 'lead' | 'customer' | 'other', selected: boolean, order?: number) {
  const badge = order
    ? `<span style="position:absolute;bottom:-8px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#0f172a;color:#fff;font-size:10px;line-height:18px;font-weight:700;text-align:center;">${order}</span>`
    : '';

  const borderColor = selected ? '#0f172a' : '#ffffff';
  const shadow = selected ? '0 0 0 2px rgba(15,23,42,0.25)' : '0 1px 3px rgba(15,23,42,0.25)';
  const shapeStyle =
    pinKind === 'customer'
      ? 'border-radius:6px;transform:rotate(45deg);'
      : pinKind === 'lead'
        ? 'border-radius:50% 50% 50% 0;transform:rotate(-45deg);'
        : 'border-radius:50%;transform:none;';

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:22px;${shapeStyle}background:${color};border:3px solid ${borderColor};box-shadow:${shadow};">${badge}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
  });
}
