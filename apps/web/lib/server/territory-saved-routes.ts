import 'server-only';

import type { RouteMode } from '@/lib/territory/types';
import { prisma } from '@/lib/db/prisma';

export interface TerritorySavedRouteRecord {
  id: string;
  name: string;
  stopIds: string[];
  createdAt: string;
  updatedAt: string;
  mode?: RouteMode;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

function ownerValues(input: { userId?: string | null; email: string }) {
  const values = [input.userId?.trim(), input.email.trim().toLowerCase()].filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

function normalizeMode(mode: string): RouteMode | undefined {
  return mode === 'car' || mode === 'bike' || mode === 'transit' ? mode : undefined;
}

function toSavedRouteRecord(route: {
  id: string;
  name: string;
  orderedStopIds: string[];
  createdAt: Date;
  updatedAt: Date;
  mode: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}): TerritorySavedRouteRecord {
  return {
    id: route.id,
    name: route.name,
    stopIds: route.orderedStopIds,
    createdAt: route.createdAt.toISOString(),
    updatedAt: route.updatedAt.toISOString(),
    mode: normalizeMode(route.mode),
    totalDistanceMeters: route.totalDistanceMeters,
    totalDurationSeconds: route.totalDurationSeconds,
  };
}

export async function listSavedRoutesForUser(input: {
  orgId: string;
  userId?: string | null;
  email: string;
}) {
  const createdBy = ownerValues(input);
  if (createdBy.length === 0) {
    return [] as TerritorySavedRouteRecord[];
  }

  const routes = await prisma.salesRoute.findMany({
    where: {
      orgId: input.orgId,
      createdBy: createdBy.length === 1 ? createdBy[0] : { in: createdBy },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return routes.map(toSavedRouteRecord);
}

export async function createSavedRouteForUser(input: {
  orgId: string;
  userId?: string | null;
  email: string;
  name: string;
  mode: RouteMode;
  stopIds: string[];
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
}) {
  const route = await prisma.salesRoute.create({
    data: {
      orgId: input.orgId,
      createdBy: input.userId?.trim() || input.email.trim().toLowerCase(),
      name: input.name.trim(),
      mode: input.mode,
      orderedStopIds: input.stopIds,
      totalDistanceMeters: input.totalDistanceMeters ?? 0,
      totalDurationSeconds: input.totalDurationSeconds ?? 0,
    },
  });

  return toSavedRouteRecord(route);
}

export async function deleteSavedRouteForUser(input: {
  orgId: string;
  routeId: string;
  userId?: string | null;
  email: string;
}) {
  const createdBy = ownerValues(input);
  if (createdBy.length === 0) {
    return false;
  }

  const result = await prisma.salesRoute.deleteMany({
    where: {
      id: input.routeId,
      orgId: input.orgId,
      createdBy: createdBy.length === 1 ? createdBy[0] : { in: createdBy },
    },
  });

  return result.count > 0;
}
