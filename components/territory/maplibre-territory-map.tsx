'use client';

import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from 'maplibre-gl';
import { pinColorForStore, type PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

export type TerritoryLayerMode = 'pins' | 'heatmap' | 'hex';

interface MapLibreTerritoryMapProps {
  stores: TerritoryStorePin[];
  selectedStopIds: string[];
  orderedStopIds: string[];
  focusedStoreId: string | null;
  routeCoordinates: [number, number][];
  pinColorMode?: PinColorMode;
  layerMode?: TerritoryLayerMode;
  onSelectStore: (storeId: string | null) => void;
  className?: string;
  fitPadding?: number;
  maxFitZoom?: number;
  defaultZoom?: number;
}

const FALLBACK_CENTER: [number, number] = [-98.5795, 39.8283];
const STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', 'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'carto-base', type: 'raster', source: 'carto' }],
};

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

function toFollowUpUrgency(store: TerritoryStorePin) {
  if (typeof store.metrics?.followUpUrgencyScore === 'number') {
    return store.metrics.followUpUrgencyScore;
  }

  if (!store.followUpDate) {
    return 0;
  }

  const date = new Date(store.followUpDate);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const daysUntil = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  return Math.max(0, 14 - daysUntil);
}

function toHeatWeight(store: TerritoryStorePin) {
  const followUp = toFollowUpUrgency(store);
  const interactions = store.metrics?.interactionsScore ?? (store.lastCheckIn ? 1 : 0);
  const purchases = store.metrics?.purchasesScore ?? 0;
  return Math.max(1, followUp + interactions * 0.8 + purchases * 0.25);
}

function removeLayerIfPresent(map: maplibregl.Map, layerId: string) {
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }
}

function removeSourceIfPresent(map: maplibregl.Map, sourceId: string) {
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

export function MapLibreTerritoryMap({
  stores,
  selectedStopIds,
  orderedStopIds,
  focusedStoreId,
  routeCoordinates,
  pinColorMode = 'status',
  layerMode = 'pins',
  onSelectStore,
  className,
  fitPadding = 36,
  maxFitZoom = 12,
  defaultZoom = 10,
}: MapLibreTerritoryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const safeStores = useMemo(
    () => stores.filter((store) => isFiniteLatLng(store.lat, store.lng)),
    [stores],
  );

  const orderMap = useMemo(() => {
    const map = new Map<string, number>();
    orderedStopIds.forEach((id, index) => map.set(id, index + 1));
    return map;
  }, [orderedStopIds]);

  const selectedSet = useMemo(() => new Set(selectedStopIds), [selectedStopIds]);

  const storesGeoJson = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: safeStores.map((store) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [store.lng, store.lat] as [number, number],
        },
        properties: {
          id: store.id,
          name: store.name,
          color: pinColorForStore(store, pinColorMode),
          selected: selectedSet.has(store.id) ? 1 : 0,
          focused: focusedStoreId === store.id ? 1 : 0,
          order: orderMap.get(store.id) ?? 0,
          weight: toHeatWeight(store),
        },
      })),
    };
  }, [safeStores, pinColorMode, selectedSet, focusedStoreId, orderMap]);

  const hexGeoJson = useMemo(() => {
    const buckets = new Map<string, { lat: number; lng: number; count: number; weight: number }>();

    for (const store of safeStores) {
      const lat = Math.round(store.lat * 55) / 55;
      const lng = Math.round(store.lng * 55) / 55;
      const key = `${lat}:${lng}`;
      const current = buckets.get(key) ?? { lat, lng, count: 0, weight: 0 };
      current.count += 1;
      current.weight += toHeatWeight(store);
      buckets.set(key, current);
    }

    return {
      type: 'FeatureCollection' as const,
      features: [...buckets.values()].map((entry) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [entry.lng, entry.lat] as [number, number],
        },
        properties: {
          count: entry.count,
          weight: entry.weight,
        },
      })),
    };
  }, [safeStores]);

  const selectedGeoJson = useMemo(() => {
    const focused = safeStores.find((store) => store.id === focusedStoreId);
    if (!focused) {
      return {
        type: 'FeatureCollection' as const,
        features: [],
      };
    }

    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [focused.lng, focused.lat] as [number, number],
          },
          properties: {
            id: focused.id,
          },
        },
      ],
    };
  }, [safeStores, focusedStoreId]);

  const routeGeoJson = useMemo(() => {
    const coordinates = routeCoordinates.filter(
      (coord): coord is [number, number] =>
        Array.isArray(coord) && coord.length === 2 && isFiniteLatLng(coord[1], coord[0]),
    );

    return {
      type: 'FeatureCollection' as const,
      features:
        coordinates.length > 1
          ? [
              {
                type: 'Feature' as const,
                geometry: {
                  type: 'LineString' as const,
                  coordinates,
                },
                properties: {},
              },
            ]
          : [],
    };
  }, [routeCoordinates]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: FALLBACK_CENTER,
      zoom: defaultZoom,
      maxPitch: 45,
      antialias: true,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ['unclustered-points', 'clusters', 'hex-points', 'focus-ring'],
      });

      if (features.length === 0) {
        onSelectStore(null);
      }
    };

    const onPointClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string' && id.length > 0) {
        onSelectStore(id);
      }
    };

    const onClusterClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const clusterId = Number(feature.properties?.cluster_id);
      const source = map.getSource('stores') as GeoJSONSource | undefined;
      if (!source || !Number.isFinite(clusterId)) return;

      source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          const geometry = feature.geometry as GeoJSON.Point;
          map.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: Math.max(zoom, 12),
            duration: 500,
          });
        })
        .catch(() => undefined);
    };

    map.on('click', onMapClick);
    map.on('click', 'unclustered-points', onPointClick);
    map.on('click', 'clusters', onClusterClick);
    map.on('click', 'hex-points', onMapClick);

    return () => {
      map.off('click', onMapClick);
      map.off('click', 'unclustered-points', onPointClick);
      map.off('click', 'clusters', onClusterClick);
      map.off('click', 'hex-points', onMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, [defaultZoom, onSelectStore]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      removeLayerIfPresent(map, 'route-shadow');
      removeLayerIfPresent(map, 'route-main');
      removeLayerIfPresent(map, 'focus-ring');
      removeLayerIfPresent(map, 'order-labels');
      removeLayerIfPresent(map, 'unclustered-points');
      removeLayerIfPresent(map, 'cluster-count');
      removeLayerIfPresent(map, 'clusters');
      removeLayerIfPresent(map, 'heatmap-layer');
      removeLayerIfPresent(map, 'hex-points');

      removeSourceIfPresent(map, 'selected');
      removeSourceIfPresent(map, 'stores');
      removeSourceIfPresent(map, 'route');
      removeSourceIfPresent(map, 'hex');

      map.addSource('route', {
        type: 'geojson',
        data: routeGeoJson,
      });

      map.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#0f5f9e',
          'line-width': 10,
          'line-opacity': 0.28,
        },
      });

      map.addLayer({
        id: 'route-main',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#20a8ff',
          'line-width': 5,
          'line-opacity': 0.95,
        },
      });

      if (layerMode === 'hex') {
        map.addSource('hex', {
          type: 'geojson',
          data: hexGeoJson,
        });

        map.addLayer({
          id: 'hex-points',
          type: 'circle',
          source: 'hex',
          paint: {
            'circle-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'weight']], 0],
              0,
              '#a5b4fc',
              6,
              '#f59e0b',
              12,
              '#dc2626',
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'count']], 1],
              1,
              10,
              10,
              26,
            ],
            'circle-opacity': 0.62,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
          },
        });

        return;
      }

      map.addSource('stores', {
        type: 'geojson',
        data: storesGeoJson,
        cluster: layerMode === 'pins',
        clusterMaxZoom: 13,
        clusterRadius: 42,
      });

      if (layerMode === 'heatmap') {
        map.addLayer({
          id: 'heatmap-layer',
          type: 'heatmap',
          source: 'stores',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'weight']], 1], 0, 0, 15, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 12, 1.8],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(33,102,172,0)',
              0.2,
              'rgb(103,169,207)',
              0.4,
              'rgb(209,229,240)',
              0.6,
              'rgb(253,219,199)',
              0.8,
              'rgb(239,138,98)',
              1,
              'rgb(178,24,43)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 30],
            'heatmap-opacity': 0.78,
          },
        });

        return;
      }

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'stores',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#8ecae6', 15, '#219ebc', 40, '#023047'],
          'circle-radius': ['step', ['get', 'point_count'], 17, 15, 21, 40, 26],
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'stores',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'unclustered-points',
        type: 'circle',
        source: 'stores',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['coalesce', ['get', 'color'], '#ef4444'],
          'circle-radius': ['case', ['==', ['get', 'focused'], 1], 11, ['==', ['get', 'selected'], 1], 9, 6],
          'circle-opacity': 0.95,
          'circle-stroke-width': ['case', ['==', ['get', 'focused'], 1], 3, 2],
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'order-labels',
        type: 'symbol',
        source: 'stores',
        filter: ['all', ['!', ['has', 'point_count']], ['>', ['to-number', ['get', 'order']], 0]],
        layout: {
          'text-field': ['to-string', ['get', 'order']],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': '#102a43',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1,
        },
      });

      map.addSource('selected', {
        type: 'geojson',
        data: selectedGeoJson,
      });

      map.addLayer({
        id: 'focus-ring',
        type: 'circle',
        source: 'selected',
        paint: {
          'circle-radius': 15,
          'circle-color': 'rgba(79,142,223,0.15)',
          'circle-stroke-color': '#4f8edf',
          'circle-stroke-width': 2,
        },
      });
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [storesGeoJson, routeGeoJson, selectedGeoJson, layerMode, hexGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || layerMode !== 'pins') return;

    let tick = 0;
    const timer = window.setInterval(() => {
      if (!map.getLayer('focus-ring')) return;
      tick += 0.35;
      const radius = 13 + Math.max(0, Math.sin(tick)) * 4;
      map.setPaintProperty('focus-ring', 'circle-radius', radius);
    }, 110);

    return () => window.clearInterval(timer);
  }, [layerMode, focusedStoreId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const fit = () => {
      if (safeStores.length === 0) {
        map.easeTo({ center: FALLBACK_CENTER, zoom: 3.5, duration: 450 });
        return;
      }

      const focused = focusedStoreId ? safeStores.find((store) => store.id === focusedStoreId) : null;
      if (focused) {
        map.easeTo({ center: [focused.lng, focused.lat], zoom: Math.max(map.getZoom(), 13), duration: 450 });
        return;
      }

      const bounds = safeStores.reduce(
        (acc, store) => acc.extend([store.lng, store.lat]),
        new maplibregl.LngLatBounds([safeStores[0].lng, safeStores[0].lat], [safeStores[0].lng, safeStores[0].lat]),
      );

      map.fitBounds(bounds as LngLatBoundsLike, {
        padding: fitPadding,
        maxZoom: maxFitZoom,
        duration: 550,
      });
    };

    if (map.isStyleLoaded()) {
      fit();
    } else {
      map.once('load', fit);
    }
  }, [safeStores, focusedStoreId, fitPadding, maxFitZoom]);

  return <div ref={containerRef} className={cn('h-full w-full rounded-xl [filter:saturate(1.08)_contrast(1.03)]', className)} />;
}
