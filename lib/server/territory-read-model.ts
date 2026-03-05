import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { normalizeStatus, type TerritoryFilterCount, type TerritoryStorePin } from '@/lib/territory/types';

const DEFAULT_ORG_ID = process.env.TERRITORY_ORG_ID?.trim() || null;

export type TerritoryLayerMetric = 'interactions' | 'purchases' | 'follow_up';
export type TerritoryLayerMode = 'pins' | 'heatmap' | 'hex';

export interface TerritoryFilterPresetInput {
  name: string;
  search: string;
  selectedStatuses: string[];
  selectedReps: string[];
  showRouteOnly: boolean;
  pinColorMode: 'status' | 'rep';
}

export interface TerritoryLayerFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function metricForStore(store: TerritoryStorePin, checkInCount: number, purchaseScore: number) {
  const interactionsScore = checkInCount > 0 ? checkInCount : store.lastCheckIn ? 1 : 0;

  const followUpDate = asDate(store.followUpDate);
  let followUpUrgencyScore = 0;
  if (followUpDate) {
    const daysUntil = Math.ceil((followUpDate.getTime() - Date.now()) / 86_400_000);
    followUpUrgencyScore = Math.max(0, 14 - daysUntil);
  }

  return {
    interactionsScore,
    purchasesScore: Math.max(0, purchaseScore),
    followUpUrgencyScore,
  };
}

function metricValue(pin: TerritoryStorePin, metric: TerritoryLayerMetric) {
  if (metric === 'interactions') return pin.metrics?.interactionsScore ?? 0;
  if (metric === 'purchases') return pin.metrics?.purchasesScore ?? 0;
  return pin.metrics?.followUpUrgencyScore ?? 0;
}

async function getPurchaseScoreByKey(orgId: string) {
  const rows = await prisma.nabisOrder.findMany({
    where: { orgId },
    select: {
      licensedLocationId: true,
      licensedLocationName: true,
      orderTotal: true,
      deliveryDate: true,
    },
  });

  const scores = new Map<string, number>();

  for (const row of rows) {
    const when = row.deliveryDate ?? null;
    if (when) {
      const ageDays = (Date.now() - when.getTime()) / 86_400_000;
      if (ageDays > 120) {
        continue;
      }
    }

    const total = row.orderTotal ? Number(row.orderTotal) : 0;
    const points = Math.max(1, Math.round(total / 1000));

    const keys = [row.licensedLocationId, row.licensedLocationName]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => normalizeKey(value));

    for (const key of keys) {
      scores.set(key, (scores.get(key) ?? 0) + points);
    }
  }

  return scores;
}

function matchRepFilter(store: TerritoryStorePin, filterSet: Set<string>) {
  if (filterSet.size === 0) return true;

  const labels = new Set<string>();
  for (const rep of store.repNames) labels.add(rep.toLowerCase());
  for (const email of store.repEmails) labels.add(email.toLowerCase());
  if (labels.size === 0) labels.add('unassigned');

  for (const value of filterSet) {
    if (labels.has(value)) return true;
  }

  return false;
}

function hydrateSearch(store: TerritoryStorePin) {
  return [
    store.name,
    store.locationAddress ?? '',
    store.city ?? '',
    store.state ?? '',
    store.status,
    store.repNames.join(' '),
    store.email ?? '',
    store.phoneNumber ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function orgIdOrDefault(orgId?: string) {
  const clean = orgId?.trim();
  if (clean) return clean;
  if (DEFAULT_ORG_ID) return DEFAULT_ORG_ID;
  throw new Error('Territory org context is required');
}

function toPin(record: {
  id: string;
  notionPageId: string;
  name: string;
  status: string;
  statusKey: string;
  statusColor: string;
  pinKind: string;
  repNames: string[];
  repEmails: string[];
  lat: number;
  lng: number;
  locationLabel: string | null;
  locationAddress: string | null;
  locationSource: string;
  lastEditedTime: Date;
  licenseNumber: string | null;
  city: string | null;
  state: string | null;
  daysOverdue: number | null;
  phoneNumber: string | null;
  email: string | null;
  followUpDate: Date | null;
  notes: string | null;
  lastCheckIn: Date | null;
  interactionsScore: number;
  purchasesScore: number;
  followUpUrgencyScore: number;
}): TerritoryStorePin {
  return {
    id: record.id,
    notionPageId: record.notionPageId,
    name: record.name,
    status: record.status,
    statusKey: record.statusKey,
    statusColor: record.statusColor,
    pinKind: (record.pinKind as TerritoryStorePin['pinKind']) ?? 'other',
    repNames: record.repNames,
    repEmails: record.repEmails,
    lat: record.lat,
    lng: record.lng,
    locationLabel: record.locationLabel,
    locationAddress: record.locationAddress,
    locationSource: (record.locationSource as TerritoryStorePin['locationSource']) ?? 'nominatim-cache',
    lastEditedTime: record.lastEditedTime.toISOString(),
    licenseNumber: record.licenseNumber,
    city: record.city,
    state: record.state,
    daysOverdue: record.daysOverdue,
    phoneNumber: record.phoneNumber,
    email: record.email,
    followUpDate: record.followUpDate ? record.followUpDate.toISOString() : null,
    notes: record.notes,
    lastCheckIn: record.lastCheckIn ? record.lastCheckIn.toISOString() : null,
    geometry: {
      type: 'Point',
      coordinates: [record.lng, record.lat],
    },
    metrics: {
      interactionsScore: Number(record.interactionsScore ?? 0),
      purchasesScore: Number(record.purchasesScore ?? 0),
      followUpUrgencyScore: Number(record.followUpUrgencyScore ?? 0),
    },
  };
}

export async function syncTerritoryStoresReadModel(stores: TerritoryStorePin[], input?: { orgId?: string }) {
  const orgId = orgIdOrDefault(input?.orgId);
  const purchaseScoreByKey = await getPurchaseScoreByKey(orgId);

  const checkIns = await prisma.checkIn.groupBy({
    by: ['storeId'],
    where: {
      orgId,
      storeId: {
        in: stores.map((store) => store.id),
      },
    },
    _count: {
      storeId: true,
    },
  });

  const checkInCountByStore = new Map<string, number>();
  for (const row of checkIns) {
    if (!row.storeId) continue;
    checkInCountByStore.set(row.storeId, row._count.storeId);
  }

  const rows = stores.map((store) => {
    const checkInCount = checkInCountByStore.get(store.id) ?? 0;
    const purchaseScore =
      purchaseScoreByKey.get(normalizeKey(store.licenseNumber ?? '')) ??
      purchaseScoreByKey.get(normalizeKey(store.name)) ??
      0;

    const metrics = metricForStore(store, checkInCount, purchaseScore);

    return {
      id: store.id,
      orgId,
      notionPageId: store.notionPageId,
      name: store.name,
      status: store.status,
      statusKey: store.statusKey,
      statusColor: store.statusColor,
      pinKind: store.pinKind,
      repNames: store.repNames,
      repEmails: store.repEmails,
      lat: store.lat,
      lng: store.lng,
      locationLabel: store.locationLabel,
      locationAddress: store.locationAddress,
      locationSource: store.locationSource,
      lastEditedTime: new Date(store.lastEditedTime),
      licenseNumber: store.licenseNumber ?? null,
      city: store.city ?? null,
      state: store.state ?? null,
      daysOverdue: typeof store.daysOverdue === 'number' ? Math.trunc(store.daysOverdue) : null,
      phoneNumber: store.phoneNumber ?? null,
      email: store.email ?? null,
      followUpDate: store.followUpDate ? new Date(store.followUpDate) : null,
      notes: store.notes ?? null,
      lastCheckIn: store.lastCheckIn ? new Date(store.lastCheckIn) : null,
      interactionsScore: metrics.interactionsScore,
      purchasesScore: metrics.purchasesScore,
      followUpUrgencyScore: metrics.followUpUrgencyScore,
    };
  });

  await prisma.$transaction([
    prisma.territoryStoreReadModel.deleteMany({ where: { orgId } }),
    prisma.territoryStoreReadModel.createMany({ data: rows }),
  ]);

  await prisma.$executeRawUnsafe(
    `UPDATE "TerritoryStoreReadModel" SET "geoPoint" = ST_SetSRID(ST_MakePoint("lng", "lat"), 4326) WHERE "orgId" = $1`,
    orgId,
  );

  for (const row of rows) {
    const accountWhere = row.licenseNumber
      ? {
          orgId,
          OR: [{ licenseNumber: row.licenseNumber }, { name: row.name }],
        }
      : {
          orgId,
          name: row.name,
        };

    const account = await prisma.account.findFirst({
      where: accountWhere,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, notionPageId: true },
    });

    if (!account) {
      continue;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: {
        geoLat: row.lat,
        geoLng: row.lng,
        notionPageId: account.notionPageId && account.notionPageId !== row.notionPageId ? account.notionPageId : row.notionPageId,
      },
    });
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "Account" SET "geoPoint" = ST_SetSRID(ST_MakePoint("geoLng", "geoLat"), 4326) WHERE "orgId" = $1 AND "geoLat" IS NOT NULL AND "geoLng" IS NOT NULL`,
    orgId,
  );

  return {
    count: rows.length,
    orgId,
  };
}

export async function loadTerritoryStoresFromReadModel(input: {
  statuses?: string[];
  reps?: string[];
  query?: string;
  orgId?: string;
}) {
  const orgId = orgIdOrDefault(input.orgId);
  const records = await prisma.territoryStoreReadModel.findMany({
    where: { orgId },
    orderBy: { name: 'asc' },
  });

  const pins = records.map((row) =>
    toPin({
      ...row,
      locationLabel: row.locationLabel,
      locationAddress: row.locationAddress,
      licenseNumber: row.licenseNumber,
      city: row.city,
      state: row.state,
      daysOverdue: row.daysOverdue,
      phoneNumber: row.phoneNumber,
      email: row.email,
      followUpDate: row.followUpDate,
      notes: row.notes,
      lastCheckIn: row.lastCheckIn,
    }),
  );

  const statusCounts = new Map<string, number>();
  const repCounts = new Map<string, number>();

  for (const pin of pins) {
    statusCounts.set(pin.status, (statusCounts.get(pin.status) ?? 0) + 1);
    if (pin.repNames.length === 0 && pin.repEmails.length === 0) {
      repCounts.set('Unassigned', (repCounts.get('Unassigned') ?? 0) + 1);
      continue;
    }
    for (const rep of pin.repNames) {
      repCounts.set(rep, (repCounts.get(rep) ?? 0) + 1);
    }
  }

  const statusFilter = new Set((input.statuses ?? []).map((value) => normalizeStatus(value)));
  const repFilter = new Set((input.reps ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const q = input.query?.trim().toLowerCase() ?? '';

  const filteredStores = pins.filter((pin) => {
    if (statusFilter.size > 0 && !statusFilter.has(pin.statusKey)) {
      return false;
    }

    if (!matchRepFilter(pin, repFilter)) {
      return false;
    }

    if (q && !hydrateSearch(pin).includes(q)) {
      return false;
    }

    return true;
  });

  const statuses: TerritoryFilterCount[] = [...statusCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));

  const reps: TerritoryFilterCount[] = [...repCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));

  return {
    stores: filteredStores,
    filters: {
      statuses,
      reps,
    },
    recordsRead: pins.length,
  };
}

export async function loadTerritoryStoreFromReadModel(storeId: string, input?: { orgId?: string }) {
  const orgId = orgIdOrDefault(input?.orgId);
  const row = await prisma.territoryStoreReadModel.findFirst({
    where: {
      orgId,
      OR: [{ id: storeId }, { notionPageId: storeId }],
    },
  });

  if (!row) {
    return null;
  }

  return toPin({
    ...row,
    locationLabel: row.locationLabel,
    locationAddress: row.locationAddress,
    licenseNumber: row.licenseNumber,
    city: row.city,
    state: row.state,
    daysOverdue: row.daysOverdue,
    phoneNumber: row.phoneNumber,
    email: row.email,
    followUpDate: row.followUpDate,
    notes: row.notes,
    lastCheckIn: row.lastCheckIn,
  });
}

export async function patchTerritoryStoreReadModel(
  storeId: string,
  input: { notes?: string | null; lastCheckIn?: string | null; followUpDate?: string | null; orgId?: string },
) {
  const orgId = orgIdOrDefault(input.orgId);
  const record = await prisma.territoryStoreReadModel.findFirst({
    where: {
      orgId,
      OR: [{ id: storeId }, { notionPageId: storeId }],
    },
    select: { id: true },
  });

  if (!record) {
    return;
  }

  await prisma.territoryStoreReadModel.update({
    where: { id: record.id },
    data: {
      ...(Object.prototype.hasOwnProperty.call(input, 'notes') ? { notes: input.notes ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'lastCheckIn')
        ? { lastCheckIn: input.lastCheckIn ? new Date(input.lastCheckIn) : null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'followUpDate')
        ? { followUpDate: input.followUpDate ? new Date(input.followUpDate) : null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'lastCheckIn') ? { interactionsScore: { increment: 1 } } : {}),
    },
  });
}

export async function recordTerritoryCheckInEvent(input: {
  storeId: string;
  contactId?: string | null;
  noteText?: string | null;
  mode?: string | null;
  associatedContactName?: string | null;
  associatedContactRole?: string | null;
  associatedContactEmail?: string | null;
  associatedContactPhone?: string | null;
  notionNoteUrl?: string | null;
  lat?: number;
  lng?: number;
  mileageMiles?: number | null;
  photoUrls?: string[];
  createdByEmail?: string | null;
  happenedAt: string;
  orgId?: string;
}) {
  const orgId = orgIdOrDefault(input.orgId);
  const checkIn = await prisma.checkIn.create({
    data: {
      orgId,
      storeId: input.storeId,
      contactId: input.contactId ?? null,
      noteText: input.noteText ?? null,
      mode: input.mode ?? null,
      associatedContactName: input.associatedContactName ?? null,
      associatedContactRole: input.associatedContactRole ?? null,
      associatedContactEmail: input.associatedContactEmail ?? null,
      associatedContactPhone: input.associatedContactPhone ?? null,
      notionNoteUrl: input.notionNoteUrl ?? null,
      geoLat: typeof input.lat === 'number' ? input.lat : null,
      geoLng: typeof input.lng === 'number' ? input.lng : null,
      mileageMiles: input.mileageMiles ?? null,
      photoUrls: input.photoUrls ?? [],
      createdByEmail: input.createdByEmail ?? null,
      happenedAt: new Date(input.happenedAt),
    },
  });

  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    await prisma.$executeRawUnsafe(
      `UPDATE "CheckIn" SET "geoPoint" = ST_SetSRID(ST_MakePoint("geoLng", "geoLat"), 4326) WHERE "id" = $1`,
      checkIn.id,
    );
  }

  return checkIn;
}

export async function loadTerritoryLayers(input: {
  metric: TerritoryLayerMetric;
  mode: TerritoryLayerMode;
  statuses?: string[];
  reps?: string[];
  query?: string;
  orgId?: string;
}) {
  const storesResult = await loadTerritoryStoresFromReadModel(input);
  const pins = storesResult.stores;

  if (input.mode === 'pins' || input.mode === 'heatmap') {
    const features: TerritoryLayerFeature[] = pins.map((pin) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [pin.lng, pin.lat],
      },
      properties: {
        id: pin.id,
        name: pin.name,
        status: pin.status,
        weight: metricValue(pin, input.metric),
      },
    }));

    return {
      type: 'FeatureCollection' as const,
      mode: input.mode,
      metric: input.metric,
      features,
      count: features.length,
    };
  }

  const buckets = new Map<string, { lat: number; lng: number; weight: number; count: number }>();
  for (const pin of pins) {
    const latBucket = Math.round(pin.lat * 50) / 50;
    const lngBucket = Math.round(pin.lng * 50) / 50;
    const key = `${latBucket}:${lngBucket}`;
    const current = buckets.get(key) ?? { lat: latBucket, lng: lngBucket, weight: 0, count: 0 };
    current.weight += metricValue(pin, input.metric);
    current.count += 1;
    buckets.set(key, current);
  }

  const features: TerritoryLayerFeature[] = [...buckets.values()].map((bucket) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [bucket.lng, bucket.lat],
    },
    properties: {
      count: bucket.count,
      weight: bucket.weight,
    },
  }));

  return {
    type: 'FeatureCollection' as const,
    mode: input.mode,
    metric: input.metric,
    features,
    count: features.length,
  };
}

export async function listTerritoryFilterPresets(ownerEmail: string, input?: { orgId?: string }) {
  const orgId = orgIdOrDefault(input?.orgId);

  return prisma.territoryFilterPreset.findMany({
    where: {
      orgId,
      ownerEmail: ownerEmail.toLowerCase(),
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function upsertTerritoryFilterPreset(ownerEmail: string, payload: TerritoryFilterPresetInput, input?: { orgId?: string }) {
  const orgId = orgIdOrDefault(input?.orgId);

  const normalized = {
    name: payload.name.trim(),
    search: payload.search.trim(),
    selectedStatuses: payload.selectedStatuses.map((value) => value.trim()).filter(Boolean),
    selectedReps: payload.selectedReps.map((value) => value.trim()).filter(Boolean),
    showRouteOnly: payload.showRouteOnly,
    pinColorMode: payload.pinColorMode,
  };

  return prisma.territoryFilterPreset.upsert({
    where: {
      orgId_ownerEmail_name: {
        orgId,
        ownerEmail: ownerEmail.toLowerCase(),
        name: normalized.name,
      },
    },
    create: {
      orgId,
      ownerEmail: ownerEmail.toLowerCase(),
      ...normalized,
    },
    update: {
      ...normalized,
    },
  });
}
