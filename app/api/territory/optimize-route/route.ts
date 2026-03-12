import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { checkGoogleBudgetCap, estimateGoogleUsageCostUsd, recordGoogleUsage } from '@/lib/server/google-usage';
import type { RouteMode, TerritoryOptimizedRouteResponse } from '@/lib/territory/types';

export const dynamic = 'force-dynamic';

const GOOGLE_ROUTES_BASE = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const EARTH_RADIUS_METERS = 6_371_000;

const stopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
});

const requestSchema = z.object({
  mode: z.enum(['car', 'bike', 'transit']),
  optimize: z.boolean().default(true),
  stops: z.array(stopSchema).min(2).max(25),
});

type TerritoryStop = z.infer<typeof stopSchema>;

type UsageCounter = {
  day: string;
  computeRoutes: number;
  optimizeRequests: number;
};

let usageCounter: UsageCounter = {
  day: '',
  computeRoutes: 0,
  optimizeRequests: 0,
};

function currentDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseDailyCap(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function resetUsageCounterIfNeeded() {
  const day = currentDayKey();
  if (usageCounter.day !== day) {
    usageCounter = {
      day,
      computeRoutes: 0,
      optimizeRequests: 0,
    };
  }
}

function hasCapacity(input: { optimize: boolean }) {
  resetUsageCounterIfNeeded();

  const computeCap = parseDailyCap(process.env.TERRITORY_GOOGLE_ROUTES_DAILY_CAP, 2500);
  const optimizeCap = parseDailyCap(process.env.TERRITORY_GOOGLE_ROUTE_OPTIMIZATION_DAILY_CAP, 750);

  if (usageCounter.computeRoutes >= computeCap) {
    return { ok: false, warning: `Google Routes daily cap reached (${computeCap}).` };
  }

  if (input.optimize && usageCounter.optimizeRequests >= optimizeCap) {
    return { ok: false, warning: `Google route-optimization cap reached (${optimizeCap}).` };
  }

  return { ok: true };
}

function incrementUsage(input: { optimize: boolean }) {
  resetUsageCounterIfNeeded();
  usageCounter.computeRoutes += 1;
  if (input.optimize) {
    usageCounter.optimizeRequests += 1;
  }
}

function routesApiKey() {
  return process.env.GOOGLE_ROUTES_API_KEY?.trim() || process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || '';
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(from: TerritoryStop, to: TerritoryStop) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

function parseDurationSeconds(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.trim().toLowerCase();
  if (!normalized.endsWith('s')) return 0;
  const parsed = Number.parseFloat(normalized.slice(0, -1));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function decodePolyline(encoded: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function buildFallbackRoute(mode: RouteMode, stops: TerritoryStop[], warning: string): TerritoryOptimizedRouteResponse {
  const metersPerSecond = mode === 'bike' ? 4.5 : mode === 'transit' ? 5.4 : 13.4;
  const legs = stops.slice(0, -1).map((stop, index) => {
    const next = stops[index + 1];
    const distance = distanceMeters(stop, next);
    const durationSeconds =
      mode === 'transit'
        ? Math.round(distance / metersPerSecond + 7 * 60)
        : Math.round(distance / metersPerSecond);

    return {
      fromStopId: stop.id,
      toStopId: next.id,
      distanceMeters: distance,
      durationSeconds,
    };
  });

  return {
    mode,
    modeLabel: mode === 'bike' ? 'Bike' : mode === 'transit' ? 'Public Transit' : 'Driving',
    estimationModel: mode === 'transit' ? 'transit-heuristic' : 'fallback-order',
    orderedStopIds: stops.map((stop) => stop.id),
    totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    legs,
    warning,
    capExceeded: mode !== 'transit',
    geometry: {
      type: 'LineString',
      coordinates: stops.map((stop) => [stop.lng, stop.lat] as [number, number]),
    },
  };
}

async function computeGoogleRoute(input: {
  mode: Extract<RouteMode, 'car' | 'bike'>;
  stops: TerritoryStop[];
  optimize: boolean;
}): Promise<TerritoryOptimizedRouteResponse> {
  const key = routesApiKey();
  if (!key) {
    throw new Error('GOOGLE_ROUTES_API_KEY or GOOGLE_MAPS_SERVER_API_KEY is required');
  }

  const origin = input.stops[0];
  const destination = input.stops[input.stops.length - 1];
  const intermediates = input.stops.slice(1, -1);
  const billedOptimizeSku = input.optimize && intermediates.length > 1;
  const travelMode = input.mode === 'bike' ? 'BICYCLE' : 'DRIVE';
  const pendingCostUsd =
    estimateGoogleUsageCostUsd('routes_compute', 1) +
    (billedOptimizeSku ? estimateGoogleUsageCostUsd('routes_optimize', 1) : 0);
  const budgetCheck = await checkGoogleBudgetCap(pendingCostUsd);
  if (!budgetCheck.allowed) {
    throw new Error(`Google monthly budget cap reached ($${budgetCheck.summary.budgetUsd.toFixed(2)}).`);
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_ROUTES_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng,
            },
          },
        },
        intermediates: intermediates.map((stop) => ({
          location: {
            latLng: {
              latitude: stop.lat,
              longitude: stop.lng,
            },
          },
        })),
        travelMode,
        routingPreference: input.mode === 'car' ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_UNAWARE',
        optimizeWaypointOrder: billedOptimizeSku,
        polylineQuality: 'HIGH_QUALITY',
        languageCode: 'en-US',
        units: 'IMPERIAL',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
  } finally {
    const usageWrites: Promise<void>[] = [recordGoogleUsage('routes_compute', 1)];
    if (billedOptimizeSku) {
      usageWrites.push(recordGoogleUsage('routes_optimize', 1));
    }
    void Promise.allSettled(usageWrites);
  }

  const payload = (await response.json()) as {
    routes?: Array<{
      duration?: string;
      distanceMeters?: number;
      legs?: Array<{ duration?: string; distanceMeters?: number }>;
      polyline?: { encodedPolyline?: string };
      optimizedIntermediateWaypointIndex?: number[];
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Google Routes request failed');
  }

  const route = payload.routes?.[0];
  if (!route) {
    throw new Error('Google Routes response missing route');
  }

  let orderedStops = input.stops;
  if (Array.isArray(route.optimizedIntermediateWaypointIndex) && route.optimizedIntermediateWaypointIndex.length === intermediates.length) {
    const reorderedIntermediates = route.optimizedIntermediateWaypointIndex.map((index) => intermediates[index]).filter(Boolean);
    orderedStops = [origin, ...reorderedIntermediates, destination];
  }

  const legs = (route.legs ?? []).map((leg, index) => ({
    fromStopId: orderedStops[index]?.id ?? '',
    toStopId: orderedStops[index + 1]?.id ?? '',
    distanceMeters: Math.round(leg.distanceMeters ?? 0),
    durationSeconds: parseDurationSeconds(leg.duration),
  }));

  const coordinates = route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [];

  return {
    mode: input.mode,
    modeLabel: input.mode === 'bike' ? 'Bike' : 'Driving',
    estimationModel: 'google-routes',
    orderedStopIds: orderedStops.map((stop) => stop.id),
    totalDistanceMeters: Math.round(route.distanceMeters ?? legs.reduce((sum, leg) => sum + leg.distanceMeters, 0)),
    totalDurationSeconds: parseDurationSeconds(route.duration) || legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    legs,
    capExceeded: false,
    geometry:
      coordinates.length > 1
        ? {
            type: 'LineString',
            coordinates,
          }
        : {
            type: 'LineString',
            coordinates: orderedStops.map((stop) => [stop.lng, stop.lat] as [number, number]),
          },
  };
}

function optimizeTransitHeuristic(stops: TerritoryStop[]) {
  const legs = stops.slice(0, -1).map((stop, index) => {
    const next = stops[index + 1];
    const distance = distanceMeters(stop, next);
    const durationSeconds = Math.round((distance / 1000 / 19) * 3600 + 7 * 60);
    return {
      fromStopId: stop.id,
      toStopId: next.id,
      distanceMeters: distance,
      durationSeconds,
    };
  });

  return {
    mode: 'transit' as const,
    modeLabel: 'Public Transit',
    estimationModel: 'transit-heuristic' as const,
    orderedStopIds: stops.map((stop) => stop.id),
    totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    legs,
    geometry: {
      type: 'LineString' as const,
      coordinates: stops.map((stop) => [stop.lng, stop.lat] as [number, number]),
    },
  };
}

async function optimizeForMode(mode: RouteMode, stops: TerritoryStop[], optimize: boolean): Promise<TerritoryOptimizedRouteResponse> {
  if (mode === 'transit') {
    return optimizeTransitHeuristic(stops);
  }

  const optimizeCounted = optimize && stops.length > 3;
  const capacity = hasCapacity({ optimize: optimizeCounted });
  if (!capacity.ok) {
    return buildFallbackRoute(mode, stops, `${capacity.warning} Using fallback stop order.`);
  }

  try {
    const route = await computeGoogleRoute({
      mode: mode === 'bike' ? 'bike' : 'car',
      stops,
      optimize,
    });
    incrementUsage({ optimize: optimizeCounted });
    return route;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Routes failed';
    return buildFallbackRoute(mode, stops, `${message} Using fallback stop order.`);
  }
}

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const body = await request.json();
    const { mode, stops, optimize } = requestSchema.parse(body);
    const payload = await optimizeForMode(mode, stops, optimize);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid optimize route payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Route optimization failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
