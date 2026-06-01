import { describe, expect, it } from 'vitest';
import { buildGoogleMyMapsKml, selectGoogleMyMapsExportData } from '@/lib/territory/google-my-maps-export';
import type { TerritoryBoundary, TerritoryMarker, TerritoryStorePin } from '@/lib/territory/types';

const baseStore: TerritoryStorePin = {
  id: 'store-1',
  notionPageId: 'notion-1',
  name: 'Astoria & Co',
  status: 'Customer',
  statusKey: 'customer',
  statusColor: '#16a34a',
  pinKind: 'customer',
  repNames: ['Ben'],
  repEmails: ['ben@piccplatform.com'],
  lat: 40.7643,
  lng: -73.9235,
  locationLabel: 'Astoria, NY',
  locationAddress: '31-01 Ditmars Blvd, Astoria, NY',
  locationSource: 'google-address-cache',
  locationPrecision: 'exact',
  isApproximate: false,
  lastEditedTime: '2026-05-01T12:00:00.000Z',
  city: 'Astoria',
  state: 'NY',
  referralSource: 'Referral',
};

const boundary: TerritoryBoundary = {
  id: 'boundary-1',
  name: 'Queens <North>',
  description: 'Primary territory & expansion zone',
  color: '#cd3814',
  borderWidth: 2,
  isVisibleByDefault: true,
  coordinates: [
    [-73.95, 40.75],
    [-73.9, 40.75],
    [-73.9, 40.8],
    [-73.95, 40.8],
  ],
  createdAt: '2026-05-01T12:00:00.000Z',
  updatedAt: '2026-05-01T12:00:00.000Z',
};

const marker: TerritoryMarker = {
  id: 'marker-1',
  name: 'Ben Home',
  address: 'Astoria, NY',
  lat: 40.765,
  lng: -73.925,
  color: '#2563eb',
  kind: 'home',
  isVisibleByDefault: true,
  createdAt: '2026-05-01T12:00:00.000Z',
  updatedAt: '2026-05-01T12:00:00.000Z',
};

describe('Google My Maps export', () => {
  it('exports the current viewport and visible overlays only by default', () => {
    const selected = selectGoogleMyMapsExportData({
      stores: [
        baseStore,
        {
          ...baseStore,
          id: 'store-2',
          name: 'Brooklyn Shop',
          lat: 40.6782,
          lng: -73.9442,
        },
      ],
      boundaries: [boundary, { ...boundary, id: 'hidden-boundary', name: 'Hidden' }],
      markers: [marker, { ...marker, id: 'hidden-marker', name: 'Hidden Marker' }],
      showBoundaries: true,
      hiddenBoundaryIds: ['hidden-boundary'],
      showMarkers: true,
      hiddenMarkerIds: ['hidden-marker'],
      scope: 'viewport',
      viewportBounds: {
        north: 40.82,
        south: 40.72,
        east: -73.88,
        west: -73.98,
      },
      includePins: true,
      includeBoundaries: true,
      includeMarkers: true,
    });

    expect(selected.stores.map((store) => store.id)).toEqual(['store-1']);
    expect(selected.boundaries.map((entry) => entry.id)).toEqual(['boundary-1']);
    expect(selected.markers.map((entry) => entry.id)).toEqual(['marker-1']);
  });

  it('builds escaped KML folders for accounts, territories, and home markers', () => {
    const kml = buildGoogleMyMapsKml({
      name: 'PICC current territory view',
      generatedAt: '2026-05-31T14:00:00.000Z',
      stores: [baseStore],
      boundaries: [boundary],
      markers: [marker],
    });

    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<Folder><name>Accounts</name>');
    expect(kml).toContain('<name>Astoria &amp; Co</name>');
    expect(kml).toContain('<Folder><name>Territories</name>');
    expect(kml).toContain('<name>Queens &lt;North&gt;</name>');
    expect(kml).toContain('<coordinates>-73.95,40.75,0 -73.9,40.75,0 -73.9,40.8,0 -73.95,40.8,0 -73.95,40.75,0</coordinates>');
    expect(kml).toContain('<Folder><name>Home markers</name>');
    expect(kml).toContain('<name>Ben Home</name>');
    expect(kml).toContain('Generated for Google My Maps import on 2026-05-31T14:00:00.000Z.');
  });
});
