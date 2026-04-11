import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { isExcludedInternalTransferRetailerName } from '@/lib/nabis/internal-transfers';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID } from '@/lib/config/runtime';
import {
  getSyncTtlMinutes,
  isSnapshotStale,
  readNotionCacheSnapshot,
  type NotionCacheSnapshot,
  writeNotionCacheSnapshot,
} from '@/lib/server/notion-cache-store';
import {
  filterTerritoryPins,
  loadTerritoryStoreFromReadModel,
  loadTerritoryStoresFromReadModel,
  patchTerritoryStoreReadModel,
  recordTerritoryCheckInEvent,
  syncTerritoryStoreToReadModel,
  syncTerritoryStoresReadModel,
} from '@/lib/server/territory-read-model';
import { createTerritoryCheckInService } from '@/lib/server/notion-territory-checkins';
import { createTerritoryStoreDetailService } from '@/lib/server/notion-territory-store-detail';
import { loadStoreVendorDaySummary } from '@/lib/server/notion-territory-vendor-days';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { checkGoogleBudgetCap, estimateGoogleUsageCostUsd, recordGoogleUsage } from '@/lib/server/google-usage';
import {
  colorForStatus,
  normalizeStatus,
  pinKindForStatus,
  type TerritoryFilterCount,
  type TerritoryStoreContact,
  type TerritoryStorePin,
  type TerritoryStoresResponse,
} from '@/lib/territory/types';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const GOOGLE_GEOCODING_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const GEOCODE_THROTTLE_MS = 110;
const TERRITORY_SNAPSHOT_KEY = 'territory-stores-v2';
const DEFAULT_SYNC_TTL_MINUTES = 5;
const DEFAULT_STALE_SYNC_GEOCODE_LOOKUPS = 12;
const DEFAULT_FORCE_SYNC_GEOCODE_LOOKUPS = 80;
const DEFAULT_INCREMENTAL_FRESHNESS_SECONDS = 8;
const SCHEMA_OPTIONS_TTL_MS = 5 * 60 * 1000;

const REQUIRED_PROPERTIES = [
  { name: 'Dispensary Name', type: 'title' },
  { name: 'Map Location', type: 'place' },
  { name: 'Account Status', type: 'status' },
  { name: 'Rep', type: 'people' },
] as const;

type NotionPropertySchema = {
  id: string;
  type: string;
  select?: {
    options?: Array<{
      id?: string;
      name?: string | null;
      color?: string | null;
    }>;
  } | null;
  multi_select?: {
    options?: Array<{
      id?: string;
      name?: string | null;
      color?: string | null;
    }>;
  } | null;
};

type NotionDatabaseResponse = {
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, NotionPropertySchema>;
};

type NotionPageResponse = {
  id: string;
  last_edited_time: string;
  parent?: {
    type?: string;
    database_id?: string;
  } | null;
  properties?: Record<string, NotionPropertyValue>;
};

type NotionQueryResponse = {
  results?: NotionPageResponse[];
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
  number?: number | null;
  checkbox?: boolean | null;
  select?: { name?: string | null } | null;
  status?: {
    name?: string;
  } | null;
  date?: {
    start?: string | null;
  } | null;
  formula?: {
    number?: number | null;
    string?: string | null;
    boolean?: boolean | null;
    date?: {
      start?: string | null;
    } | null;
  } | null;
  rollup?: {
    type?: string | null;
    number?: number | null;
    string?: string | null;
    boolean?: boolean | null;
    date?: {
      start?: string | null;
    } | null;
    array?: NotionPropertyValue[];
    results?: NotionPropertyValue[];
  } | null;
  people?: NotionPerson[];
  place?: NotionPlace | null;
  relation?: Array<{ id?: string }>;
};

interface GeoBudget {
  remaining: number;
  lookedUp: number;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  source: TerritoryStorePin['locationSource'];
  precision: TerritoryStorePin['locationPrecision'];
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

type TerritoryOrderDateFilter = 'all' | 'last_month' | 'last_2_months' | 'three_plus_months';
type TerritorySampleAccountTypeFilter = 'all' | 'customers' | 'non_customers';
type TerritoryVendorDayStatusFilter = string[];

interface CachedContactRow extends TerritoryStoreContact {
  accountPageIds: string[];
  lastEditedTime: string;
}

let lastGeocodeLookupAt = 0;
const memoryGeocodeCache = new Map<string, GeocodeResult>();
let territorySyncInFlight: Promise<void> | null = null;
let territoryQueueSyncInFlight: Promise<void> | null = null;
let territoryLastSyncError: string | null = null;
let referralSourceSchemaOptionsCache:
  | {
      values: string[];
      expiresAt: number;
    }
  | null = null;
const CONTACTS_SNAPSHOT_KEY = 'crm-contacts-v1';

function requiredEnv(name: 'NOTION_API_KEY' | 'NOTION_MASTER_LIST_DATABASE_ID') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function territoryOrgId() {
  const configured = process.env.TERRITORY_ORG_ID?.trim();
  if (configured) {
    return configured;
  }
  if (AUTH_BYPASS_MODE) {
    return DEMO_ORG_ID;
  }
  throw new Error('TERRITORY_ORG_ID is required for mirrored territory comments');
}

function googleGeocodingKey() {
  return (
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ||
    ''
  );
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

function readRollupItems(property: NotionPropertyValue | undefined): NotionPropertyValue[] {
  if (!property?.rollup) {
    return [];
  }

  const fromArray = Array.isArray(property.rollup.array) ? property.rollup.array : [];
  const fromResults = Array.isArray(property.rollup.results) ? property.rollup.results : [];
  return [...fromArray, ...fromResults];
}

function readIsoDateProperty(property: NotionPropertyValue | undefined): string {
  const directDate = readDateStartProperty(property);
  if (directDate) {
    return directDate;
  }

  const formulaDate = typeof property?.formula?.date?.start === 'string' ? property.formula.date.start : '';
  if (formulaDate) {
    return formulaDate;
  }

  const rollupDate = typeof property?.rollup?.date?.start === 'string' ? property.rollup.date.start : '';
  if (rollupDate) {
    return rollupDate;
  }

  const rollupItems = readRollupItems(property);
  if (rollupItems.length > 0) {
    const candidates: string[] = rollupItems
      .map((item) => readIsoDateProperty(item))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => {
        const leftTime = new Date(left).getTime();
        const rightTime = new Date(right).getTime();
        return rightTime - leftTime;
      });

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  const text = readTextFromAnyProperty(property);
  if (!text) {
    return '';
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
}

function readFormulaNumber(property: NotionPropertyValue | undefined) {
  const formula = (property as { formula?: { number?: number } } | undefined)?.formula;
  if (typeof formula?.number === 'number') {
    return formula.number;
  }
  return 0;
}

function readSelectNameProperty(property: NotionPropertyValue | undefined): string {
  const selectName = typeof property?.select?.name === 'string' ? property.select.name.trim() : '';
  if (selectName) {
    return selectName;
  }
  const statusName = typeof property?.status?.name === 'string' ? property.status.name.trim() : '';
  if (statusName) {
    return statusName;
  }

  const formulaText = typeof property?.formula?.string === 'string' ? property.formula.string.trim() : '';
  if (formulaText) {
    return formulaText;
  }

  const rollupString = typeof property?.rollup?.string === 'string' ? property.rollup.string.trim() : '';
  if (rollupString) {
    return rollupString;
  }

  const rollupItems = readRollupItems(property);
  for (const item of rollupItems) {
    const nested: string = readSelectNameProperty(item);
    if (nested) {
      return nested;
    }
  }

  return '';
}

function readPeopleTextProperty(property: NotionPropertyValue | undefined): string {
  if (Array.isArray(property?.people)) {
    const direct = property.people
      .map((person) => person?.name?.trim())
      .filter((value): value is string => Boolean(value))
      .join(', ');
    if (direct) {
      return direct;
    }
  }

  const rollupItems = readRollupItems(property);
  if (rollupItems.length === 0) {
    return '';
  }

  const nestedPeople: string = rollupItems
    .map((item) => readPeopleTextProperty(item))
    .filter(Boolean)
    .join(', ')
    .trim();

  return nestedPeople;
}

function readPeopleValuesProperty(property: NotionPropertyValue | undefined): {
  names: string[];
  emails: string[];
} {
  const names: string[] = [];
  const emails: string[] = [];

  if (Array.isArray(property?.people)) {
    for (const person of property.people) {
      const name = person?.name?.trim();
      const email = person?.person?.email?.trim();
      if (name) {
        names.push(name);
      }
      if (email) {
        emails.push(email);
      }
    }
  }

  const rollupItems = readRollupItems(property);
  for (const item of rollupItems) {
    const nested = readPeopleValuesProperty(item);
    names.push(...nested.names);
    emails.push(...nested.emails);
  }

  if (names.length === 0) {
    const text = readPeopleTextProperty(property) || readTextFromAnyProperty(property);
    if (text) {
      names.push(
        ...text
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }

  return {
    names: [...new Set(names)],
    emails: [...new Set(emails)],
  };
}

function readNumberProperty(property: NotionPropertyValue | undefined): number | null {
  if (typeof property?.number === 'number' && Number.isFinite(property.number)) {
    return property.number;
  }

  if (typeof property?.formula?.number === 'number' && Number.isFinite(property.formula.number)) {
    return property.formula.number;
  }

  if (typeof property?.rollup?.number === 'number' && Number.isFinite(property.rollup.number)) {
    return property.rollup.number;
  }

  const rollupItems = readRollupItems(property);
  if (rollupItems.length > 0) {
    const numericChildren: number[] = rollupItems
      .map((item) => readNumberProperty(item))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (numericChildren.length > 0) {
      return numericChildren[0];
    }
  }

  const richText = textFromRichTextProperty(property);
  if (richText) {
    const parsed = Number.parseFloat(richText.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readBooleanProperty(property: NotionPropertyValue | undefined): boolean | null {
  if (typeof property?.checkbox === 'boolean') {
    return property.checkbox;
  }

  if (typeof property?.formula?.boolean === 'boolean') {
    return property.formula.boolean;
  }

  if (typeof property?.rollup?.boolean === 'boolean') {
    return property.rollup.boolean;
  }

  const rollupItems = readRollupItems(property);
  if (rollupItems.length > 0) {
    for (const item of rollupItems) {
      const nested: boolean | null = readBooleanProperty(item);
      if (nested !== null) {
        return nested;
      }
    }
  }

  const text = readTextFromAnyProperty(property).toLowerCase();
  if (!text) {
    return null;
  }
  if (['yes', 'true', 'needed', 'required'].some((value) => text === value)) {
    return true;
  }
  if (['no', 'false', 'not needed', 'none'].some((value) => text === value)) {
    return false;
  }
  return null;
}

function readTextFromAnyProperty(property: NotionPropertyValue | undefined): string {
  if (!property) {
    return '';
  }

  const title = textFromTitleProperty(property);
  if (title) return title;

  const richText = textFromRichTextProperty(property);
  if (richText) return richText;

  const selectName = readSelectNameProperty(property);
  if (selectName) return selectName;

  const peopleText = readPeopleTextProperty(property);
  if (peopleText) return peopleText;

  const email = readEmailProperty(property);
  if (email) return email;

  const phone = readPhoneNumberProperty(property);
  if (phone) return phone;

  const date = readDateStartProperty(property);
  if (date) return date;

  const number = readNumberProperty(property);
  if (number !== null) return String(number);

  const formulaText = typeof property.formula?.string === 'string' ? property.formula.string.trim() : '';
  if (formulaText) return formulaText;

  const rollupNumber = typeof property.rollup?.number === 'number' && Number.isFinite(property.rollup.number) ? property.rollup.number : null;
  if (rollupNumber !== null) return String(rollupNumber);

  const rollupString = typeof property.rollup?.string === 'string' ? property.rollup.string.trim() : '';
  if (rollupString) return rollupString;

  const rollupDate = typeof property.rollup?.date?.start === 'string' ? property.rollup.date.start : '';
  if (rollupDate) return rollupDate;

  const rollupItems = readRollupItems(property);
  if (rollupItems.length > 0) {
    const arrayText: string = rollupItems
      .map((item) => readTextFromAnyProperty(item))
      .filter(Boolean)
      .join(', ')
      .trim();
    if (arrayText) return arrayText;
  }

  return '';
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

function pickPropertyNameByTypes(
  properties: Record<string, NotionPropertySchema>,
  candidates: string[],
  expectedTypes: string[],
) {
  const candidateSet = new Set(candidates.map(normalizePropertyName));
  const expectedTypeSet = new Set(expectedTypes);
  for (const [name, schema] of Object.entries(properties)) {
    if (!expectedTypeSet.has(schema.type)) {
      continue;
    }
    if (candidateSet.has(normalizePropertyName(name))) {
      return name;
    }
  }
  return null;
}

function readSchemaSelectOptions(property: NotionPropertySchema | undefined): string[] {
  if (!property) {
    return [];
  }

  const options =
    property.type === 'select'
      ? property.select?.options ?? []
      : property.type === 'multi_select'
        ? property.multi_select?.options ?? []
        : [];

  return options
    .map((option) => option?.name?.trim() ?? '')
    .filter(Boolean);
}

async function loadReferralSourceOptionsFromSchema(input?: { refresh?: boolean }) {
  const now = Date.now();
  if (!input?.refresh && referralSourceSchemaOptionsCache && referralSourceSchemaOptionsCache.expiresAt > now) {
    return referralSourceSchemaOptionsCache.values;
  }

  const schema = await fetchAndValidateDatabaseSchema();
  const propertyName = pickPropertyNameByTypes(
    schema.database.properties ?? {},
    ['Referral Source'],
    ['select', 'multi_select'],
  );
  const values = propertyName
    ? readSchemaSelectOptions(schema.database.properties?.[propertyName])
    : [];

  referralSourceSchemaOptionsCache = {
    values,
    expiresAt: now + SCHEMA_OPTIONS_TTL_MS,
  };

  return values;
}

function mergeFilterCountsWithCanonicalOptions(
  counts: TerritoryFilterCount[],
  canonicalValues: string[],
  selectedValues: string[] = [],
): TerritoryFilterCount[] {
  const merged = new Map<string, TerritoryFilterCount>();

  for (const item of counts) {
    const value = item.value.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.count += item.count;
    } else {
      merged.set(key, { value, count: item.count });
    }
  }

  for (const value of canonicalValues) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.value = trimmed;
    } else {
      merged.set(key, { value: trimmed, count: 0 });
    }
  }

  for (const value of selectedValues) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, { value: trimmed, count: 0 });
    }
  }

  return [...merged.values()].sort((left, right) => left.value.localeCompare(right.value));
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

const STATE_NAME_PATTERN = new RegExp(`\\b(${Object.keys(STATE_NAME_TO_CODE).join('|')})\\b`, 'i');

function normalizeStateCode(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }

  const byName = STATE_NAME_TO_CODE[upper];
  return byName ?? null;
}

function parseZipCode(input: string | null | undefined) {
  if (!input) {
    return null;
  }
  const match = input.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1] ?? null;
}

function inferStateFromZip(zip: string | null | undefined) {
  if (!zip) {
    return null;
  }
  const parsed = Number.parseInt(zip, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  // NY zip ranges (including 00501 and 06390 edge cases).
  if (parsed === 501 || parsed === 6390 || (parsed >= 10000 && parsed <= 14999)) {
    return 'NY';
  }

  return null;
}

function parseStateFromAddress(address: string | null | undefined) {
  if (!address) {
    return null;
  }

  const upper = address.toUpperCase();

  const explicitZipState = upper.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  const explicitState = normalizeStateCode(explicitZipState?.[1] ?? null);
  if (explicitState) {
    return explicitState;
  }

  const explicitDelimitedState = upper.match(/,\s*([A-Z]{2})\s*(?:,|$)/);
  const delimitedState = normalizeStateCode(explicitDelimitedState?.[1] ?? null);
  if (delimitedState) {
    return delimitedState;
  }

  const stateNameMatch = upper.match(STATE_NAME_PATTERN);
  const stateByName = normalizeStateCode(stateNameMatch?.[1] ?? null);
  if (stateByName) {
    return stateByName;
  }

  return inferStateFromZip(parseZipCode(upper));
}

function parseCityFromAddress(address: string | null | undefined) {
  if (!address) {
    return null;
  }

  const withState = address.match(/,\s*([^,]+?),\s*[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/);
  if (withState?.[1]) {
    return withState[1].trim();
  }

  const withZip = address.match(/,\s*([^,]+?)\s+\d{5}(?:-\d{4})?\b/);
  if (withZip?.[1]) {
    return withZip[1].trim();
  }

  return null;
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

type GeocodePrecision = 'address' | 'city';

async function geocodeAddressWithCache(
  address: string,
  budget: GeoBudget,
  allowLiveLookup: boolean,
  precision: GeocodePrecision,
  expectedState?: string | null,
): Promise<GeocodeResult | null> {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return null;
  }

  const cacheKey = `${precision}:${normalizedAddress}`;
  const memoryCached = memoryGeocodeCache.get(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  let cached: { lat: number; lng: number; formattedAddress: string | null } | null = null;
  try {
    cached = await prisma.spatialGeocodeCache.findUnique({
      where: { addressNormalized: cacheKey },
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
    const cachedResult: GeocodeResult = {
      lat: cached.lat,
      lng: cached.lng,
      formattedAddress: cached.formattedAddress ?? address,
      source: precision === 'city' ? 'google-city-cache' : 'google-address-cache',
      precision,
    };
    memoryGeocodeCache.set(cacheKey, cachedResult);
    return cachedResult;
  }

  if (!allowLiveLookup || budget.remaining <= 0) {
    return null;
  }

  const budgetCheck = await checkGoogleBudgetCap(estimateGoogleUsageCostUsd('geocoding', 1));
  if (!budgetCheck.allowed) {
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

  const key = googleGeocodingKey();
  if (!key) {
    return null;
  }

  const geocodeUrl = `${GOOGLE_GEOCODING_BASE}?address=${encodeURIComponent(address)}&components=country:US&key=${encodeURIComponent(key)}`;
  let response: Response;
  try {
    response = await fetch(geocodeUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  } finally {
    void recordGoogleUsage('geocoding', 1).catch(() => undefined);
  }

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      address_components?: Array<{
        long_name?: string;
        short_name?: string;
        types?: string[];
      }>;
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
    }>;
  };

  if (payload.status !== 'OK') {
    return null;
  }

  const result = payload.results?.[0];
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;

  if (typeof lat !== 'number' || !Number.isFinite(lat) || typeof lng !== 'number' || !Number.isFinite(lng)) {
    return null;
  }

  const expectedStateCode = normalizeStateCode(expectedState ?? null);
  if (expectedStateCode) {
    const stateComponent = result?.address_components?.find((component) => component.types?.includes('administrative_area_level_1'));
    const geocodedState = normalizeStateCode(stateComponent?.short_name ?? stateComponent?.long_name ?? null) ??
      normalizeStateCode(parseStateFromAddress(result?.formatted_address ?? null));
    if (geocodedState && geocodedState !== expectedStateCode) {
      return null;
    }
  }

  const geocoded: GeocodeResult = {
    lat,
    lng,
    formattedAddress: result?.formatted_address ?? address,
    source: precision === 'city' ? 'google-city-live' : 'google-address-live',
    precision,
  };

  memoryGeocodeCache.set(cacheKey, geocoded);

  try {
    await prisma.spatialGeocodeCache.upsert({
      where: { addressNormalized: cacheKey },
      create: {
        addressNormalized: cacheKey,
        lat: geocoded.lat,
        lng: geocoded.lng,
        formattedAddress: geocoded.formattedAddress,
      },
      update: {
        lat: geocoded.lat,
        lng: geocoded.lng,
        formattedAddress: geocoded.formattedAddress,
      },
    });
  } catch {
    // Best effort cache write only.
  }

  return geocoded;
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

async function queryUpdatedStorePages(databaseId: string, after: string) {
  const allRows: NotionPageResponse[] = [];
  let startCursor: string | undefined;

  while (true) {
    const result = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        filter: {
          timestamp: 'last_edited_time',
          last_edited_time: {
            after,
          },
        },
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

async function queryStorePage(pageId: string) {
  try {
    const page = await notionRequest<NotionPageResponse>(`/pages/${pageId}`);
    const parentDatabaseId = page.parent?.type === 'database_id' ? page.parent.database_id?.trim() ?? '' : '';
    const expectedDatabaseId = requiredEnv('NOTION_MASTER_LIST_DATABASE_ID').replace(/-/g, '').toLowerCase();
    if (!parentDatabaseId || parentDatabaseId.replace(/-/g, '').toLowerCase() !== expectedDatabaseId) {
      return null;
    }
    return page;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('(404)')) {
      return null;
    }
    throw error;
  }
}

async function mapNotionPageToTerritoryStore(
  row: NotionPageResponse,
  budget: GeoBudget,
): Promise<TerritoryStorePin | null> {
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
  const repProperty =
    (propertyByCandidates('rep', 'picc rep', 'sales rep') as NotionPropertyValue | undefined) ?? properties['Rep'];
  const repValues = readPeopleValuesProperty(repProperty);
  const repNames = repValues.names;
  const repEmails = repValues.emails;

  const place = properties['Map Location']?.place;
  const notionLat = typeof place?.lat === 'number' ? place.lat : null;
  const notionLng = typeof place?.lon === 'number' ? place.lon : null;
  const hasPlaceCoords = notionLat !== null && notionLng !== null;

  const placeName = typeof place?.name === 'string' ? place.name.trim() : '';
  const placeAddress = typeof place?.address === 'string' ? place.address.trim() : '';

  const fullAddress = textFromRichTextProperty((propertyByCandidates('full address', 'address') as NotionPropertyValue | undefined) ?? properties['Full Address']);
  const address1 = textFromRichTextProperty((propertyByCandidates('address 1', 'street address') as NotionPropertyValue | undefined) ?? properties['Address 1']);
  const city = textFromRichTextProperty((propertyByCandidates('city') as NotionPropertyValue | undefined) ?? properties['City']);
  const stateField = textFromRichTextProperty((propertyByCandidates('state') as NotionPropertyValue | undefined) ?? properties.State);
  const zipcode = textFromRichTextProperty((propertyByCandidates('zipcode', 'zip code') as NotionPropertyValue | undefined) ?? properties['Zipcode']);
  const licenseNumber = textFromRichTextProperty((propertyByCandidates('license number', 'license') as NotionPropertyValue | undefined) ?? properties['License Number']);
  const daysOverdue = readFormulaNumber((propertyByCandidates('days overdue') as NotionPropertyValue | undefined) ?? properties['Days Overdue']);
  const phoneNumber = readPhoneNumberProperty((propertyByCandidates('phone number', 'phone') as NotionPropertyValue | undefined) ?? properties['Phone Number']) || null;
  const email = readEmailProperty((propertyByCandidates('email', 'email address') as NotionPropertyValue | undefined) ?? properties.Email) || null;
  const vendorDayStatus =
    readSelectNameProperty((propertyByCandidates('vendor day status') as NotionPropertyValue | undefined) ?? properties['Vendor Day Status']) ||
    null;
  const lastSampleOrderDate =
    readIsoDateProperty((propertyByCandidates('last sample order date', 'sample order date', 'last sample date') as NotionPropertyValue | undefined) ?? properties['Last Sample Order Date']) ||
    null;
  const lastSampleDeliveryDate =
    readIsoDateProperty(
      (propertyByCandidates(
        'last sample delivery date',
        'sample delivery date',
        'last sample delivered date',
        'sample delivered date',
      ) as NotionPropertyValue | undefined) ?? properties['Last Sample Delivery Date'],
    ) || null;
  const lastOrderDate =
    readIsoDateProperty((propertyByCandidates('last order date', 'most recent order date') as NotionPropertyValue | undefined) ?? properties['Last Order Date']) ||
    null;
  const referralSource =
    readTextFromAnyProperty((propertyByCandidates('referral source') as NotionPropertyValue | undefined) ?? properties['Referral Source']) || null;
  const followUpDate = readDateStartProperty((propertyByCandidates('follow-up date', 'follow up date') as NotionPropertyValue | undefined) ?? properties['Follow-up Date']) || null;
  const followUpNeeded = readBooleanProperty((propertyByCandidates('follow-up needed', 'follow up needed') as NotionPropertyValue | undefined) ?? properties['Follow-up Needed']);
  const followUpReason = readTextFromAnyProperty((propertyByCandidates('follow-up reason', 'follow up reason') as NotionPropertyValue | undefined) ?? properties['Follow-up Reason']) || null;
  const notes = textFromRichTextProperty((propertyByCandidates('notes', 'account notes', 'store notes') as NotionPropertyValue | undefined) ?? properties.Notes) || null;
  const lastCheckIn = readDateStartProperty((propertyByCandidates('last check-in', 'last check in', 'last visit') as NotionPropertyValue | undefined) ?? properties['Last Check-in']) || null;
  const isPreferredPartner = readBooleanProperty(
    (propertyByCandidates(
      'picc preferred partner',
      'preferred partner',
      'is picc preferred partner',
      'preferred picc partner',
    ) as NotionPropertyValue | undefined) ??
      properties['PICC Preferred Partner'],
  );

  const fallbackAddress = firstNonEmpty([fullAddress, placeAddress, [address1, city, stateField, zipcode].filter(Boolean).join(', '), placeName]);
  const inferredCity = firstNonEmpty([city, parseCityFromAddress(fallbackAddress)]);
  const inferredState = firstNonEmpty([
    normalizeStateCode(stateField),
    parseStateFromAddress(fallbackAddress),
    inferStateFromZip(parseZipCode(zipcode)),
  ]);
  const cityStateQuery = firstNonEmpty([[inferredCity, inferredState].filter(Boolean).join(', '), inferredCity, inferredState]);

  let lat: number | null = hasPlaceCoords ? notionLat : null;
  let lng: number | null = hasPlaceCoords ? notionLng : null;
  let locationSource: TerritoryStorePin['locationSource'] = hasPlaceCoords ? 'notion-place' : 'google-address-cache';
  let locationPrecision: TerritoryStorePin['locationPrecision'] = hasPlaceCoords ? 'exact' : 'address';
  let resolvedAddress = firstNonEmpty([placeAddress, fullAddress, placeName]);
  let isApproximate = !hasPlaceCoords;

  if (!hasPlaceCoords && fallbackAddress) {
    const addressGeocode = await geocodeAddressWithCache(
      fallbackAddress,
      budget,
      budget.remaining > 0,
      'address',
      inferredState,
    );
    if (addressGeocode) {
      lat = addressGeocode.lat;
      lng = addressGeocode.lng;
      resolvedAddress = addressGeocode.formattedAddress;
      locationSource = addressGeocode.source;
      locationPrecision = 'address';
      isApproximate = false;
    }
  }

  if ((lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) && cityStateQuery) {
    const cityGeocode = await geocodeAddressWithCache(
      cityStateQuery,
      budget,
      budget.remaining > 0,
      'city',
      inferredState,
    );
    if (cityGeocode) {
      lat = cityGeocode.lat;
      lng = cityGeocode.lng;
      resolvedAddress = resolvedAddress ?? cityGeocode.formattedAddress;
      locationSource = cityGeocode.source;
      locationPrecision = 'city';
      isApproximate = true;
    }
  }

  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    lat = 0;
    lng = 0;
    locationSource = 'unavailable';
    locationPrecision = 'unavailable';
    isApproximate = true;
    resolvedAddress = resolvedAddress ?? firstNonEmpty([fallbackAddress, cityStateQuery, inferredCity, inferredState, 'Location unavailable']);
  }

  return {
    id: row.id,
    notionPageId: row.id,
    name,
    status: statusName,
    statusKey,
    statusColor: colorForStatus(statusName),
    pinKind: pinKindForStatus(statusName),
    repNames,
    repEmails,
    lat,
    lng,
    locationLabel: firstNonEmpty([placeName, fallbackAddress]),
    locationAddress: resolvedAddress,
    locationSource,
    locationPrecision,
    isApproximate,
    lastEditedTime: row.last_edited_time,
    licenseNumber: licenseNumber || null,
    city: inferredCity ?? null,
    state: inferredState ?? parseStateFromAddress(firstNonEmpty([resolvedAddress, fullAddress, fallbackAddress])) ?? null,
    daysOverdue,
    phoneNumber,
    email,
    referralSource,
    vendorDayStatus,
    lastSampleOrderDate,
    lastSampleDeliveryDate,
    lastOrderDate,
    followUpDate,
    followUpNeeded,
    followUpReason,
    notes,
    lastCheckIn,
    isPreferredPartner,
  };
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
    .map<TerritoryStorePin | null>((row) => {
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
          row.locationSource === 'notion-place' ||
          row.locationSource === 'google-address-cache' ||
          row.locationSource === 'google-address-live' ||
          row.locationSource === 'google-city-cache' ||
          row.locationSource === 'google-city-live' ||
          row.locationSource === 'synthetic' ||
          row.locationSource === 'unavailable'
            ? row.locationSource
            : 'google-address-cache',
        locationPrecision:
          row.locationPrecision === 'exact' ||
          row.locationPrecision === 'address' ||
          row.locationPrecision === 'city' ||
          row.locationPrecision === 'synthetic' ||
          row.locationPrecision === 'unavailable'
            ? row.locationPrecision
            : 'address',
        isApproximate: Boolean(row.isApproximate),
        lastEditedTime: typeof row.lastEditedTime === 'string' && row.lastEditedTime ? row.lastEditedTime : new Date().toISOString(),
        referralSource: typeof row.referralSource === 'string' && row.referralSource.trim() ? row.referralSource.trim() : null,
        lastSampleOrderDate: typeof row.lastSampleOrderDate === 'string' && row.lastSampleOrderDate.trim() ? row.lastSampleOrderDate.trim() : null,
        lastSampleDeliveryDate:
          typeof row.lastSampleDeliveryDate === 'string' && row.lastSampleDeliveryDate.trim() ? row.lastSampleDeliveryDate.trim() : null,
        lastOrderDate: typeof row.lastOrderDate === 'string' && row.lastOrderDate.trim() ? row.lastOrderDate.trim() : null,
      };
    })
    .filter((row): row is TerritoryStorePin => row !== null);
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
    const pin = await mapNotionPageToTerritoryStore(row, geocodeBudget);
    if (!pin) {
      continue;
    }

    if (pin.locationPrecision === 'unavailable') {
      unresolvedLocationCount += 1;
    }

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

async function syncTerritorySnapshotIncrementalFromNotion(input: {
  after: string;
  maxLiveGeocodeLookups?: number;
}) {
  const existingSnapshot = await readNotionCacheSnapshot<TerritoryStorePin[]>(TERRITORY_SNAPSHOT_KEY);
  if (!existingSnapshot) {
    return syncTerritorySnapshotFromNotion(input);
  }

  const schema = await fetchAndValidateDatabaseSchema();
  if (schema.missingFields.length > 0) {
    throw new Error(`Notion schema missing required fields: ${schema.missingFields.join(', ')}`);
  }

  const rows = await queryUpdatedStorePages(schema.databaseId, input.after);
  const geocodeBudget: GeoBudget = {
    remaining: Math.max(0, input.maxLiveGeocodeLookups ?? 0),
    lookedUp: 0,
  };

  const payloadById = new Map(
    normalizeSnapshotPayload(existingSnapshot.payload).map((store) => [normalizePageId(store.id), store]),
  );
  let lastEditedMax = existingSnapshot.lastEditedMax;
  const changedStores: TerritoryStorePin[] = [];

  for (const row of rows) {
    const store = await mapNotionPageToTerritoryStore(row, geocodeBudget);
    if (!store) {
      continue;
    }
    payloadById.set(normalizePageId(store.id), store);
    changedStores.push(store);
    lastEditedMax = maxIsoDate(lastEditedMax, store.lastEditedTime);
  }

  const nextPayload = [...payloadById.values()].sort((a, b) => a.name.localeCompare(b.name));

  await writeNotionCacheSnapshot<TerritoryStorePin[]>({
    key: TERRITORY_SNAPSHOT_KEY,
    payload: nextPayload,
    recordsRead: Math.max(existingSnapshot.recordsRead, nextPayload.length),
    unresolvedLocationCount: nextPayload.filter((store) => store.locationPrecision === 'unavailable').length,
    lastEditedMax,
  });

  for (const store of changedStores) {
    await syncTerritoryStoreToReadModel(store);
  }

  return {
    snapshot: {
      key: TERRITORY_SNAPSHOT_KEY,
      payload: nextPayload,
      recordsRead: Math.max(existingSnapshot.recordsRead, nextPayload.length),
      unresolvedLocationCount: nextPayload.filter((store) => store.locationPrecision === 'unavailable').length,
      lastEditedMax,
      syncedAt: new Date().toISOString(),
    } satisfies NotionCacheSnapshot<TerritoryStorePin[]>,
    geocodedThisSync: geocodeBudget.lookedUp,
    changedCount: changedStores.length,
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
  const freshnessCheckSeconds = parsePositiveInt(
    process.env.TERRITORY_INCREMENTAL_FRESHNESS_SECONDS,
    DEFAULT_INCREMENTAL_FRESHNESS_SECONDS,
  );

  if (
    !input?.refresh &&
    cached &&
    cached.payload.length > 0 &&
    cached.lastEditedMax &&
    !territorySyncInFlight &&
    isSnapshotOlderThanSeconds(cached.syncedAt, freshnessCheckSeconds)
  ) {
    try {
      const synced = await syncTerritorySnapshotIncrementalFromNotion({
        after: cached.lastEditedMax,
        maxLiveGeocodeLookups: 0,
      });
      cached = synced.snapshot;
      geocodedThisRequest = synced.geocodedThisSync;
      syncError = null;
      syncing = false;
    } catch (error) {
      syncError = error instanceof Error ? error.message : 'Territory sync failed';
    }
  }

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
      try {
        const synced = cached.lastEditedMax
          ? await syncTerritorySnapshotIncrementalFromNotion({
              after: cached.lastEditedMax,
              maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups ?? defaultGeocodeBudget,
            })
          : await syncTerritorySnapshotFromNotion({
              maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups ?? defaultGeocodeBudget,
            });
        cached = synced.snapshot;
        geocodedThisRequest = synced.geocodedThisSync;
        syncError = null;
      } catch (error) {
        stale = true;
        syncError = error instanceof Error ? error.message : 'Territory sync failed';
        startTerritoryBackgroundSync({
          maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups ?? defaultGeocodeBudget,
        });
        syncing = true;
      }
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

async function resolveStoreByIdentifier(stores: TerritoryStorePin[], storeId: string) {
  const direct = findStoreById(stores, storeId);
  if (direct) {
    return direct;
  }

  const identity = await resolveAccountIdentity(storeId);
  if (!identity?.notionPageId) {
    return null;
  }

  return findStoreById(stores, identity.notionPageId);
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

function maxIsoDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left >= right ? left : right;
}

function isSnapshotOlderThanSeconds(syncedAt: string | null | undefined, seconds: number) {
  if (!syncedAt) {
    return true;
  }
  const syncedAtMs = Date.parse(syncedAt);
  if (!Number.isFinite(syncedAtMs)) {
    return true;
  }
  return Date.now() - syncedAtMs > Math.max(1, seconds) * 1000;
}

function matchesLastOrderDateFilter(value: string | null | undefined, filter: TerritoryOrderDateFilter) {
  if (filter === 'all') {
    return true;
  }

  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  if (ageDays < 0) {
    return false;
  }

  if (filter === 'last_month') {
    return ageDays <= 30;
  }

  if (filter === 'last_2_months') {
    return ageDays <= 60;
  }

  return ageDays > 60;
}

function buildVendorDayStatusCounts(stores: TerritoryStorePin[]): TerritoryFilterCount[] {
  const counts = new Map<string, number>();
  for (const store of stores) {
    const value = store.vendorDayStatus?.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

async function upsertStoreInSnapshot(store: TerritoryStorePin) {
  const snapshot = await readNotionCacheSnapshot<TerritoryStorePin[]>(TERRITORY_SNAPSHOT_KEY);
  const payload = normalizeSnapshotPayload(snapshot?.payload);
  const normalizedStoreId = normalizePageId(store.id);
  const nextPayload = payload.filter(
    (entry) => normalizePageId(entry.id) !== normalizedStoreId && normalizePageId(entry.notionPageId) !== normalizedStoreId,
  );
  nextPayload.push(store);
  nextPayload.sort((a, b) => a.name.localeCompare(b.name));

  await writeNotionCacheSnapshot({
    key: TERRITORY_SNAPSHOT_KEY,
    payload: nextPayload,
    recordsRead: Math.max(snapshot?.recordsRead ?? 0, nextPayload.length),
    unresolvedLocationCount: nextPayload.filter((entry) => entry.locationPrecision === 'unavailable').length,
    lastEditedMax: maxIsoDate(snapshot?.lastEditedMax, store.lastEditedTime),
  });
}

async function enqueueTerritoryStoreSync(pageId: string, input?: { reason?: string }) {
  const orgId = territoryOrgId();
  const notionPageId = pageId.trim();
  if (!notionPageId) {
    return;
  }

  await prisma.territoryStoreSyncJob.upsert({
    where: {
      orgId_notionPageId: {
        orgId,
        notionPageId,
      },
    },
    create: {
      orgId,
      notionPageId,
      reason: input?.reason ?? 'webhook',
      status: 'pending',
    },
    update: {
      reason: input?.reason ?? 'webhook',
      status: 'pending',
      completedAt: null,
      lastError: null,
    },
  });
}

async function syncTerritoryStoreByPageId(
  pageId: string,
  input?: { maxLiveGeocodeLookups?: number },
) {
  const page = await queryStorePage(pageId);
  if (!page) {
    return {
      ok: true as const,
      ignored: 'not-master-list-page',
    };
  }

  const geocodeBudget: GeoBudget = {
    remaining: Math.max(0, input?.maxLiveGeocodeLookups ?? 0),
    lookedUp: 0,
  };
  const store = await mapNotionPageToTerritoryStore(page, geocodeBudget);
  if (!store) {
    return {
      ok: true as const,
      ignored: 'not-parseable-store',
    };
  }

  await Promise.all([upsertStoreInSnapshot(store), syncTerritoryStoreToReadModel(store)]);

  return {
    ok: true as const,
    storeId: store.id,
    notionPageId: store.notionPageId,
    geocoded: geocodeBudget.lookedUp,
  };
}

export async function processPendingTerritoryStoreSyncQueue(input?: {
  limit?: number;
  maxLiveGeocodeLookups?: number;
}) {
  if (territoryQueueSyncInFlight) {
    await territoryQueueSyncInFlight;
    return { processed: 0, queued: 0 };
  }

  const orgId = territoryOrgId();
  const limit = Math.max(1, Math.min(input?.limit ?? 12, 50));

  territoryQueueSyncInFlight = (async () => {
    const jobs = await prisma.territoryStoreSyncJob.findMany({
      where: {
        orgId,
        status: {
          in: ['pending', 'error'],
        },
        attemptCount: {
          lt: 5,
        },
      },
      orderBy: [{ queuedAt: 'asc' }, { updatedAt: 'asc' }],
      take: limit,
    });

    for (const job of jobs) {
      await prisma.territoryStoreSyncJob.update({
        where: { id: job.id },
        data: {
          status: 'processing',
          attemptCount: {
            increment: 1,
          },
          lastAttemptedAt: new Date(),
        },
      });

      try {
        const result = await syncTerritoryStoreByPageId(job.notionPageId, {
          maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups ?? 0,
        });

        await prisma.territoryStoreSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            lastError: result.ok && 'ignored' in result ? result.ignored : null,
          },
        });
      } catch (error) {
        await prisma.territoryStoreSyncJob.update({
          where: { id: job.id },
          data: {
            status: 'error',
            lastError: error instanceof Error ? error.message : 'Territory store sync failed',
          },
        });
      }
    }
  })();

  try {
    await territoryQueueSyncInFlight;
  } finally {
    territoryQueueSyncInFlight = null;
  }

  const [processed, queued] = await Promise.all([
    prisma.territoryStoreSyncJob.count({
      where: {
        orgId,
        status: 'completed',
        completedAt: {
          gte: new Date(Date.now() - 5 * 60_000),
        },
      },
    }),
    prisma.territoryStoreSyncJob.count({
      where: {
        orgId,
        status: {
          in: ['pending', 'error', 'processing'],
        },
      },
    }),
  ]);

  return { processed, queued };
}

const territoryCheckIns = createTerritoryCheckInService({
  notionRequest,
  getTerritorySnapshot,
  loadTerritoryStoreFromReadModel,
  patchStoreInSnapshot,
  patchTerritoryStoreReadModel,
  recordTerritoryCheckInEvent,
  fetchAndValidateDatabaseSchema,
  pickPropertyNameByType,
  territoryOrgId,
});

export const syncTerritoryCheckInMirrorForStore = territoryCheckIns.syncTerritoryCheckInMirrorForStore;
export const syncTerritoryCheckInMirrorByPageId = territoryCheckIns.syncTerritoryCheckInMirrorByPageId;
export { enqueueTerritoryStoreSync };

const territoryStoreDetailService = createTerritoryStoreDetailService({
  getTerritorySnapshot,
  loadTerritoryStoreFromReadModel,
  resolveStoreByIdentifier,
  loadStoreCheckIns: territoryCheckIns.loadStoreCheckIns,
  loadStoreVendorDaySummary,
  notionRequest,
  readNotionCacheSnapshot,
  contactsSnapshotKey: CONTACTS_SNAPSHOT_KEY,
  normalizeCachedContacts,
  normalizePageId,
});

export async function loadTerritoryStoreCheckIns(storeId: string) {
  const snapshot = await getTerritorySnapshot();
  const store = (await loadTerritoryStoreFromReadModel(storeId)) ?? (await resolveStoreByIdentifier(snapshot.stores, storeId));
  if (!store) {
    throw new Error('Store not found');
  }

  return territoryCheckIns.loadStoreCheckIns(store);
}

export const loadTerritoryStoreDetail = territoryStoreDetailService.loadTerritoryStoreDetail;

export async function updateTerritoryStoreFields(storeId: string, payload: { notes?: string; followUpDate?: string | null; followUpNeeded?: boolean | null; followUpReason?: string | null }) {
  const snapshot = await getTerritorySnapshot();
  const store = await resolveStoreByIdentifier(snapshot.stores, storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  const schema = await fetchAndValidateDatabaseSchema();
  const notesProperty = pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Notes', 'Account Notes', 'Store Notes', 'Visit Notes'],
    'rich_text',
  );

  const followUpProperty = pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Follow-up Date', 'Follow Up Date', 'Followup Date'],
    'date',
  );
  const followUpNeededCheckboxProperty = pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Follow-up Needed', 'Follow Up Needed'],
    'checkbox',
  );
  const followUpNeededSelectProperty = pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Follow-up Needed', 'Follow Up Needed'],
    'select',
  );
  const followUpReasonProperty = pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Follow-up Reason', 'Follow Up Reason'],
    'rich_text',
  ) ?? pickPropertyNameByType(
    schema.database.properties ?? {},
    ['Follow-up Reason', 'Follow Up Reason'],
    'select',
  );

  if (!notesProperty && !followUpProperty && !followUpNeededCheckboxProperty && !followUpNeededSelectProperty && !followUpReasonProperty) {
    throw new Error('No writable Notes/Follow-up properties found in Notion database');
  }

  const trimmedNotes = typeof payload.notes === 'string' ? payload.notes.trim().slice(0, 2000) : undefined;
  const followUpDate = typeof payload.followUpDate === 'string' ? payload.followUpDate : payload.followUpDate === null ? null : undefined;
  const followUpNeeded = typeof payload.followUpNeeded === 'boolean' ? payload.followUpNeeded : payload.followUpNeeded === null ? null : undefined;
  const followUpReason = typeof payload.followUpReason === 'string' ? payload.followUpReason.trim().slice(0, 2000) : payload.followUpReason === null ? null : undefined;

  if (trimmedNotes !== undefined && !notesProperty) {
    throw new Error('No writable Notes property found in Notion database');
  }
  if (followUpDate !== undefined && !followUpProperty) {
    throw new Error('No writable Follow-up Date property found in Notion database');
  }
  if (followUpNeeded !== undefined && !followUpNeededCheckboxProperty && !followUpNeededSelectProperty) {
    throw new Error('No writable Follow-up Needed property found in Notion database');
  }
  if (followUpReason !== undefined && !followUpReasonProperty) {
    throw new Error('No writable Follow-up Reason property found in Notion database');
  }

  const properties: Record<string, unknown> = {};

  if (notesProperty && trimmedNotes !== undefined) {
    properties[notesProperty] = {
      rich_text: trimmedNotes
        ? [
            {
              type: 'text',
              text: { content: trimmedNotes },
            },
          ]
        : [],
    };
  }

  if (followUpProperty && followUpDate !== undefined) {
    properties[followUpProperty] = {
      date: followUpDate
        ? {
            start: followUpDate,
          }
        : null,
    };
  }

  if (followUpNeeded !== undefined) {
    if (followUpNeededCheckboxProperty) {
      properties[followUpNeededCheckboxProperty] = {
        checkbox: followUpNeeded ?? false,
      };
    } else if (followUpNeededSelectProperty) {
      properties[followUpNeededSelectProperty] = {
        select: {
          name: followUpNeeded ? 'Yes' : 'No',
        },
      };
    }
  }

  if (followUpReasonProperty && followUpReason !== undefined) {
    const schemaProperty = schema.database.properties?.[followUpReasonProperty];
    if (schemaProperty?.type === 'select') {
      properties[followUpReasonProperty] = {
        select: followUpReason
          ? {
              name: followUpReason,
            }
          : null,
      };
    } else {
      properties[followUpReasonProperty] = {
        rich_text: followUpReason
          ? [
              {
                type: 'text',
                text: { content: followUpReason },
              },
            ]
          : [],
      };
    }
  }

  if (Object.keys(properties).length === 0) {
    return {
      storeId: store.id,
      notionPageId: store.notionPageId,
      notes: store.notes ?? null,
      followUpDate: store.followUpDate ?? null,
      followUpNeeded: store.followUpNeeded ?? null,
      followUpReason: store.followUpReason ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  await notionRequest<unknown>(`/pages/${store.notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties,
    }),
  });

  const now = new Date().toISOString();
  await patchStoreInSnapshot(store.id, (entry) => ({
    ...entry,
    ...(trimmedNotes !== undefined ? { notes: trimmedNotes || null } : {}),
    ...(followUpDate !== undefined ? { followUpDate } : {}),
    ...(followUpNeeded !== undefined ? { followUpNeeded } : {}),
    ...(followUpReason !== undefined ? { followUpReason } : {}),
    lastEditedTime: now,
  }));
  await patchTerritoryStoreReadModel(store.id, {
    ...(trimmedNotes !== undefined ? { notes: trimmedNotes || null } : {}),
    ...(followUpDate !== undefined ? { followUpDate } : {}),
  });

  return {
    storeId: store.id,
    notionPageId: store.notionPageId,
    notes: trimmedNotes !== undefined ? trimmedNotes || null : store.notes ?? null,
    followUpDate: followUpDate !== undefined ? followUpDate : store.followUpDate ?? null,
    followUpNeeded: followUpNeeded !== undefined ? followUpNeeded : store.followUpNeeded ?? null,
    followUpReason: followUpReason !== undefined ? followUpReason : store.followUpReason ?? null,
    updatedAt: now,
  };
}

export const recordTerritoryStoreCheckIn = territoryCheckIns.recordTerritoryStoreCheckIn;
export const createTerritoryStoreCheckInComment = territoryCheckIns.createTerritoryStoreCheckInComment;

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
  referralSources?: string[];
  includeNoReferralSource?: boolean;
  vendorDayStatuses?: TerritoryVendorDayStatusFilter;
  query?: string;
  locationAvailability?: 'all' | 'available' | 'unavailable';
  hasSampleOrderDate?: boolean;
  noLastSampleDeliveryDate?: boolean;
  sampleAccountTypeFilter?: TerritorySampleAccountTypeFilter;
  lastOrderDateFilter?: TerritoryOrderDateFilter;
  refresh?: boolean;
  maxLiveGeocodeLookups?: number;
}): Promise<TerritoryStoresResponse> {
  const snapshot = await getTerritorySnapshot({
    refresh: input?.refresh,
    maxLiveGeocodeLookups: input?.maxLiveGeocodeLookups,
  });
  const referralSourceSchemaOptions = await loadReferralSourceOptionsFromSchema({
    refresh: input?.refresh,
  }).catch((error) => {
    console.warn('territory_referral_source_schema_options_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return [] as string[];
  });
  const selection = {
    statuses: input?.statuses,
    reps: input?.reps,
    referralSources: input?.referralSources,
    includeNoReferralSource: input?.includeNoReferralSource,
    query: input?.query,
    locationAvailability: input?.locationAvailability,
  };
  const snapshotById = new Map(snapshot.stores.map((store) => [store.id, store]));
  let stores: TerritoryStorePin[];
  let filters: TerritoryStoresResponse['filters'];
  let recordsRead: number;
  let sourceEngine: TerritoryStoresResponse['meta']['sourceEngine'] | undefined;

  const mergeSnapshotStore = (store: TerritoryStorePin): TerritoryStorePin => {
    const snapshotStore = snapshotById.get(store.id);
    return {
      ...store,
      name: snapshotStore?.name ?? store.name,
      status: snapshotStore?.status ?? store.status,
      statusKey: snapshotStore?.statusKey ?? store.statusKey,
      statusColor: snapshotStore?.statusColor ?? store.statusColor,
      pinKind: snapshotStore?.pinKind ?? store.pinKind,
      repNames: snapshotStore?.repNames ?? store.repNames,
      repEmails: snapshotStore?.repEmails ?? store.repEmails,
      lastEditedTime: snapshotStore?.lastEditedTime ?? store.lastEditedTime,
      licenseNumber: snapshotStore?.licenseNumber ?? store.licenseNumber,
      phoneNumber: snapshotStore?.phoneNumber ?? store.phoneNumber,
      email: snapshotStore?.email ?? store.email,
      referralSource: snapshotStore?.referralSource ?? store.referralSource,
      vendorDayStatus: snapshotStore?.vendorDayStatus ?? store.vendorDayStatus,
      lastSampleOrderDate: snapshotStore?.lastSampleOrderDate ?? store.lastSampleOrderDate,
      lastSampleDeliveryDate: snapshotStore?.lastSampleDeliveryDate ?? store.lastSampleDeliveryDate,
      lastOrderDate: snapshotStore?.lastOrderDate ?? store.lastOrderDate,
      followUpNeeded: snapshotStore?.followUpNeeded ?? store.followUpNeeded ?? null,
      followUpReason: snapshotStore?.followUpReason ?? store.followUpReason ?? null,
      followUpDate: snapshotStore?.followUpDate ?? store.followUpDate,
      notes: snapshotStore?.notes ?? store.notes,
      lastCheckIn: snapshotStore?.lastCheckIn ?? store.lastCheckIn,
    };
  };

  try {
    let readModel = await loadTerritoryStoresFromReadModel({});
    if (readModel.recordsRead === 0 && snapshot.stores.length > 0) {
      await syncTerritoryStoresReadModel(snapshot.stores);
      readModel = await loadTerritoryStoresFromReadModel({});
    }
    const mergedStores = readModel.stores.map(mergeSnapshotStore).filter((store) => !isExcludedInternalTransferRetailerName(store.name));
    const filtered = filterTerritoryPins(mergedStores, selection);
    stores = filtered.stores;
    filters = {
      ...filtered.filters,
      referralSources: mergeFilterCountsWithCanonicalOptions(
        filtered.filters.referralSources,
        referralSourceSchemaOptions,
        input?.referralSources ?? [],
      ),
    };
    recordsRead = readModel.recordsRead;
    sourceEngine = 'postgis';
  } catch (error) {
    console.error('territory_read_model_fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    const fallback = filterTerritoryPins(snapshot.stores.filter((store) => !isExcludedInternalTransferRetailerName(store.name)), selection);
    stores = fallback.stores;
    filters = {
      ...fallback.filters,
      referralSources: mergeFilterCountsWithCanonicalOptions(
        fallback.filters.referralSources,
        referralSourceSchemaOptions,
        input?.referralSources ?? [],
      ),
    };
    recordsRead = fallback.recordsRead;
    sourceEngine = undefined;
  }

  const vendorDayStatusFilters = new Set((input?.vendorDayStatuses ?? []).map((value) => normalizeStatus(value)).filter(Boolean));
  if (vendorDayStatusFilters.size > 0) {
    stores = stores.filter((store) => {
      const statusKey = normalizeStatus(store.vendorDayStatus ?? '');
      return Boolean(statusKey) && vendorDayStatusFilters.has(statusKey);
    });
  }

  if (input?.hasSampleOrderDate) {
    stores = stores.filter((store) => Boolean(store.lastSampleOrderDate));
  }

  if (input?.noLastSampleDeliveryDate) {
    stores = stores.filter((store) => !store.lastSampleDeliveryDate);
  }

  const sampleAccountTypeFilter = input?.sampleAccountTypeFilter ?? 'all';
  if (sampleAccountTypeFilter !== 'all') {
    stores = stores.filter((store) => {
      if (!store.lastSampleOrderDate) {
        return false;
      }
      const isCustomer = store.statusKey === 'customer' || store.statusKey === 'customer overdue';
      return sampleAccountTypeFilter === 'customers' ? isCustomer : !isCustomer;
    });
  }

  const lastOrderDateFilter = input?.lastOrderDateFilter ?? 'all';
  if (lastOrderDateFilter !== 'all') {
    stores = stores.filter((store) => matchesLastOrderDateFilter(store.lastOrderDate, lastOrderDateFilter));
  }

  if ((input?.hasSampleOrderDate || input?.noLastSampleDeliveryDate || lastOrderDateFilter !== 'all') && stores.length === 0 && !input?.refresh) {
    return loadTerritoryStores({
      ...input,
      refresh: true,
      maxLiveGeocodeLookups: 0,
    });
  }

  filters = {
    ...filters,
    vendorDayStatuses: buildVendorDayStatusCounts(stores),
  };

  return {
    stores,
    filters,
    meta: {
      ...snapshot.meta,
      sourceEngine,
      recordsRead,
    },
  };
}

export async function getCachedTerritoryStores(input?: { refresh?: boolean }) {
  return getTerritorySnapshot({
    refresh: input?.refresh,
  });
}

export type TerritoryPrewarmAction = 'sync_only' | 'geocode_missing' | 'full_rebuild';

export async function prewarmTerritoryGeocodeCache(input?: {
  action?: TerritoryPrewarmAction;
  maxLiveGeocodeLookups?: number;
}) {
  const action = input?.action ?? 'geocode_missing';
  const defaultLookups =
    action === 'sync_only'
      ? 0
      : parsePositiveInt(process.env.TERRITORY_FORCE_SYNC_GEOCODE_LOOKUPS, DEFAULT_FORCE_SYNC_GEOCODE_LOOKUPS);
  const lookups = Math.max(0, input?.maxLiveGeocodeLookups ?? defaultLookups);

  if (action === 'full_rebuild') {
    memoryGeocodeCache.clear();
  }

  const snapshot = await getTerritorySnapshot({
    refresh: true,
    maxLiveGeocodeLookups: lookups,
  });

  return {
    action,
    warmedLookups: snapshot.meta.geocodedThisRequest,
    recordsRead: snapshot.meta.recordsRead,
    unresolvedLocationCount: snapshot.meta.unresolvedLocationCount,
    approximateCount: snapshot.stores.filter((store) => store.isApproximate).length,
    lastEditedMax: snapshot.meta.lastEditedMax,
    syncedAt: snapshot.meta.syncedAt,
    stale: snapshot.meta.stale,
  };
}

export async function getTerritorySyncAudit() {
  const snapshot = await getTerritorySnapshot();
  const stores = snapshot.stores;
  const mappedPageIds = new Set(stores.map((store) => normalizePageId(store.notionPageId)));
  const contactsSnapshot = await readNotionCacheSnapshot<CachedContactRow[]>(CONTACTS_SNAPSHOT_KEY);
  const contacts = normalizeCachedContacts(contactsSnapshot?.payload);

  let contactsLinked = 0;
  let contactsUnlinked = 0;
  for (const contact of contacts) {
    if (contact.accountPageIds.some((pageId) => mappedPageIds.has(normalizePageId(pageId)))) {
      contactsLinked += 1;
    } else {
      contactsUnlinked += 1;
    }
  }

  return {
    totalNotionRows: snapshot.meta.recordsRead,
    mappedRows: stores.length,
    approximateRows: stores.filter((store) => store.isApproximate).length,
    unresolvedRows: snapshot.meta.unresolvedLocationCount,
    contactsLinked,
    contactsUnlinked,
    syncedAt: snapshot.meta.syncedAt,
  };
}
