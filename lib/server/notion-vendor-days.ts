import 'server-only';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

type ParentKind = 'data_source' | 'database';

type NotionPropertyValue = {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  people?: Array<{ name?: string; person?: { email?: string | null } | null }>;
  date?: { start?: string | null; end?: string | null } | null;
  formula?: {
    type?: 'string' | 'number' | 'boolean' | 'date';
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: { start?: string | null } | null;
  } | null;
  number?: number | null;
  checkbox?: boolean;
};

type NotionQueryResult = {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionPropertyValue>;
};

type NotionQueryResponse = {
  results?: NotionQueryResult[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type NotionDataSourceResponse = {
  id: string;
  object: 'data_source';
};

type NotionDatabaseResponse = {
  id: string;
  object: 'database';
  data_sources?: Array<{ id?: string }>;
};

type NotionSearchResponse = {
  results?: Array<{
    id: string;
    object?: string;
    title?: Array<{ plain_text?: string }>;
  }>;
};

class NotionApiError extends Error {
  status: number;

  constructor(status: number, payload: unknown) {
    super(`Notion request failed (${status}): ${JSON.stringify(payload)}`);
    this.status = status;
  }
}

export interface NotionVendorDayEvent {
  id: string;
  eventDate: string;
  repName: string | null;
  ambassadorName: string | null;
  notes: string | null;
  accountName: string;
}

function requiredEnv(name: 'NOTION_API_KEY') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${requiredEnv('NOTION_API_KEY')}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePageId(id: string) {
  const trimmed = id.replace(/-/g, '').trim();
  if (trimmed.length !== 32) return id;
  return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`;
}

async function notionRequest<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      ...notionHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return notionRequest<T>(path, init, attempt + 1);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new NotionApiError(response.status, payload);
  }

  return payload as T;
}

async function tryGetDataSource(id: string) {
  try {
    return await notionRequest<NotionDataSourceResponse>(`/data_sources/${id}`);
  } catch (error) {
    if (error instanceof NotionApiError && error.status === 404) return null;
    throw error;
  }
}

async function tryGetDatabase(id: string) {
  try {
    return await notionRequest<NotionDatabaseResponse>(`/databases/${id}`);
  } catch (error) {
    if (error instanceof NotionApiError && error.status === 404) return null;
    throw error;
  }
}

async function resolveVendorDayParent(): Promise<{ kind: ParentKind; id: string } | null> {
  const configuredId =
    process.env.NOTION_VENDOR_DAY_DATA_SOURCE_ID?.trim() ||
    process.env.NOTION_VENDOR_DAY_DATABASE_ID?.trim() ||
    process.env.NOTION_VENDOR_DAY_EVENTS_DATABASE_ID?.trim();

  if (configuredId) {
    const normalized = normalizePageId(configuredId);
    const ds = await tryGetDataSource(normalized);
    if (ds) return { kind: 'data_source', id: ds.id };

    const db = await tryGetDatabase(normalized);
    if (db?.data_sources?.[0]?.id) return { kind: 'data_source', id: db.data_sources[0].id };
    if (db) return { kind: 'database', id: db.id };
  }

  const search = await notionRequest<NotionSearchResponse>('/search', {
    method: 'POST',
    body: JSON.stringify({ query: 'vendor day', page_size: 20 }),
  });

  for (const result of search.results ?? []) {
    const title = (result.title ?? []).map((segment) => segment.plain_text ?? '').join(' ').trim();
    if (!title || !normalize(title).includes('vendor day')) continue;

    if (result.object === 'data_source') {
      const ds = await tryGetDataSource(result.id);
      if (ds) return { kind: 'data_source', id: ds.id };
    }

    if (result.object === 'database') {
      const db = await tryGetDatabase(result.id);
      if (db?.data_sources?.[0]?.id) return { kind: 'data_source', id: db.data_sources[0].id };
      if (db) return { kind: 'database', id: db.id };
    }
  }

  return null;
}

function propertyByCandidates(properties: Record<string, NotionPropertyValue>, candidates: string[]) {
  const normalized = new Map<string, NotionPropertyValue>();
  for (const [key, value] of Object.entries(properties)) {
    normalized.set(normalize(key), value);
  }

  for (const candidate of candidates) {
    const found = normalized.get(normalize(candidate));
    if (found) return found;
  }

  return undefined;
}

function propertyToString(property: NotionPropertyValue | undefined): string | null {
  if (!property) return null;
  const title = (property.title ?? []).map((segment) => segment.plain_text ?? '').join('').trim();
  if (title) return title;

  const richText = (property.rich_text ?? []).map((segment) => segment.plain_text ?? '').join('').trim();
  if (richText) return richText;

  if (property.status?.name) return property.status.name.trim();
  if (property.select?.name) return property.select.name.trim();

  if (Array.isArray(property.people) && property.people.length > 0) {
    const value = property.people
      .map((person) => person?.name ?? person?.person?.email ?? '')
      .filter(Boolean)
      .join(', ')
      .trim();
    if (value) return value;
  }

  if (property.date?.start) return property.date.start;
  if (property.formula?.type === 'date' && property.formula.date?.start) return property.formula.date.start;
  if (property.formula?.type === 'string' && property.formula.string) return property.formula.string.trim();
  if (property.formula?.type === 'number' && typeof property.formula.number === 'number') return String(property.formula.number);
  if (typeof property.number === 'number') return String(property.number);
  if (typeof property.checkbox === 'boolean') return property.checkbox ? 'Yes' : 'No';

  return null;
}

export async function loadNotionVendorDayEvents(): Promise<NotionVendorDayEvent[]> {
  const masterListEvents = await loadMasterListVendorDayEvents().catch(() => []);
  if (masterListEvents.length > 0) {
    return masterListEvents;
  }

  const parent = await resolveVendorDayParent();
  if (!parent) {
    return [];
  }

  const rows: NotionQueryResult[] = [];
  let cursor: string | undefined;

  while (true) {
    const path = parent.kind === 'data_source' ? `/data_sources/${parent.id}/query` : `/databases/${parent.id}/query`;

    const payload = await notionRequest<NotionQueryResponse>(path, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    rows.push(...(payload.results ?? []));
    if (!payload.has_more || !payload.next_cursor) {
      break;
    }
    cursor = payload.next_cursor;
  }

  const events: NotionVendorDayEvent[] = [];

  for (const row of rows) {
    const properties = row.properties ?? {};

    const dateValue = propertyToString(propertyByCandidates(properties, ['Event Date', 'Date', 'Vendor Day Date', 'Vendor Date']));
    const accountName =
      propertyToString(propertyByCandidates(properties, ['Account', 'Dispensary', 'Store', 'Store Name'])) ||
      propertyToString(propertyByCandidates(properties, ['Name', 'Title'])) ||
      'Vendor Day Event';

    const repName = propertyToString(propertyByCandidates(properties, ['Rep', 'Sales Rep', 'PICC Rep']));
    const ambassadorName = propertyToString(propertyByCandidates(properties, ['Ambassador', 'Brand Ambassador', 'BA']));
    const notes = propertyToString(propertyByCandidates(properties, ['Notes', 'Comments', 'Summary']));

    const eventDate = dateValue || row.created_time || row.last_edited_time;
    if (!eventDate) continue;

    events.push({
      id: row.id,
      eventDate,
      repName,
      ambassadorName,
      notes,
      accountName,
    });
  }

  events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return events;
}

async function loadMasterListVendorDayEvents(): Promise<NotionVendorDayEvent[]> {
  const databaseId = optionalEnv('NOTION_MASTER_LIST_DATABASE_ID');
  if (!databaseId) {
    return [];
  }

  const rows: NotionQueryResult[] = [];
  let cursor: string | undefined;

  while (true) {
    const payload = await notionRequest<NotionQueryResponse>(`/databases/${normalizePageId(databaseId)}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });

    rows.push(...(payload.results ?? []));
    if (!payload.has_more || !payload.next_cursor) {
      break;
    }
    cursor = payload.next_cursor;
  }

  const events: NotionVendorDayEvent[] = [];

  for (const row of rows) {
    const properties = row.properties ?? {};
    const eventDate = propertyToString(
      propertyByCandidates(properties, ['Vendor Day', 'Vendor Day Date', 'Vendor Day Scheduled', 'Next Vendor Day', 'VD Date']),
    );
    if (!eventDate) {
      continue;
    }

    const accountName =
      propertyToString(propertyByCandidates(properties, ['Dispensary Name', 'Account', 'Store', 'Store Name'])) ||
      propertyToString(propertyByCandidates(properties, ['Name', 'Title'])) ||
      'Vendor Day Event';

    const repName = propertyToString(
      propertyByCandidates(properties, ['Vendor Day Rep', 'Vendor Day Sales Rep', 'Sales Rep', 'Rep', 'PICC Rep']),
    );
    const ambassadorName = propertyToString(
      propertyByCandidates(properties, ['Vendor Day Ambassador', 'Brand Ambassador', 'Ambassador', 'BA']),
    );
    const notes = propertyToString(propertyByCandidates(properties, ['Vendor Day Notes', 'Vendor Day Summary', 'Notes', 'Comments']));

    events.push({
      id: row.id,
      eventDate,
      repName,
      ambassadorName,
      notes,
      accountName,
    });
  }

  events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return events;
}
