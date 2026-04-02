import 'server-only';

import type { TerritoryMarker } from '@/lib/territory/types';
import { prisma } from '@/lib/db/prisma';

function normalizeColor(value: string | null | undefined) {
  const candidate = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate.toLowerCase();
  }
  return '#0f172a';
}

function mapMarker(row: {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  lat: number;
  lng: number;
  color: string;
  kind: string;
  isVisibleByDefault: boolean;
  createdByEmail: string | null;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TerritoryMarker {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    color: normalizeColor(row.color),
    kind: 'home',
    isVisibleByDefault: row.isVisibleByDefault,
    createdByEmail: row.createdByEmail,
    updatedByEmail: row.updatedByEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTerritoryMarkers(orgId: string) {
  const rows = await prisma.territoryMarker.findMany({
    where: { orgId },
    orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      lat: true,
      lng: true,
      color: true,
      kind: true,
      isVisibleByDefault: true,
      createdByEmail: true,
      updatedByEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(mapMarker);
}

export async function createTerritoryMarker(input: {
  orgId: string;
  name: string;
  description?: string | null;
  address?: string | null;
  lat: number;
  lng: number;
  color?: string | null;
  isVisibleByDefault?: boolean;
  actorEmail?: string | null;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Marker name is required');
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new Error('Marker coordinates are required');
  }

  const row = await prisma.territoryMarker.create({
    data: {
      orgId: input.orgId,
      name,
      description: input.description?.trim() || null,
      address: input.address?.trim() || null,
      lat: input.lat,
      lng: input.lng,
      color: normalizeColor(input.color),
      kind: 'home',
      isVisibleByDefault: input.isVisibleByDefault ?? true,
      createdByEmail: input.actorEmail?.trim().toLowerCase() || null,
      updatedByEmail: input.actorEmail?.trim().toLowerCase() || null,
    },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      lat: true,
      lng: true,
      color: true,
      kind: true,
      isVisibleByDefault: true,
      createdByEmail: true,
      updatedByEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return mapMarker(row);
}

export async function updateTerritoryMarker(input: {
  orgId: string;
  markerId: string;
  name?: string;
  description?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
  color?: string | null;
  isVisibleByDefault?: boolean;
  actorEmail?: string | null;
}) {
  const updateData: Record<string, unknown> = {};

  if (typeof input.name === 'string') {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Marker name is required');
    }
    updateData.name = name;
  }
  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.address !== undefined) updateData.address = input.address?.trim() || null;
  if (input.lat !== undefined) updateData.lat = input.lat;
  if (input.lng !== undefined) updateData.lng = input.lng;
  if (input.color !== undefined) updateData.color = normalizeColor(input.color);
  if (input.isVisibleByDefault !== undefined) updateData.isVisibleByDefault = input.isVisibleByDefault;
  updateData.updatedByEmail = input.actorEmail?.trim().toLowerCase() || null;

  const updateResult = await prisma.territoryMarker.updateMany({
    where: {
      id: input.markerId,
      orgId: input.orgId,
    },
    data: updateData,
  });

  if (updateResult.count === 0) {
    throw new Error('Marker not found');
  }

  const row = await prisma.territoryMarker.findFirst({
    where: {
      id: input.markerId,
      orgId: input.orgId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      lat: true,
      lng: true,
      color: true,
      kind: true,
      isVisibleByDefault: true,
      createdByEmail: true,
      updatedByEmail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) {
    throw new Error('Marker not found');
  }
  return mapMarker(row);
}

export async function deleteTerritoryMarker(input: { orgId: string; markerId: string }) {
  const result = await prisma.territoryMarker.deleteMany({
    where: {
      id: input.markerId,
      orgId: input.orgId,
    },
  });

  if (result.count === 0) {
    throw new Error('Marker not found');
  }
}
