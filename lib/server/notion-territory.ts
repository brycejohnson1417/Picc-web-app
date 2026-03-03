import 'server-only';

import { prisma } from '@/lib/db/prisma';
import {
  getSyncTtlMinutes,
  isSnapshotStale,
  readNotionCacheSnapshot,
  type NotionCacheSnapshot,
  writeNotionCacheSnapshot,
} from '@/lib/server/notion-cache-store';
import {
  loadTerritoryStoreFromReadModel,
  loadTerritoryStoresFromReadModel,
  patchTerritoryStoreReadModel,
  recordTerritoryCheckInEvent,
  syncTerritoryStoresReadModel,
} from '@/lib/server/territory-read-model';
import { colorForStatus, normalizeStatus, pinKindForStatus, type TerritoryStoreContact, type TerritoryStoresResponse, type TerritoryStorePin } from '@/lib/territory/types';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const GEOCODE_THROTTLE_MS = 250;
const TERRITORY_SNAPSHOT_KEY = 'territory-stores-v1';
const DEFAULT_SYNC_TTL_MINUTES = 20;
const DEFAULT_STALE_SYNC_GEOCODE_LOOKUPS = 12;
const DEFAULT_FORCE_SYNC_GEOCODE_LOOKUPS = 80;

const REQUIRED_PROPERTIES = [
  { name: 'Dispensary Name', type: 'title' },
  { name: 'Map Location', type: 'place' },
  { name: 'Account Status', type: 'status' },
  { name: 'Rep', type: 'people' },
] as const;

type NotionPropertySchema = {
  id: string;
  type: string;
};

type NotionDatabaseResponse = {
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, NotionPropertySchema>;
};

type NotionQueryResponse = {
  results?: Array<{
    id: string;
    last_edited_time: string;
    properties: Record<string, NotionPropertyValue>;
  }>;
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionTextSegment = {
  plain_text?: string;
};

type NotionPerson = {
  name?: string | null;
  person?: {
    email?: string | null;
  } | null;
};

type NotionPlace = {
  lat?: number;
  lon?: number;
  name?: string;
  address?: string;
};

type NotionPropertyValue = {
  title?: NotionTextSegment[];
  rich_text?: NotionTextSegment[];
  phone_number?: string | null;
  email?: string | null;
  status?: {
    name?: string;
  } | null;
  date?: {
    start?: string | null;
  } | null;
  people?: NotionPerson[];
  place?: NotionPlace | null;
};

interface GeoBudget {
  remaining: number;
  lookedUp: number;
}

interface TerritorySnapshotMeta {
  dataSource: TerritoryStoresResponse['meta']['dataSource'];
  lastEditedMax: string | null;
  recordsRead: number;
  unresolvedLocationCount: number;
  geocodedThisRequest: number;
  syncedAt: string | null;
  stale: boolean;
  syncing: boolean;
  syncError: string | null;
}

interface TerritorySnapshotResult {
  stores: TerritoryStorePin[];
  meta: TerritorySnapshotMeta;
}

interface CachedContactRow extends TerritoryStoreContact {
  accountPageIds: string[];
  lastEditedTime: string;
}

let lastGeocodeLookupAt = 0;
const memoryGeocodeCache = new Map<string, { lat: number; lng: number; formattedAddress: string }>();
let territorySyncInFlight: Promise<void> | null = null;
let territoryLastSyncError: string | null = null;
const CONTACTS_SNAPSHOT_KEY = 'crm-contacts-v1';

function requiredEnv(name: 'NOTION_API_KEY' | 'NOTION_MASTER_LIST_DATABASE_ID') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getNotionHeaders() {
  return {
    Authorization: `Bearer ${requiredEnv('NOTION_API_KEY')}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function notionRequest<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      ...getNotionHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    await sleep(500 * (attempt + 1));
    return notionRequest<T>(path, init, attempt + 1);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Notion request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

function getDatabaseTitle(database: NotionDatabaseResponse) {
  return (database.title ?? []).map((segment) => segment.plain_text ?? '').join('').trim() || 'Untitled Database';
}

function findMissingFields(properties: Record<string, NotionPropertySchema>) {
  return REQUIRED_PROPERTIES.filter((required) => {
    const property = properties[required.name];
    if (!property) return true;
    return property.type !== required.type;
  }).map((required) => required.name);
}

async function fetchAndValidateDatabaseSchema() {
  const databaseId = requiredEnv('NOTION_MASTER_LIST_DATABASE_ID');
  const database = await notionRequest<NotionDatabaseResponse>(`/databases/${databaseId}`);
  const properties = database.properties ?? {};
  const missingFields = findMissingFields(properties);

  return {
    database,
    databaseId,
    missingFields,
  };
}

function textFromTitleProperty(property: NotionPropertyValue | undefined) {
  const titleArray = Array.isArray(property?.title) ? property.title : [];
  return titleArray.map((item) => item?.plain_text ?? '').join('').trim();
}

function textFromRichTextProperty(property: NotionPropertyValue | undefined) {
  const textArray = Array.isArray(property?.rich_text) ? property.rich_text : [];
  return textArray.map((item) => item?.plain_text ?? '').join('').trim();
}

function readPhoneNumberProperty(property: NotionPropertyValue | undefined) {
  return typeof property?.phone_number === 'string' ? property.phone_number.trim() : '';
}

function readEmailProperty(property: NotionPropertyValue | undefined) {
  return typeof property?.email === 'string' ? property.email.trim() : '';
}

function readDateStartProperty(property: NotionPropertyValue | undefined) {
  return typeof property?.date?.start === 'string' ? property.date.start : '';
}

function readFormulaNumber(property: NotionPropertyValue | undefined) {
  const formula = (property as { formula?: { number?: number } } | undefined)?.formula;
  if (typeof formula?.number === 'number') {
    return formula.number;
  }
  return 0;
}

function normalizePropertyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickPropertyNameByType(
  properties: Record<string, NotionPropertySchema>,
  candidates: string[],
  expectedType: string,
) {
  const candidateSet = new Set(candidates.map(normalizePropertyName));
  for (const [name, schema] of Object.entries(properties)) {
    if (schema.type !== expectedType) {
      continue;
    }
    if (candidateSet.has(normalizePropertyName(name))) {
      return name;
    }
  }
  return null;
}

function parseStateFromAddress(address: string | null | undefined) {
  if (!address) {
    return null;
  }
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?/);
  return match?.[1] ?? null;
}

function firstNonEmpty(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

async function geocodeAddressWithCache(address: string, budget: GeoBudget, allowLiveLookup: boolean) {
  const addressNormalized = normalizeAddress(address);
  if (!addressNormalized) {
    return null;
  }

  const memoryCached = memoryGeocodeCache.get(addressNormalized);
  if (memoryCached) {
    return {
      lat: memoryCached.lat,
      lng: memoryCached.lng,
      formattedAddress: memoryCached.formattedAddress,
      source: 'nominatim-cache' as const,
    };
  }

  let cached: { lat: number; lng: number; formattedAddress: string | null } | null = null;
  try {
    cached = await prisma.spatialGeocodeCache.findUnique({
      where: { addressNormalized },
      select: {
        lat: true,
        lng: true,
        formattedAddress: true,
      },
    });
  } catch {
    cached = null;
  }

  if (cached) {
    memoryGeocodeCache.set(addressNormalized, {
      lat: cached.lat,
      lng: cached.lng,
      formattedAddress: cached.formattedAddress ?? address,
    });
    return {
      lat: cached.lat,
      lng: cached.lng,
      formattedAddress: cached.formattedAddress ?? address,
      source: 'nominatim-cache' as const,
    };
  }

  if (!allowLiveLookup || budget.remaining <= 0) {
    return null;
  }

  budget.remaining -= 1;
  budget.lookedUp += 1;

  const now = Date.now();
  const waitFor = Math.max(0, GEOCODE_THROTTLE_MS - (now - lastGeocodeLookupAt));
  if (waitFor > 0) {
    await sleep(waitFor);
  }
  lastGeocodeLookupAt = Date.now();

  const url = `${NOMINATIM_BASE}?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'picc-command-center-territory/1.0 (sales routing)',
      'Accept-Language': 'en',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const match = payload[0];
  if (!match?.lat || !match?.lon) {
    return null;
  }

  const lat = Number.parseFloat(match.lat);
  const lng = Number.parseFloat(match.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const formattedAddress = match.display_name ?? address;

  memoryGeocodeCache.set(addressNormalized, {
    lat,
    lng,
    formattedAddress,
  });

  try {
    await prisma.spatialGeocodeCache.upsert({
      where: { addressNormalized },
      create: {
        addressNormalized,
        lat,
        lng,
        formattedAddress,
      },
      update: {
        lat,
        lng,
        formattedAddress,
      },
    });
  } catch {
    // Best effort cache write only.
  }

  return {
    lat,
    lng,
    formattedAddress,
    source: 'nominatim-live' as const,
  };
}

async function queryAllStorePages(databaseId: string) {
  const allRows: NotionQueryResponse['results'] = [];
  let startCursor: string | undefined;

  while (true) {
    const result = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    });

    allRows.push(...(result.results ?? []));

    if (!result.has_more || !result.next_cursor) {
      break;
    }

    startCursor = result.next_cursor;
  }

  return allRows;
}

function normalizeSnapshotPayload(payload: unknown): TerritoryStorePin[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const rows = payload.filter((item): item is TerritoryStorePin => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const candidate = item as TerritoryStorePin;
    return Boolean(candidate.id && candidate.notionPageId && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng));
  });

  return rows
    .map((row) => {
      const id = typeof row.id === 'string' ? row.id : '';
      const notionPageId = typeof row.notionPageId === 'string' ? row.notionPageId : id;
      const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Untitled Store';
      const status = typeof row.status === 'string' && row.status.trim() ? row.status.trim() : 'Unspecified';
      const lat = typeof row.lat === 'number' ? row.lat : Number.NaN;
      const lng = typeof row.lng === 'number' ? row.lng : Number.NaN;

      if (!id || !notionPageId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return {
        ...row,
        id,
        notionPageId,
        name,
        status,
        statusKey: typeof row.statusKey === 'string' && row.statusKey ? row.statusKey : normalizeStatus(status),
        statusColor: typeof row.statusColor === 'string' && row.statusColor ? row.statusColor : colorForStatus(status),
        pinKind: row.pinKind ?? pinKindForStatus(status),
        repNames: Array.isArray(row.repNames) ? row.repNames.filter((value): value is string => typeof value === 'string') : [],
        repEmails: Array.isArray(row.repEmails) ? row.repEmails.filter((value): value is string => typeof value === 'string') : [],
        locationLabel: typeof row.locationLabel === 'string' ? row.locationLabel : null,
        locationAddress: typeof row.locationAddress === 'string' ? row.locationAddress : null,
        locationSource:
          row.locationSource === 'notion-place' || row.locationSource === 'nominatim-cache' || row.locationSource === 'nominatim-live'
            ? row.locationSource
            : 'nominatim-cache',
        lastEditedTime: typeof row.lastEditedTime === 'string' && row.lastEditedTime ? row.lastEditedTime : new Date().toISOString(),
      };
    })
    .filter((row): row is TerritoryStorePin => Boolean(row));
}

async function syncTerritorySnapshotFromNotion(input?: { maxLiveGeocodeLookups?: number }) {
  const schema = await fetchAndValidateDatabaseSchema();
  if (schema.missingFields.length > 0) {
    throw new Error(`Notion schema missing required fields: ${schema.missingFields.join(', ')}`);
  }

  const rows = await queryAllStorePages(schema.databaseId);
  const geocodeBudget: GeoBudget = {
    remaining: Math.max(0, input?.maxLiveGeocodeLookups ?? 0),
    lookedUp: 0,
  };

  const stores: TerritoryStorePin[] = [];
  let lastEditedMax: string | null = null;
  let unresolvedLocationCount = 0;

  for (const row of rows) {
    const properties = row.properties ?? {};
    const propertyByCandidates = (...candidates: string[]) => {
      const normalizedCandidates = new Set(candidates.map(normalizePropertyName));
      for (const [name, value] of Object.entries(properties)) {
        if (normalizedCandidates.has(normalizePropertyName(name))) {
          return value;
        }
      }
      return undefined;
    };

    const name = textFromTitleProperty(properties['Dispensary Name']) || 'Untitled Store';
    const statusName = properties['Account Status']?.status?.name ?? 'Unspecified';
    const statusKey = normalizeStatus(statusName);

    const repPeople = Array.isArray(properties['Rep']?.people) ? properties['Rep'].people : [];
    const repNames = repPeople.map((person) => person?.name).filter((value: unknown): value is string => Boolean(value));
    const repEmails = repPeople
      .map((person) => person?.person?.email)
      .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);

    const place = properties['Map Location']?.place;
    const notionLat = typeof place?.lat === 'number' ? place.lat : null;
    const notionLng = typeof place?.lon === 'number' ? place.lon : null;
    const hasPlaceCoords = notionLat !== null && notionLng !== null;

    const placeName = typeof place?.name === 'string' ? place.name.trim() : '';
    const placeAddress = typeof place?.address === 'string' ? place.address.trim() : '';

    const fullAddress = textFromRichTextProperty((propertyByCandidates('full address', 'address') as NotionPropertyValue | undefined) ?? properties['Full Address']);
    const address1 = textFromRichTextProperty((propertyByCandidates('address 1', 'street address') as NotionPropertyValue | undefined) ?? properties['Address 1']);
    const city = textFromRichTextProperty((propertyByCandidates('city') as NotionPropertyValue | undefined) ?? properties['City']);
    const zipcode = textFromRichTextProperty((propertyByCandidates('zipcode', 'zip code') as NotionPropertyValue | undefined) ?? properties['Zipcode']);
    const licenseNumber = textFromRichTextProperty((propertyByCandidates('license number', 'license') as NotionPropertyValue | undefined) ?? properties['License Number']);
    const daysOverdue = readFormulaNumber((propertyByCandidates('days overdue') as NotionPropertyValue | undefined) ?? properties['Days Overdue']);
    const phoneNumber = readPhoneNumberProperty((propertyByCandidates('phone number', 'phone') as NotionPropertyValue | undefined) ?? properties['Phone Number']) || null;
    const email = readEmailProperty((propertyByCandidates('email', 'email address') as NotionPropertyValue | undefined) ?? properties.Email) || null;
    const followUpDate = readDateStartProperty((propertyByCandidates('follow-up date', 'follow up date') as NotionPropertyValue | undefined) ?? properties['Follow-up Date']) || null;
    const notes = textFromRichTextProperty((propertyByCandidates('notes', 'account notes', 'store notes') as NotionPropertyValue | undefined) ?? properties.Notes) || null;
    const lastCheckIn = readDateStartProperty((propertyByCandidates('last check-in', 'last check in', 'last visit') as NotionPropertyValue | undefined) ?? properties['Last Check-in']) || null;

    const fallbackAddress = firstNonEmpty([placeAddress, placeName, fullAddress, [address1, city, zipcode].filter(Boolean).join(', ')]);

    let lat: number | null = hasPlaceCoords ? notionLat : null;
    let lng: number | null = hasPlaceCoords ? notionLng : null;
    let locationSource: TerritoryStorePin['locationSource'] = hasPlaceCoords ? 'notion-place' : 'nominatim-cache';
    let resolvedAddress = firstNonEmpty([placeAddress, fullAddress, placeName]);

    if (!hasPlaceCoords && fallbackAddress) {
      const geocodeResult = await geocodeAddressWithCache(fallbackAddress, geocodeBudget, geocodeBudget.remaining > 0);
      if (geocodeResult) {
        lat = geocodeResult.lat;
        lng = geocodeResult.lng;
        resolvedAddress = geocodeResult.formattedAddress;
        locationSource = geocodeResult.source;
      }
    }

    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      unresolvedLocationCount += 1;
      if (!lastEditedMax || row.last_edited_time > lastEditedMax) {
        lastEditedMax = row.last_edited_time;
      }
      continue;
    }

    const resolvedLat: number = lat;
    const resolvedLng: number = lng;

    const pin: TerritoryStorePin = {
      id: row.id,
      notionPageId: row.id,
      name,
      status: statusName,
      statusKey,
      statusColor: colorForStatus(statusName),
      pinKind: pinKindForStatus(statusName),
      repNames,
      repEmails,
      lat: resolvedLat,
      lng: resolvedLng,
      locationLabel: firstNonEmpty([placeName, fallbackAddress]),
      locationAddress: resolvedAddress,
      locationSource,
      lastEditedTime: row.last_edited_time,
      licenseNumber: licenseNumber || null,
      city: city || null,
      state: parseStateFromAddress(firstNonEmpty([resolvedAddress, fullAddress, fallbackAddress])),
      daysOverdue,
      phoneNumber,
      email,
      followUpDate,
      notes,
      lastCheckIn,
    };

    if (!lastEditedMax || row.last_edited_time > lastEditedMax) {
      lastEditedMax = row.last_edited_time;
    }

    stores.push(pin);
  }

  stores.sort((a, b) => a.name.localeCompare(b.name));

  await writeNotionCacheSnapshot<TerritoryStorePin[]>({
    key: TERRITORY_SNAPSHOT_KEY,
    payload: stores,
    recordsRead: rows.length,
    unresolvedLocationCount,
    lastEditedMax,
  });
  await syncTerritoryStoresReadModel(stores);

  const snapshot: NotionCacheSnapshot<TerritoryStorePin[]> = {
    key: TERRITORY_SNAPSHOT_KEY,
    payload: stores,
    recordsRead: rows.length,
    unresolvedLocationCount,
    lastEditedMax,
    syncedAt: new Date().toISOString(),
  };

  return {
    snapshot,
    geocodedThisSync: geocodeBudget.lookedUp,
  };
}

function startTerritoryBackgroundSync(input?: { maxLiveGeocodeLookups?: number }) {
  if (territorySyncInFlight) {
    return;
  }

  territorySyncInFlight = syncTerritorySnapshotFromNotion(input)
    .then(() => {
      territoryLastSyncError = null;
    })
    .catch((error) => {
      territoryLastSyncError = error instanceof Error ? error.message : 'Territory sync failed';
    })
    .finally(() => {
      territorySyncInFlight = null;
    });
}

async function getTerritorySnapshot(input?: {
  refresh?: boolean;
  maxLiveGeocodeLookups?: number;
}): Promise<TerritorySnapshotResult> {
  const ttlMinutes = getSyncTtlMinutes(DEFAULT_SYNC_TTL_MINUTES);
  let cached = await readNotionCacheSnapshot<TerritoryStorePin[]>(TERRITORY_SNAPSHOT_KEY);
  const normalizedCachedPayload = normalizeSnapshotPayload(cached?.payload);
  if (cached) {
    cached = {
      ...cached,
      payload: normalizedCachedPayload,
    };
  }

  const shouldSync =
    Boolean(input?.refresh) ||
    !cached ||
    cached.payload.length === 0 ||
    cached.recordsRead === 0 ||
    isSnapshotStale(cached.syncedAt, ttlMinutes);

  let geocodedThisRequest = 0;
  let stale = false;
  let syncError: string | null = territoryLastSyncError;
  let syncing = Boolean(territorySyncInFlight);

  if (shouldSync) {
    const defaultGeocodeBudget = input?.refresh
      ? parsePositiveInt(process.env.TERRITORY_FORCE_SYNC_GEOCODE_LOOKUPS, DEFAULT_FORCE_SYNC_GEOCODE_LOOKUPS)
      : parsePositiveInt(process.env.TERRITORY_STALE_SYNC_GEOCODE_LOOKUPS, DEFAULT_STALE_SYNC_GEOCODE_LOOKUPS);

    if (input?.refresh || !cached || cached.payload.length === 0) {
      try {
        const synced = await syncTerritorySnapshotFromNotion({
          maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups ?? defaultGeocodeBudget,
        });
        cached = synced.snapshot;
        geocodedThisRequest = synced.geocodedThisSync;
        syncError = null;
      } catch (error) {
        syncError = error instanceof Error ? error.message : 'Territory sync failed';
        if (!cached) {
          throw error;
        }
        stale = true;
      }
    } else {
      stale = true;
      startTerritoryBackgroundSync({
        maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups ?? defaultGeocodeBudget,
      });
      syncing = true;
    }
  }

  if (!cached) {
    throw new Error('Territory cache is unavailable');
  }

  return {
    stores: cached.payload,
    meta: {
      dataSource: stale ? 'notion-live-cache-stale' : 'notion-live-cache',
      lastEditedMax: cached.lastEditedMax,
      recordsRead: cached.recordsRead,
      unresolvedLocationCount: cached.unresolvedLocationCount,
      geocodedThisRequest,
      syncedAt: cached.syncedAt,
      stale,
      syncing,
      syncError,
    },
  };
}

function normalizePageId(value: string) {
  return value.replace(/-/g, '').toLowerCase();
}

function normalizeCachedContacts(payload: unknown): CachedContactRow[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is CachedContactRow => {
    if (typeof row !== 'object' || row === null) {
      return false;
    }

    const candidate = row as CachedContactRow;
    return Boolean(candidate.id && candidate.name && Array.isArray(candidate.accountPageIds));
  });
}

function findStoreById(stores: TerritoryStorePin[], storeId: string) {
  const normalizedStoreId = normalizePageId(storeId);
  return (
    stores.find((store) => normalizePageId(store.id) === normalizedStoreId || normalizePageId(store.notionPageId) === normalizedStoreId) ??
    null
  );
}

async function patchStoreInSnapshot(storeId: string, updater: (store: TerritoryStorePin) => TerritoryStorePin) {
  const snapshot = await readNotionCacheSnapshot<TerritoryStorePin[]>(TERRITORY_SNAPSHOT_KEY);
  if (!snapshot) {
    return;
  }

  const normalizedPayload = normalizeSnapshotPayload(snapshot.payload);
  const normalizedStoreId = normalizePageId(storeId);
  let changed = false;

  const payload = normalizedPayload.map((store) => {
    const matches = normalizePageId(store.id) === normalizedStoreId || normalizePageId(store.notionPageId) === normalizedStoreId;
    if (!matches) {
      return store;
    }
    changed = true;
    return updater(store);
  });

  if (!changed) {
    return;
  }

  await writeNotionCacheSnapshot({
    key: TERRITORY_SNAPSHOT_KEY,
    payload,
    recordsRead: snapshot.recordsRead,
    unresolvedLocationCount: snapshot.unresolvedLocationCount,
    lastEditedMax: snapshot.lastEditedMax,
  });
}

export async function loadTerritoryStoreDetail(storeId: string) {
  const snapshot = await getTerritorySnapshot();
  const store = (await loadTerritoryStoreFromReadModel(storeId)) ?? findStoreById(snapshot.stores, storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  const contactsSnapshot = await readNotionCacheSnapshot<CachedContactRow[]>(CONTACTS_SNAPSHOT_KEY);
  const contacts = normalizeCachedContacts(contactsSnapshot?.payload).filter((contact) =>
    contact.accountPageIds.some((pageId) => normalizePageId(pageId) === normalizePageId(store.notionPageId)),
  );

  contacts.sort((a, b) => a.name.localeCompare(b.name));

  return {
    store,
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      roleTitle: contact.roleTitle,
      email: contact.email,
      phone: contact.phone,
      status: contact.status,
      linkedWork: contact.linkedWork,
    })),
  };
}

export async function updateTerritoryStoreNotes(storeId: string, notes: string) {
  const snapshot = await getTerritorySnapshot();
  const store = findStoreById(snapshot.stores, storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  const schema = await fetchAndValidateDatabaseSchema();
  const notesProperty = pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Notes', 'Account Notes', 'Store Notes', 'Visit Notes'],
    'rich_text',
  );

  if (!notesProperty) {
    throw new Error('No writable Notes property found in Notion database');
  }

  const trimmed = notes.trim().slice(0, 2000);

  await notionRequest<unknown>(`/pages/${store.notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        [notesProperty]: {
          rich_text: trimmed
            ? [
                {
                  type: 'text',
                  text: { content: trimmed },
                },
              ]
            : [],
        },
      },
    }),
  });

  const now = new Date().toISOString();
  await patchStoreInSnapshot(store.id, (entry) => ({
    ...entry,
    notes: trimmed || null,
    lastEditedTime: now,
  }));
  await patchTerritoryStoreReadModel(store.id, {
    notes: trimmed || null,
  });

  return {
    storeId: store.id,
    notes: trimmed || null,
    updatedAt: now,
  };
}

export async function recordTerritoryStoreCheckIn(storeId: string) {
  const snapshot = await getTerritorySnapshot();
  const store = findStoreById(snapshot.stores, storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  const schema = await fetchAndValidateDatabaseSchema();
  const properties = schema.database.properties ?? {};
  const checkInProperty = pickPropertyNameByType(
    properties,
    ['Last Check-in', 'Last Check In', 'Last Visit', 'Recent Check-in'],
    'date',
  );

  if (!checkInProperty) {
    throw new Error('No check-in date property found in Notion database');
  }

  const checkedInAt = new Date().toISOString();

  await notionRequest<unknown>(`/pages/${store.notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        [checkInProperty]: {
          date: {
            start: checkedInAt,
          },
        },
      },
    }),
  });

  await patchStoreInSnapshot(store.id, (entry) => ({
    ...entry,
    lastCheckIn: checkedInAt,
    lastEditedTime: checkedInAt,
  }));
  await patchTerritoryStoreReadModel(store.id, {
    lastCheckIn: checkedInAt,
  });
  await recordTerritoryCheckInEvent({
    storeId: store.id,
    lat: store.lat,
    lng: store.lng,
    noteText: `Check-in recorded at ${checkedInAt}`,
    happenedAt: checkedInAt,
  });

  return {
    storeId: store.id,
    checkedInAt,
  };
}

export async function territoryConnectionCheck() {
  const schema = await fetchAndValidateDatabaseSchema();

  return {
    ok: schema.missingFields.length === 0,
    databaseTitle: getDatabaseTitle(schema.database),
    missingFields: schema.missingFields,
    checkedAt: new Date().toISOString(),
  };
}

export async function loadTerritoryStores(input?: {
  statuses?: string[];
  reps?: string[];
  query?: string;
  refresh?: boolean;
  maxLiveGeocodeLookups?: number;
}): Promise<TerritoryStoresResponse> {
  const snapshot = await getTerritorySnapshot({
    refresh: input?.refresh,
    maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups,
  });
  await syncTerritoryStoresReadModel(snapshot.stores);
  const readModel = await loadTerritoryStoresFromReadModel({
    statuses: input?.statuses,
    reps: input?.reps,
    query: input?.query,
  });

  return {
    stores: readModel.stores,
    filters: {
      statuses: readModel.filters.statuses,
      reps: readModel.filters.reps,
    },
    meta: {
      ...snapshot.meta,
      sourceEngine: 'postgis',
      recordsRead: readModel.recordsRead,
    },
  };
}

export async function getCachedTerritoryStores(input?: { refresh?: boolean }) {
  return getTerritorySnapshot({
    refresh: input?.refresh,
  });
}

export async function prewarmTerritoryGeocodeCache() {
  const lookups = parsePositiveInt(process.env.TERRITORY_FORCE_SYNC_GEOCODE_LOOKUPS, DEFAULT_FORCE_SYNC_GEOCODE_LOOKUPS);

  const snapshot = await getTerritorySnapshot({
    refresh: true,
    maxLiveGeocodeLookups: lookups,
  });

  return {
    warmedLookups: snapshot.meta.geocodedThisRequest,
    recordsRead: snapshot.meta.recordsRead,
    unresolvedLocationCount: snapshot.meta.unresolvedLocationCount,
    lastEditedMax: snapshot.meta.lastEditedMax,
    syncedAt: snapshot.meta.syncedAt,
    stale: snapshot.meta.stale,
  };
}
