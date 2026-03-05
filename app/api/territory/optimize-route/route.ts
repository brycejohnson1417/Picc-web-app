import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { enforceRateLimit, getClientIdentifier } from '@/lib/server/rate-limit';
import type { RouteMode, TerritoryOptimizedRouteResponse } from '@/lib/territory/types';

export const dynamic = 'force-dynamic';

const stopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
});

const requestSchema = z.object({
  mode: z.enum(['car', 'bike', 'transit']),
  stops: z.array(stopSchema).min(2).max(25),
});

type TerritoryStop = z.infer<typeof stopSchema>;
type OsrmProfile = 'driving' | 'cycling';

type OsrmGeometry = {
  type?: string;
  coordinates?: [number, number][];
};

type OsrmLeg = {
  distance?: number;
  duration?: number;
};

type OsrmRouteResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    legs?: OsrmLeg[];
    geometry?: OsrmGeometry;
  }>;
};

type OsrmTripResponse = {
  code?: string;
  message?: string;
  trips?: Array<{
    distance?: number;
    duration?: number;
    legs?: OsrmLeg[];
    geometry?: OsrmGeometry;
  }>;
  waypoints?: Array<{
    waypoint_index: number;
  }>;
};

type OsrmTableResponse = {
  code?: string;
  message?: string;
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
};

function asLineGeometry(geometry: OsrmGeometry | undefined): TerritoryOptimizedRouteResponse['geometry'] {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const coordinates = geometry.coordinates
    .filter((point): point is [number, number] => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map((point) => [point[0], point[1]] as [number, number]);

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: 'LineString',
    coordinates,
  };
}

function formatCoord(stop: { lng: number; lat: number }) {
  return `${stop.lng},${stop.lat}`;
}

function profileForMode(mode: RouteMode): OsrmProfile {
  if (mode === 'bike') return 'cycling';
  return 'driving';
}

async function fetchOsrmJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json()) as T & { code?: string; message?: string };

  if (!response.ok || payload?.code !== 'Ok') {
    throw new Error(`OSRM request failed: ${payload?.message ?? response.statusText}`);
  }

  return payload as T;
}

async function fetchTrip(profile: OsrmProfile, stops: TerritoryStop[]) {
  const coordinates = stops.map(formatCoord).join(';');
  const url = `https://router.project-osrm.org/trip/v1/${profile}/${coordinates}?source=first&destination=last&roundtrip=false&steps=true&overview=full&geometries=geojson`;
  const payload = await fetchOsrmJson<OsrmTripResponse>(url);
  const trip = payload.trips?.[0];
  const waypoints = Array.isArray(payload.waypoints) ? payload.waypoints : [];

  if (!trip || waypoints.length !== stops.length) {
    throw new Error('OSRM optimization response malformed');
  }

  const orderedStops: TerritoryStop[] = waypoints
    .map((waypoint, inputIndex) => ({ waypoint, inputIndex }))
    .sort((a, b) => a.waypoint.waypoint_index - b.waypoint.waypoint_index)
    .map((item) => stops[item.inputIndex]);

  const legs = (trip.legs ?? []).map((leg, index) => ({
    fromStopId: orderedStops[index]?.id ?? '',
    toStopId: orderedStops[index + 1]?.id ?? '',
    distanceMeters: Math.round(leg.distance ?? 0),
    durationSeconds: Math.round(leg.duration ?? 0),
  }));

  return {
    orderedStops,
    totalDistanceMeters: Math.round(trip.distance ?? 0),
    totalDurationSeconds: Math.round(trip.duration ?? 0),
    legs,
    geometry: asLineGeometry(trip.geometry),
  };
}

async function fetchRoute(profile: OsrmProfile, stops: TerritoryStop[]) {
  const coordinates = stops.map(formatCoord).join(';');
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?steps=true&overview=full&geometries=geojson`;
  const payload = await fetchOsrmJson<OsrmRouteResponse>(url);
  const route = payload.routes?.[0];

  if (!route) {
    throw new Error('OSRM route payload missing');
  }

  return {
    totalDistanceMeters: Math.round(route.distance ?? 0),
    totalDurationSeconds: Math.round(route.duration ?? 0),
    routeLegs: route.legs ?? [],
    geometry: asLineGeometry(route.geometry),
  };
}

async function fetchTable(profile: OsrmProfile, stops: TerritoryStop[]) {
  const coordinates = stops.map(formatCoord).join(';');
  const url = `https://router.project-osrm.org/table/v1/${profile}/${coordinates}?annotations=duration,distance`;
  const payload = await fetchOsrmJson<OsrmTableResponse>(url);

  if (!Array.isArray(payload.durations) || !Array.isArray(payload.distances)) {
    throw new Error('OSRM matrix response malformed');
  }

  return {
    durations: payload.durations,
    distances: payload.distances,
  };
}

function estimateTransitDurationSeconds(drivingDuration: number | null, distanceMeters: number | null) {
  if (typeof drivingDuration === 'number' && Number.isFinite(drivingDuration) && drivingDuration > 0) {
    return Math.round(drivingDuration * 1.75 + 7 * 60);
  }

  if (typeof distanceMeters === 'number' && Number.isFinite(distanceMeters) && distanceMeters > 0) {
    // Rough 19 km/h door-to-door with transfer overhead.
    return Math.round((distanceMeters / 1000 / 19) * 3600 + 7 * 60);
  }

  return 12 * 60;
}

function totalCost(order: number[], matrix: number[][]) {
  let sum = 0;
  for (let i = 0; i < order.length - 1; i += 1) {
    sum += matrix[order[i]][order[i + 1]];
  }
  return sum;
}

function optimizeOrderWithFixedEndpoints(matrix: number[][]) {
  const n = matrix.length;
  if (n <= 2) return [0, 1];

  const destination = n - 1;
  const unvisited = new Set<number>();
  for (let i = 1; i < destination; i += 1) {
    unvisited.add(i);
  }

  const order: number[] = [0];
  let current = 0;

  while (unvisited.size > 0) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of unvisited) {
      const score = matrix[current][candidate] + matrix[candidate][destination] * 0.05;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = candidate;
      }
    }

    if (bestIndex < 0) {
      break;
    }

    order.push(bestIndex);
    unvisited.delete(bestIndex);
    current = bestIndex;
  }

  order.push(destination);

  // 2-opt refinement keeping first and last fixed.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < order.length - 2; i += 1) {
      for (let j = i + 1; j < order.length - 1; j += 1) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (totalCost(candidate, matrix) + 1 < totalCost(order, matrix)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return order;
}

async function optimizeForMode(mode: RouteMode, stops: TerritoryStop[]): Promise<TerritoryOptimizedRouteResponse> {
  if (mode !== 'transit') {
    const profile = profileForMode(mode);
    const trip = await fetchTrip(profile, stops);

    return {
      mode,
      modeLabel: mode === 'bike' ? 'Bike' : 'Driving',
      estimationModel: 'osrm',
      orderedStopIds: trip.orderedStops.map((stop) => stop.id),
      totalDistanceMeters: trip.totalDistanceMeters,
      totalDurationSeconds: trip.totalDurationSeconds,
      legs: trip.legs,
      geometry: trip.geometry,
    };
  }

  // Transit optimization uses a transit-time heuristic over an OSRM road matrix.
  const drivingMatrix = await fetchTable('driving', stops);
  const transitMatrix = drivingMatrix.durations.map((row, fromIndex) =>
    row.map((drivingDuration, toIndex) =>
      estimateTransitDurationSeconds(drivingDuration, drivingMatrix.distances[fromIndex]?.[toIndex] ?? null),
    ),
  );

  const orderIndexes = optimizeOrderWithFixedEndpoints(transitMatrix);
  const orderedStops = orderIndexes.map((index) => stops[index]);

  const route = await fetchRoute('driving', orderedStops);

  const legs = orderedStops.slice(0, -1).map((stop, index) => {
    const fromMatrixIndex = orderIndexes[index];
    const toMatrixIndex = orderIndexes[index + 1];

    return {
      fromStopId: stop.id,
      toStopId: orderedStops[index + 1]?.id ?? '',
      distanceMeters: Math.round(drivingMatrix.distances[fromMatrixIndex]?.[toMatrixIndex] ?? route.routeLegs[index]?.distance ?? 0),
      durationSeconds: Math.round(transitMatrix[fromMatrixIndex]?.[toMatrixIndex] ?? 0),
    };
  });

  return {
    mode,
    modeLabel: 'Public Transit',
    estimationModel: 'transit-heuristic',
    orderedStopIds: orderedStops.map((stop) => stop.id),
    totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    legs,
    geometry: route.geometry,
  };
}

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const clientKey = getClientIdentifier(request, access.email);
  const limit = enforceRateLimit({
    key: `territory-optimize:${access.orgId}:${clientKey}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await request.json();
    const { mode, stops } = requestSchema.parse(body);

    const payload = await optimizeForMode(mode, stops);
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
