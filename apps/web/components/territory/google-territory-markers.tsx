'use client';

import { AdvancedMarker, Marker, Pin } from '@vis.gl/react-google-maps';
import type { TerritoryMarker } from '@/lib/territory/types';

interface GoogleTerritoryMarkersProps {
  markers: TerritoryMarker[];
  hiddenMarkerIds: string[];
  showMarkers: boolean;
}

function houseMarkerSvg(fillColor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
    <path d="M17 4 5 13.5V29h24V13.5L17 4Z" fill="${fillColor}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12.5 29V19h9v10" fill="#ffffff" fill-opacity="0.25"/>
    <path d="M14 15h6" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function GoogleTerritoryMarkers({
  markers,
  hiddenMarkerIds,
  showMarkers,
}: GoogleTerritoryMarkersProps) {
  if (!showMarkers) {
    return null;
  }

  const hidden = new Set(hiddenMarkerIds);

  return (
    <>
      {markers
        .filter((marker) => !hidden.has(marker.id))
        .map((marker) => (
          <AdvancedMarker
            key={marker.id}
            position={{ lat: marker.lat, lng: marker.lng }}
            title={marker.address ? `${marker.name} • ${marker.address}` : marker.name}
          >
            <Pin
              background={marker.color}
              borderColor="#ffffff"
              glyphColor="#ffffff"
              scale={1.05}
              glyph="⌂"
            />
          </AdvancedMarker>
        ))}
    </>
  );
}

export function GoogleTerritoryMarkersFallback({
  markers,
  hiddenMarkerIds,
  showMarkers,
}: GoogleTerritoryMarkersProps) {
  if (!showMarkers) {
    return null;
  }

  const hidden = new Set(hiddenMarkerIds);

  return (
    <>
      {markers
        .filter((marker) => !hidden.has(marker.id))
        .map((marker) => (
          <Marker
            key={marker.id}
            position={{ lat: marker.lat, lng: marker.lng }}
            title={marker.address ? `${marker.name} • ${marker.address}` : marker.name}
            icon={{
              url: houseMarkerSvg(marker.color),
            }}
          />
        ))}
    </>
  );
}
