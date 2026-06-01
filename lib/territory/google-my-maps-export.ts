import type { TerritoryBoundary, TerritoryBoundaryCoordinates, TerritoryMarker, TerritoryStorePin } from '@/lib/territory/types';

export type GoogleMyMapsExportScope = 'viewport' | 'filtered';

export interface GoogleMyMapsViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GoogleMyMapsExportSelectionInput {
  stores: TerritoryStorePin[];
  boundaries: TerritoryBoundary[];
  markers: TerritoryMarker[];
  showBoundaries: boolean;
  hiddenBoundaryIds: string[];
  showMarkers: boolean;
  hiddenMarkerIds: string[];
  scope: GoogleMyMapsExportScope;
  viewportBounds?: GoogleMyMapsViewportBounds | null;
  includePins: boolean;
  includeBoundaries: boolean;
  includeMarkers: boolean;
}

export interface GoogleMyMapsExportData {
  stores: TerritoryStorePin[];
  boundaries: TerritoryBoundary[];
  markers: TerritoryMarker[];
}

export interface GoogleMyMapsKmlInput extends GoogleMyMapsExportData {
  name: string;
  generatedAt: string;
}

function isFiniteCoordinate(lat: unknown, lng: unknown) {
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

function pointInBounds(lat: number, lng: number, bounds: GoogleMyMapsViewportBounds) {
  const withinLat = lat >= bounds.south && lat <= bounds.north;
  const withinLng = bounds.west <= bounds.east ? lng >= bounds.west && lng <= bounds.east : lng >= bounds.west || lng <= bounds.east;
  return withinLat && withinLng;
}

function boundaryIntersectsBounds(coordinates: TerritoryBoundaryCoordinates, bounds: GoogleMyMapsViewportBounds) {
  const validCoordinates = coordinates.filter(([lng, lat]) => isFiniteCoordinate(lat, lng));
  if (validCoordinates.length === 0) {
    return false;
  }

  if (validCoordinates.some(([lng, lat]) => pointInBounds(lat, lng, bounds))) {
    return true;
  }

  const lats = validCoordinates.map(([, lat]) => lat);
  const lngs = validCoordinates.map(([lng]) => lng);
  const boundaryNorth = Math.max(...lats);
  const boundarySouth = Math.min(...lats);
  const boundaryEast = Math.max(...lngs);
  const boundaryWest = Math.min(...lngs);

  return boundaryNorth >= bounds.south && boundarySouth <= bounds.north && boundaryEast >= bounds.west && boundaryWest <= bounds.east;
}

function viewportFilter<T>(items: T[], scope: GoogleMyMapsExportScope, viewportBounds: GoogleMyMapsViewportBounds | null | undefined, predicate: (item: T, bounds: GoogleMyMapsViewportBounds) => boolean) {
  if (scope !== 'viewport' || !viewportBounds) {
    return items;
  }
  return items.filter((item) => predicate(item, viewportBounds));
}

export function selectGoogleMyMapsExportData(input: GoogleMyMapsExportSelectionInput): GoogleMyMapsExportData {
  const hiddenBoundaryIds = new Set(input.hiddenBoundaryIds);
  const hiddenMarkerIds = new Set(input.hiddenMarkerIds);

  const stores = input.includePins
    ? viewportFilter(
        input.stores.filter((store) => store.locationPrecision !== 'unavailable' && isFiniteCoordinate(store.lat, store.lng)),
        input.scope,
        input.viewportBounds,
        (store, bounds) => pointInBounds(store.lat, store.lng, bounds),
      )
    : [];

  const visibleBoundaries =
    input.includeBoundaries && input.showBoundaries
      ? input.boundaries.filter((boundary) => !hiddenBoundaryIds.has(boundary.id) && boundary.coordinates.length >= 3)
      : [];
  const boundaries = viewportFilter(
    visibleBoundaries,
    input.scope,
    input.viewportBounds,
    (boundary, bounds) => boundaryIntersectsBounds(boundary.coordinates, bounds),
  );

  const visibleMarkers =
    input.includeMarkers && input.showMarkers
      ? input.markers.filter((marker) => !hiddenMarkerIds.has(marker.id) && isFiniteCoordinate(marker.lat, marker.lng))
      : [];
  const markers = viewportFilter(
    visibleMarkers,
    input.scope,
    input.viewportBounds,
    (marker, bounds) => pointInBounds(marker.lat, marker.lng, bounds),
  );

  return { stores, boundaries, markers };
}

function escapeXml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function kmlColor(hexColor: string, alpha = 'ff') {
  const match = hexColor.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) {
    return `${alpha}777777`;
  }
  const value = match[1];
  const red = value.slice(0, 2);
  const green = value.slice(2, 4);
  const blue = value.slice(4, 6);
  return `${alpha}${blue}${green}${red}`.toLowerCase();
}

function closePolygon(coordinates: TerritoryBoundaryCoordinates) {
  if (coordinates.length === 0) {
    return [];
  }
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }
  return [...coordinates, first];
}

function coordinatesText(coordinates: TerritoryBoundaryCoordinates) {
  return coordinates.map(([lng, lat]) => `${lng},${lat},0`).join(' ');
}

function storeDescription(store: TerritoryStorePin) {
  const lines = [
    ['Status', store.status],
    ['Rep', store.repNames.join(', ') || 'Unassigned'],
    ['Address', store.locationAddress || store.locationLabel || ''],
    ['City', [store.city, store.state].filter(Boolean).join(', ')],
    ['Referral source', store.referralSource ?? ''],
    ['PPP status', store.pppStatus ?? ''],
    ['Follow-up', store.followUpDate ?? ''],
  ];
  return lines
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

export function buildGoogleMyMapsKml(input: GoogleMyMapsKmlInput) {
  const styles = [
    '<Style id="account-pin"><IconStyle><color>ff1238cd</color><scale>1.0</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle></Style>',
    '<Style id="home-marker"><IconStyle><color>ffeb6325</color><scale>1.0</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle></Style>',
  ];

  const accountPlacemarks = input.stores
    .map(
      (store) => `<Placemark>
  <name>${escapeXml(store.name)}</name>
  <description>${escapeXml(storeDescription(store))}</description>
  <styleUrl>#account-pin</styleUrl>
  <Point><coordinates>${store.lng},${store.lat},0</coordinates></Point>
</Placemark>`,
    )
    .join('\n');

  const boundaryPlacemarks = input.boundaries
    .map((boundary) => {
      const styleId = `territory-${boundary.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      styles.push(`<Style id="${escapeXml(styleId)}"><LineStyle><color>${kmlColor(boundary.color)}</color><width>${boundary.borderWidth}</width></LineStyle><PolyStyle><color>${kmlColor(boundary.color, '33')}</color></PolyStyle></Style>`);
      return `<Placemark>
  <name>${escapeXml(boundary.name)}</name>
  <description>${escapeXml(boundary.description)}</description>
  <styleUrl>#${escapeXml(styleId)}</styleUrl>
  <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinatesText(closePolygon(boundary.coordinates))}</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark>`;
    })
    .join('\n');

  const markerPlacemarks = input.markers
    .map(
      (marker) => `<Placemark>
  <name>${escapeXml(marker.name)}</name>
  <description>${escapeXml(marker.address || marker.description || 'Home marker')}</description>
  <styleUrl>#home-marker</styleUrl>
  <Point><coordinates>${marker.lng},${marker.lat},0</coordinates></Point>
</Placemark>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(input.name)}</name>
  <description>${escapeXml(`Generated for Google My Maps import on ${input.generatedAt}.`)}</description>
  ${styles.join('\n  ')}
  <Folder><name>Accounts</name>
${accountPlacemarks}
  </Folder>
  <Folder><name>Territories</name>
${boundaryPlacemarks}
  </Folder>
  <Folder><name>Home markers</name>
${markerPlacemarks}
  </Folder>
</Document>
</kml>
`;
}

export function googleMyMapsExportFilename(generatedAt = new Date()) {
  const stamp = generatedAt.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `picc-territory-view-${stamp}.kml`;
}
