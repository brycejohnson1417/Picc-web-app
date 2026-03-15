import 'server-only';

import { prisma } from '@/lib/db/prisma';
import type { TerritoryBoundary, TerritoryBoundaryCoordinates } from '@/lib/territory/types';

type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

function normalizeColor(value: string | null | undefined) {
  const candidate = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate.toLowerCase();
  }
  return '#ef4444';
}

function normalizeBorderWidth(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(12, Math.round(value)));
  }
  return 2;
}

function isFiniteLngLatPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function normalizeCoordinates(input: unknown): TerritoryBoundaryCoordinates {
  if (!Array.isArray(input)) {
    throw new Error('Boundary coordinates are required');
  }

  const normalized = input.filter(isFiniteLngLatPair).map((pair) => [pair[0], pair[1]] as [number, number]);
  if (normalized.length < 3) {
    throw new Error('A territory boundary needs at least 3 points');
  }

  const deduped = normalized.filter((pair, index) => {
    if (index === 0) return true;
    const previous = normalized[index - 1];
    return previous[0] !== pair[0] || previous[1] !== pair[1];
  });

  if (deduped.length < 3) {
    throw new Error('A territory boundary needs at least 3 distinct points');
  }

  return deduped;
}

function toGeoJsonPolygon(coordinates: TerritoryBoundaryCoordinates): GeoJsonPolygon {
  const ring = coordinates.map((pair) => [pair[0], pair[1]]);
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

function readCoordinatesFromGeoJson(value: unknown): TerritoryBoundaryCoordinates {
  const polygon = value as GeoJsonPolygon | null | undefined;
  const ring = Array.isArray(polygon?.coordinates?.[0]) ? polygon.coordinates[0] : [];
  const normalized = ring.filter(isFiniteLngLatPair).map((pair) => [pair[0], pair[1]] as [number, number]);

  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      normalized.pop();
    }
  }

  return normalized;
}

function mapBoundary(row: {
  id: string;
  name: string;
  description: string | null;
  color: string;
  borderWidth: number;
  isVisibleByDefault: boolean;
  geojson: unknown;
  createdByEmail: string | null;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TerritoryBoundary | null {
  const coordinates = readCoordinatesFromGeoJson(row.geojson);
  if (coordinates.length < 3) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: normalizeColor(row.color),
    borderWidth: normalizeBorderWidth(row.borderWidth),
    isVisibleByDefault: row.isVisibleByDefault,
    coordinates,
    createdByEmail: row.createdByEmail,
    updatedByEmail: row.updatedByEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTerritoryBoundaries(orgId: string) {
  const rows = await prisma.territory.findMany({
    where: { orgId },
    orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      borderWidth: true,
      isVisibleByDefault: true,
      geojson: true,
      createdByEmail: true,
      updatedByEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(mapBoundary).filter((boundary): boundary is TerritoryBoundary => Boolean(boundary));
}

export async function createTerritoryBoundary(input: {
  orgId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  borderWidth?: number | null;
  coordinates: unknown;
  isVisibleByDefault?: boolean;
  actorEmail?: string | null;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Boundary name is required');
  }

  const coordinates = normalizeCoordinates(input.coordinates);
  const row = await prisma.territory.create({
    data: {
      orgId: input.orgId,
      name,
      description: input.description?.trim() || null,
      color: normalizeColor(input.color),
      borderWidth: normalizeBorderWidth(input.borderWidth),
      isVisibleByDefault: input.isVisibleByDefault ?? true,
      geojson: toGeoJsonPolygon(coordinates),
      createdByEmail: input.actorEmail?.trim().toLowerCase() || null,
      updatedByEmail: input.actorEmail?.trim().toLowerCase() || null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      borderWidth: true,
      isVisibleByDefault: true,
      geojson: true,
      createdByEmail: true,
      updatedByEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const mapped = mapBoundary(row);
  if (!mapped) {
    throw new Error('Created boundary is invalid');
  }
  return mapped;
}

export async function updateTerritoryBoundary(input: {
  orgId: string;
  boundaryId: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  borderWidth?: number | null;
  coordinates?: unknown;
  isVisibleByDefault?: boolean;
  actorEmail?: string | null;
}) {
  const updateData: Record<string, unknown> = {};

  if (typeof input.name === 'string') {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Boundary name is required');
    }
    updateData.name = name;
  }

  if (input.description !== undefined) {
    updateData.description = input.description?.trim() || null;
  }

  if (input.color !== undefined) {
    updateData.color = normalizeColor(input.color);
  }

  if (input.borderWidth !== undefined) {
    updateData.borderWidth = normalizeBorderWidth(input.borderWidth);
  }

  if (input.coordinates !== undefined) {
    const coordinates = normalizeCoordinates(input.coordinates);
    updateData.geojson = toGeoJsonPolygon(coordinates);
  }

  if (input.isVisibleByDefault !== undefined) {
    updateData.isVisibleByDefault = input.isVisibleByDefault;
  }

  updateData.updatedByEmail = input.actorEmail?.trim().toLowerCase() || null;

  const row = await prisma.territory.updateMany({
    where: {
      id: input.boundaryId,
      orgId: input.orgId,
    },
    data: updateData,
  });

  if (row.count === 0) {
    throw new Error('Boundary not found');
  }

  const found = await prisma.territory.findFirst({
    where: {
      id: input.boundaryId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      borderWidth: true,
      isVisibleByDefault: true,
      geojson: true,
      createdByEmail: true,
      updatedByEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!found) {
    throw new Error('Boundary not found');
  }

  const mapped = mapBoundary(found);
  if (!mapped) {
    throw new Error('Updated boundary is invalid');
  }
  return mapped;
}

export async function deleteTerritoryBoundary(input: { orgId: string; boundaryId: string }) {
  const result = await prisma.territory.deleteMany({
    where: {
      id: input.boundaryId,
      orgId: input.orgId,
    },
  });

  if (result.count === 0) {
    throw new Error('Boundary not found');
  }
}
