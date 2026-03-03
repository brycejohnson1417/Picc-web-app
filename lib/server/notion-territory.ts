import 'server-only';

import { prisma } from '@/lib/db/prisma';
import {
  getSyncTtlMinutes,
  isSnapshotStale,
  readNotionCacheSnapshot,
  type NotionCacheSnapshot,
  writeNotionCacheSnapshot,
} from '@/lib/server/notion-cache-store';
import { colorForStatus, normalizeStatus, type TerritoryStoresResponse, type TerritoryStorePin } from '@/lib/territory/types';

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
  status?: {
    name?: string;
  } | null;
  select?: {
    name?: string;
  } | null;
  multi_select?: Array<{
    name?: string;
  }>;
  people?: NotionPerson[];
  email?: string | null;
  phone_number?: string | null;
  url?: string | null;
  number?: number | null;
  checkbox?: boolean;
  date?: {
    start?: string | null;
    end?: string | null;
  } | null;
  formula?: {
    type?: 'string' | 'number' | 'boolean' | 'date';
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: {
      start?: string | null;
    } | null;
  } | null;
  relation?: Array<{
    id?: string;
  }>;
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

let lastGeocodeLookupAt = 0;
const memoryGeocodeCache = new Map<string, { lat: number; lng: number; formattedAddress: string }>();
let territorySyncInFlight: Promise<void> | null = null;
let territoryLastSyncError: string | null = null;

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

function normalizePropertyName(name: string) {
  return name
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function propertyByCandidates(properties: Record<string, NotionPropertyValue>, candidates: string[]) {
  const normalizedMap = new Map<string, NotionPropertyValue>();
  for (const [name, value] of Object.entries(properties)) {
    normalizedMap.set(normalizePropertyName(name), value);
  }

  for (const candidate of candidates) {
    const match = normalizedMap.get(normalizePropertyName(candidate));
    if (match) {
      return match;
    }
  }

  return undefined;
}

function notionPropertyToString(property: NotionPropertyValue | undefined): string | null {
  if (!property) return null;

  const title = textFromTitleProperty(property);
  if (title) return title;

  const richText = textFromRichTextProperty(property);
  if (richText) return richText;

  if (property.status?.name) return property.status.name.trim();
  if (property.select?.name) return property.select.name.trim();

  if (Array.isArray(property.multi_select) && property.multi_select.length > 0) {
    const value = property.multi_select.map((item) => item?.name ?? '').filter(Boolean).join(', ').trim();
    if (value) return value;
  }

  if (Array.isArray(property.people) && property.people.length > 0) {
    const value = property.people.map((person) => person?.name ?? person?.person?.email ?? '').filter(Boolean).join(', ').trim();
    if (value) return value;
  }

  if (property.phone_number && property.phone_number.trim()) return property.phone_number.trim();
  if (property.email && property.email.trim()) return property.email.trim();
  if (property.url && property.url.trim()) return property.url.trim();
  if (typeof property.number === 'number' && Number.isFinite(property.number)) return String(property.number);
  if (typeof property.checkbox === 'boolean') return property.checkbox ? 'Yes' : 'No';
  if (property.date?.start) return property.date.start;

  if (property.formula) {
    if (property.formula.type === 'string' && property.formula.string) return property.formula.string.trim();
    if (property.formula.type === 'number' && typeof property.formula.number === 'number' && Number.isFinite(property.formula.number)) return String(property.formula.number);
    if (property.formula.type === 'boolean' && typeof property.formula.boolean === 'boolean') return property.formula.boolean ? 'Yes' : 'No';
    if (property.formula.type === 'date' && property.formula.date?.start) return property.formula.date.start;
  }

  if (property.place) {
    const place = firstNonEmpty([property.place.name, property.place.address]);
    if (place) return place;
  }

  return null;
}

function detailFieldFromCandidates(
  properties: Record<string, NotionPropertyValue>,
  label: string,
  candidates: string[],
) {
  const property = propertyByCandidates(properties, candidates);
  const value = notionPropertyToString(property);
  if (!value) return null;
  return { label, value };
}

function readFormulaNumber(property: NotionPropertyValue | undefined) {
  const formula = (property as { formula?: { number?: number } } | undefined)?.formula;
  if (typeof formula?.number === 'number') {
    return formula.number;
  }
  return 0;
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

function buildRepLabelSet(pin: TerritoryStorePin) {
  const labels = new Set<string>();
  for (const name of pin.repNames) {
    labels.add(name.toLowerCase());
  }
  for (const email of pin.repEmails) {
    labels.add(email.toLowerCase());
  }
  if (labels.size === 0) {
    labels.add('unassigned');
  }
  return labels;
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
    return Boolean(candidate.id && candidate.notionPageId && candidate.name && Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng));
  });

  return rows;
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

    const nameProperty = propertyByCandidates(properties, ['Dispensary Name', 'Name']);
    const statusProperty = propertyByCandidates(properties, ['Account Status', 'Dispensary Account Status']);
    const repProperty = propertyByCandidates(properties, ['Rep', 'Sales Rep', 'Account Owner']);
    const mapLocationProperty = propertyByCandidates(properties, ['Map Location', 'Location']);

    const name = textFromTitleProperty(nameProperty) || notionPropertyToString(nameProperty) || 'Untitled Store';
    const statusName = statusProperty?.status?.name ?? notionPropertyToString(statusProperty) ?? 'Unspecified';
    const statusKey = normalizeStatus(statusName);

    const repPeople = Array.isArray(repProperty?.people) ? repProperty.people : [];
    const repNames = repPeople.map((person) => person?.name).filter((value: unknown): value is string => Boolean(value));
    const repEmails = repPeople
      .map((person) => person?.person?.email)
      .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);

    const place = mapLocationProperty?.place;
    const notionLat = typeof place?.lat === 'number' ? place.lat : null;
    const notionLng = typeof place?.lon === 'number' ? place.lon : null;
    const hasPlaceCoords = notionLat !== null && notionLng !== null;

    const placeName = typeof place?.name === 'string' ? place.name.trim() : '';
    const placeAddress = typeof place?.address === 'string' ? place.address.trim() : '';

    const fullAddress = notionPropertyToString(propertyByCandidates(properties, ['Full Address', 'Address'])) ?? '';
    const address1 = notionPropertyToString(propertyByCandidates(properties, ['Address 1', 'Street Address'])) ?? '';
    const city = notionPropertyToString(propertyByCandidates(properties, ['City'])) ?? '';
    const zipcode = notionPropertyToString(propertyByCandidates(properties, ['Zipcode', 'Zip Code', 'ZIP'])) ?? '';
    const licenseNumber = notionPropertyToString(propertyByCandidates(properties, ['License Number', 'License #'])) ?? '';
    const daysOverdue = readFormulaNumber(propertyByCandidates(properties, ['Days Overdue']));

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
    const detailCandidates: Array<{ label: string; candidates: string[] }> = [
      { label: 'Phone', candidates: ['Phone', 'Phone Number', 'Store Phone'] },
      { label: 'Email', candidates: ['Email', 'Store Email'] },
      { label: 'Follow-up Date', candidates: ['Follow-up Date', 'Follow Up Date', 'Next Follow-up'] },
      { label: 'Account Owner', candidates: ['Account Owner', 'Owner', 'Rep'] },
      { label: 'What Point of Sales are Needed', candidates: ['What Point of Sales are Needed', 'What Point of Sales are Needed?', 'Point of Sales Needed'] },
      { label: 'PICC Rep', candidates: ['PICC Rep', 'Rep'] },
      { label: 'What did we drop off', candidates: ['What did we drop off', 'Drop Off Items', 'What did we drop off?'] },
      { label: 'Current Customer or Lead?', candidates: ['Current Customer or Lead?', 'Current Customer or Lead', 'Customer Type'] },
      { label: 'Route', candidates: ['Matt_Bryce Route', 'Route'] },
      { label: 'Full Address', candidates: ['Full Address', 'Address'] },
      { label: 'License Number', candidates: ['License Number', 'License #'] },
    ];

    const detailFields = detailCandidates
      .map((entry) => detailFieldFromCandidates(properties, entry.label, entry.candidates))
      .filter((entry): entry is { label: string; value: string } => Boolean(entry));

    if (!detailFields.find((entry) => entry.label === 'Account Owner')) {
      detailFields.push({
        label: 'Account Owner',
        value: repNames[0] ?? 'Unassigned',
      });
    }
    if (!detailFields.find((entry) => entry.label === 'Account Status')) {
      detailFields.push({
        label: 'Account Status',
        value: statusName,
      });
    }

    const pin: TerritoryStorePin = {
      id: row.id,
      notionPageId: row.id,
      name,
      status: statusName,
      statusKey,
      statusColor: colorForStatus(statusName),
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
      detailFields,
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

  const filters = {
    status: new Set((input?.statuses ?? []).map((value) => normalizeStatus(value))),
    rep: new Set((input?.reps ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean)),
    q: input?.query?.trim().toLowerCase() ?? '',
  };

  const statusCounts = new Map<string, number>();
  const repCounts = new Map<string, number>();

  for (const pin of snapshot.stores) {
    statusCounts.set(pin.status, (statusCounts.get(pin.status) ?? 0) + 1);

    if (pin.repNames.length === 0 && pin.repEmails.length === 0) {
      repCounts.set('Unassigned', (repCounts.get('Unassigned') ?? 0) + 1);
      continue;
    }

    for (const repName of pin.repNames) {
      repCounts.set(repName, (repCounts.get(repName) ?? 0) + 1);
    }
  }

  const filteredStores = snapshot.stores.filter((pin) => {
    if (filters.status.size > 0 && !filters.status.has(pin.statusKey)) {
      return false;
    }

    if (filters.rep.size > 0) {
      const repSet = buildRepLabelSet(pin);
      let repMatch = false;
      for (const filterValue of filters.rep) {
        if (repSet.has(filterValue)) {
          repMatch = true;
          break;
        }
      }
      if (!repMatch) {
        return false;
      }
    }

    if (filters.q && !pin.name.toLowerCase().includes(filters.q)) {
      return false;
    }

    return true;
  });

  filteredStores.sort((a, b) => a.name.localeCompare(b.name));

  const statusFilterCounts = [...statusCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));

  const repFilterCounts = [...repCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));

  return {
    stores: filteredStores,
    filters: {
      statuses: statusFilterCounts,
      reps: repFilterCounts,
    },
    meta: snapshot.meta,
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
