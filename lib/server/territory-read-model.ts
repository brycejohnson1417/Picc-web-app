import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID } from '@/lib/config/runtime';
import { normalizeStatus, type TerritoryFilterCount, type TerritoryStorePin } from '@/lib/territory/types';

const CONFIGURED_ORG_ID = process.env.TERRITORY_ORG_ID?.trim() ?? '';
const TERRITORY_HOME_STATE = (process.env.TERRITORY_HOME_STATE?.trim().toUpperCase() || 'NY');

const TERRITORY_BOUNDS_BY_STATE: Partial<Record<string, { latMin: number; latMax: number; lngMin: number; lngMax: number }>> = {
  NY: { latMin: 40.4, latMax: 45.2, lngMin: -79.9, lngMax: -71.7 },
};

export interface TerritoryFilterPresetInput {
  name: string;
  search: string;
  selectedStatuses: string[];
  selectedReps: string[];
  showRouteOnly: boolean;
  pinColorMode: 'status' | 'rep';
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

function sameNullableNumber(left: number | null | undefined, right: number | null | undefined) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(left - right) < 0.000001;
}

function isWithinTerritoryBounds(store: TerritoryStorePin) {
  const bounds = TERRITORY_BOUNDS_BY_STATE[TERRITORY_HOME_STATE];
  if (!bounds) {
    return true;
  }
  return (
    Number.isFinite(store.lat) &&
    Number.isFinite(store.lng) &&
    store.lat >= bounds.latMin &&
    store.lat <= bounds.latMax &&
    store.lng >= bounds.lngMin &&
    store.lng <= bounds.lngMax
  );
}

function isInHomeTerritory(store: TerritoryStorePin) {
  if (store.locationPrecision === 'unavailable') {
    return true;
  }
  if (store.state?.trim()) {
    return store.state.trim().toUpperCase() === TERRITORY_HOME_STATE;
  }
  return isWithinTerritoryBounds(store);
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
  if (clean) {
    return clean;
  }
  if (CONFIGURED_ORG_ID) {
    return CONFIGURED_ORG_ID;
  }
  if (AUTH_BYPASS_MODE) {
    return DEMO_ORG_ID;
  }
  throw new Error('TERRITORY_ORG_ID is required for territory read-model operations');
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
  locationPrecision: string;
  isApproximate: boolean;
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
    locationSource: (record.locationSource as TerritoryStorePin['locationSource']) ?? 'google-address-cache',
    locationPrecision: (record.locationPrecision as TerritoryStorePin['locationPrecision']) ?? 'address',
    isApproximate: Boolean(record.isApproximate),
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

function isMissingColumnError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('does not exist');
}

function buildTerritoryReadModelRow(
  store: TerritoryStorePin,
  orgId: string,
  input: {
    checkInCount: number;
    purchaseScore: number;
  },
) {
  const metrics = metricForStore(store, input.checkInCount, input.purchaseScore);

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
    locationPrecision: store.locationPrecision,
    isApproximate: store.isApproximate,
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
}

async function syncMatchedAccountForStoreRow(
  row: ReturnType<typeof buildTerritoryReadModelRow>,
  orgId: string,
) {
  const matchedAccount = await prisma.account.findFirst({
    where: {
      orgId,
      OR: [
        row.licenseNumber?.trim() ? { licenseNumber: row.licenseNumber } : undefined,
        row.name.trim() ? { name: row.name } : undefined,
      ].filter(Boolean) as Prisma.AccountWhereInput[],
    },
    select: {
      id: true,
      notionPageId: true,
      geoLat: true,
      geoLng: true,
    },
  });

  if (!matchedAccount) {
    return;
  }

  if (
    matchedAccount.notionPageId === row.notionPageId &&
    sameNullableNumber(matchedAccount.geoLat, row.lat) &&
    sameNullableNumber(matchedAccount.geoLng, row.lng)
  ) {
    return;
  }

  await prisma.account.update({
    where: { id: matchedAccount.id },
    data: {
      notionPageId: row.notionPageId,
      geoLat: row.lat,
      geoLng: row.lng,
    },
  });
}

export function filterTerritoryPins(
  pins: TerritoryStorePin[],
  input: {
    statuses?: string[];
    reps?: string[];
    query?: string;
    locationAvailability?: 'all' | 'available' | 'unavailable';
  },
) {
  const pinsInTerritory = pins.filter(isInHomeTerritory);
  const statusCounts = new Map<string, number>();
  const repCounts = new Map<string, number>();

  for (const pin of pinsInTerritory) {
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
  const locationAvailability = input.locationAvailability ?? 'all';
  const q = input.query?.trim().toLowerCase() ?? '';

  const filteredStores = pinsInTerritory.filter((pin) => {
    if (statusFilter.size > 0 && !statusFilter.has(pin.statusKey)) {
      return false;
    }

    if (!matchRepFilter(pin, repFilter)) {
      return false;
    }

    if (q && !hydrateSearch(pin).includes(q)) {
      return false;
    }

    if (locationAvailability === 'available' && pin.locationPrecision === 'unavailable') {
      return false;
    }

    if (locationAvailability === 'unavailable' && pin.locationPrecision !== 'unavailable') {
      return false;
    }

    return true;
  });

  const unavailableCount = pinsInTerritory.filter((pin) => pin.locationPrecision === 'unavailable').length;
  const availableCount = Math.max(0, pinsInTerritory.length - unavailableCount);

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
      locationAvailability: [
        { value: 'Available location', count: availableCount },
        { value: 'Unavailable location', count: unavailableCount },
      ],
    },
    recordsRead: pinsInTerritory.length,
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

  const rows = stores.map((store) =>
    buildTerritoryReadModelRow(store, orgId, {
      checkInCount: checkInCountByStore.get(store.id) ?? 0,
      purchaseScore:
        purchaseScoreByKey.get(normalizeKey(store.licenseNumber ?? '')) ??
        purchaseScoreByKey.get(normalizeKey(store.name)) ??
        0,
    }),
  );

  const dedupedRows = [...new Map(rows.map((row) => [row.id, row])).values()];

  try {
    await prisma.$transaction([
      prisma.territoryStoreReadModel.deleteMany({ where: { orgId } }),
      prisma.territoryStoreReadModel.createMany({ data: dedupedRows, skipDuplicates: true }),
    ]);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    console.warn('territory_read_model_legacy_write_fallback', {
      message: error instanceof Error ? error.message : String(error),
    });

    const legacyRows = dedupedRows.map((row) => ({
      ...row,
      locationPrecision: undefined,
      isApproximate: undefined,
    }));

    await prisma.$transaction([
      prisma.territoryStoreReadModel.deleteMany({ where: { orgId } }),
      prisma.territoryStoreReadModel.createMany({ data: legacyRows, skipDuplicates: true }),
    ]);
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "TerritoryStoreReadModel" SET "geoPoint" = ST_SetSRID(ST_MakePoint("lng", "lat"), 4326) WHERE "orgId" = $1`,
      orgId,
    );
  } catch (error) {
    console.warn('territory_read_model_geo_update_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const candidateLicenseNumbers = [...new Set(dedupedRows.map((row) => row.licenseNumber).filter((value): value is string => Boolean(value?.trim())))];
  const candidateNames = [...new Set(dedupedRows.map((row) => row.name.trim()).filter(Boolean))];

  if (candidateLicenseNumbers.length > 0 || candidateNames.length > 0) {
    const candidateAccounts = await prisma.account.findMany({
      where: {
        orgId,
        OR: [
          candidateLicenseNumbers.length > 0 ? { licenseNumber: { in: candidateLicenseNumbers } } : undefined,
          candidateNames.length > 0 ? { name: { in: candidateNames } } : undefined,
        ].filter(Boolean) as Prisma.AccountWhereInput[],
      },
      select: {
        id: true,
        name: true,
        licenseNumber: true,
        notionPageId: true,
        geoLat: true,
        geoLng: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const accountByLicense = new Map<string, (typeof candidateAccounts)[number]>();
    const accountByName = new Map<string, (typeof candidateAccounts)[number]>();

    for (const account of candidateAccounts) {
      if (account.licenseNumber?.trim() && !accountByLicense.has(account.licenseNumber)) {
        accountByLicense.set(account.licenseNumber, account);
      }
      if (account.name.trim() && !accountByName.has(account.name)) {
        accountByName.set(account.name, account);
      }
    }

    const accountUpdates = dedupedRows.flatMap((row) => {
      const matchedAccount =
        (row.licenseNumber ? accountByLicense.get(row.licenseNumber) : undefined) ??
        accountByName.get(row.name);

      if (!matchedAccount) {
        return [];
      }

      if (
        matchedAccount.notionPageId === row.notionPageId &&
        sameNullableNumber(matchedAccount.geoLat, row.lat) &&
        sameNullableNumber(matchedAccount.geoLng, row.lng)
      ) {
        return [];
      }

      return [
        prisma.account.update({
          where: { id: matchedAccount.id },
          data: {
            notionPageId: row.notionPageId,
            geoLat: row.lat,
            geoLng: row.lng,
          },
        }),
      ];
    });

    if (accountUpdates.length > 0) {
      await prisma.$transaction(accountUpdates);
    }
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "Account" SET "geoPoint" = ST_SetSRID(ST_MakePoint("geoLng", "geoLat"), 4326) WHERE "orgId" = $1 AND "geoLat" IS NOT NULL AND "geoLng" IS NOT NULL`,
    orgId,
  );

  return {
    count: dedupedRows.length,
    orgId,
  };
}

export async function syncTerritoryStoreToReadModel(store: TerritoryStorePin, input?: { orgId?: string }) {
  const orgId = orgIdOrDefault(input?.orgId);
  const [purchaseScoreByKey, checkInCount] = await Promise.all([
    getPurchaseScoreByKey(orgId),
    prisma.checkIn.count({
      where: {
        orgId,
        storeId: store.id,
      },
    }),
  ]);

  const row = buildTerritoryReadModelRow(store, orgId, {
    checkInCount,
    purchaseScore:
      purchaseScoreByKey.get(normalizeKey(store.licenseNumber ?? '')) ??
      purchaseScoreByKey.get(normalizeKey(store.name)) ??
      0,
  });

  try {
    await prisma.territoryStoreReadModel.upsert({
      where: { id: row.id },
      create: row,
      update: {
        ...row,
        orgId: undefined,
        id: undefined,
      },
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const legacyRow = {
      ...row,
      locationPrecision: undefined,
      isApproximate: undefined,
    };

    await prisma.territoryStoreReadModel.upsert({
      where: { id: legacyRow.id },
      create: legacyRow,
      update: {
        ...legacyRow,
        orgId: undefined,
        id: undefined,
      },
    });
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "TerritoryStoreReadModel" SET "geoPoint" = ST_SetSRID(ST_MakePoint("lng", "lat"), 4326) WHERE "id" = $1`,
      row.id,
    );
  } catch (error) {
    console.warn('territory_read_model_single_geo_update_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  await syncMatchedAccountForStoreRow(row, orgId);

  await prisma.$executeRawUnsafe(
    `UPDATE "Account" SET "geoPoint" = ST_SetSRID(ST_MakePoint("geoLng", "geoLat"), 4326) WHERE "orgId" = $1 AND "geoLat" IS NOT NULL AND "geoLng" IS NOT NULL`,
    orgId,
  );

  return {
    id: row.id,
    orgId,
  };
}

export async function loadTerritoryStoresFromReadModel(input: {
  statuses?: string[];
  reps?: string[];
  query?: string;
  locationAvailability?: 'all' | 'available' | 'unavailable';
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

  return filterTerritoryPins(pins, input);
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

export async function patchTerritoryStoreReadModel(storeId: string, input: { notes?: string | null; followUpDate?: string | null; lastCheckIn?: string | null; orgId?: string }) {
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
      ...(Object.prototype.hasOwnProperty.call(input, 'followUpDate')
        ? { followUpDate: input.followUpDate ? new Date(input.followUpDate) : null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'lastCheckIn')
        ? { lastCheckIn: input.lastCheckIn ? new Date(input.lastCheckIn) : null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(input, 'lastCheckIn') ? { interactionsScore: { increment: 1 } } : {}),
    },
  });
}

export async function recordTerritoryCheckInEvent(input: {
  storeId: string;
  contactId?: string | null;
  noteText?: string | null;
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
