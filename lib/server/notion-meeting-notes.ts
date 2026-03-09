import 'server-only';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

export type CheckInMode = 'written' | 'voice';

interface MeetingCheckInInput {
  store: {
    name: string;
    notionPageId: string;
    address?: string | null;
    repName?: string | null;
    lat?: number;
    lng?: number;
  };
  mode: CheckInMode;
  noteText?: string;
  actorEmail?: string;
  associatedContact?: {
    id?: string;
    name: string;
    roleTitle?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

interface MeetingCheckInHistoryInput {
  storePageId: string;
  storeName?: string;
  limit?: number;
}

export interface MeetingCheckInHistoryRow {
  id: string;
  url: string | null;
  title: string;
  createdTime: string;
  mode: CheckInMode | 'unknown';
  notePreview: string | null;
}

type ParentKind = 'data_source' | 'database';

type NotionPropertySchema = {
  type: string;
  relation?: {
    database_id?: string;
    data_source_id?: string;
  };
  select?: {
    options?: Array<{ name?: string }>;
  };
  status?: {
    options?: Array<{ name?: string }>;
  };
};

type NotionDataSourceResponse = {
  id: string;
  object: 'data_source';
  properties?: Record<string, NotionPropertySchema>;
};

type NotionDatabaseResponse = {
  id: string;
  object: 'database';
  properties?: Record<string, NotionPropertySchema>;
  data_sources?: Array<{ id?: string }>;
};

type NotionSearchResponse = {
  results?: Array<{
    id: string;
    object?: string;
    title?: Array<{ plain_text?: string }>;
  }>;
};

type NotionPropertyValue = {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  people?: Array<{ name?: string; person?: { email?: string | null } | null }>;
  date?: { start?: string | null } | null;
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

type NotionQueryRow = {
  id: string;
  url?: string;
  created_time?: string;
  properties?: Record<string, NotionPropertyValue>;
};

type NotionQueryResponse = {
  results?: NotionQueryRow[];
};

type NotionCreatePageResponse = {
  id?: string;
  url?: string;
};

class NotionApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(`Notion request failed (${status}): ${JSON.stringify(payload)}`);
    this.status = status;
    this.payload = payload;
  }
}

function requiredEnv(name: 'NOTION_API_KEY') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function meetingNotesId() {
  const configured =
    process.env.NOTION_MEETING_NOTES_DATA_SOURCE_ID?.trim() ||
    process.env.NOTION_MEETING_NOTES_DATABASE_ID?.trim();
  if (!configured) {
    throw new Error('NOTION_MEETING_NOTES_DATA_SOURCE_ID or NOTION_MEETING_NOTES_DATABASE_ID is required');
  }
  return configured;
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
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9\s-]/g, ' ')
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

function propertyByCandidates(properties: Record<string, NotionPropertySchema>, candidates: string[], types?: string[]) {
  const normalized = new Map<string, [string, NotionPropertySchema]>();
  for (const [name, value] of Object.entries(properties)) {
    normalized.set(normalize(name), [name, value]);
  }

  for (const candidate of candidates) {
    const entry = normalized.get(normalize(candidate));
    if (!entry) continue;
    const [name, value] = entry;
    if (!types || types.includes(value.type)) return name;
  }

  return null;
}

function propertyValueByCandidates(properties: Record<string, NotionPropertyValue>, candidates: string[]) {
  const normalized = new Map<string, NotionPropertyValue>();
  for (const [name, value] of Object.entries(properties)) {
    normalized.set(normalize(name), value);
  }

  for (const candidate of candidates) {
    const match = normalized.get(normalize(candidate));
    if (match) return match;
  }
  return undefined;
}

function propertyValueToString(property: NotionPropertyValue | undefined) {
  if (!property) return null;

  const title = (property.title ?? []).map((segment) => segment.plain_text ?? '').join('').trim();
  if (title) return title;

  const richText = (property.rich_text ?? []).map((segment) => segment.plain_text ?? '').join('').trim();
  if (richText) return richText;

  if (property.status?.name) return property.status.name.trim();
  if (property.select?.name) return property.select.name.trim();
  if (property.date?.start) return property.date.start;

  if (property.formula?.type === 'string' && property.formula.string) return property.formula.string.trim();
  if (property.formula?.type === 'number' && typeof property.formula.number === 'number') return String(property.formula.number);
  if (property.formula?.type === 'boolean' && typeof property.formula.boolean === 'boolean') return property.formula.boolean ? 'Yes' : 'No';
  if (property.formula?.type === 'date' && property.formula.date?.start) return property.formula.date.start;

  if (typeof property.number === 'number') return String(property.number);
  if (typeof property.checkbox === 'boolean') return property.checkbox ? 'Yes' : 'No';

  if (Array.isArray(property.people) && property.people.length > 0) {
    const people = property.people
      .map((person) => person?.name ?? person?.person?.email ?? '')
      .filter(Boolean)
      .join(', ')
      .trim();
    if (people) return people;
  }

  return null;
}

function findTitlePropertyName(properties: Record<string, NotionPropertySchema>) {
  const entry = Object.entries(properties).find(([, value]) => value.type === 'title');
  return entry?.[0] ?? null;
}

function findCheckInOption(options: Array<{ name?: string }> | undefined) {
  const safe = options ?? [];
  const exact = safe.find((option) => normalize(option.name ?? '') === 'check in');
  if (exact?.name) return exact.name;

  const partial = safe.find((option) => {
    const normalized = normalize(option.name ?? '');
    return normalized.includes('check in') || normalized.includes('checkin');
  });
  return partial?.name ?? null;
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

async function resolveMeetingNotesParent(): Promise<{
  kind: ParentKind;
  id: string;
  properties: Record<string, NotionPropertySchema>;
}> {
  const configuredId = normalizePageId(meetingNotesId());

  const ds = await tryGetDataSource(configuredId);
  if (ds) {
    return {
      kind: 'data_source',
      id: ds.id,
      properties: ds.properties ?? {},
    };
  }

  const db = await tryGetDatabase(configuredId);
  if (db?.data_sources?.[0]?.id) {
    const dsFromDb = await tryGetDataSource(db.data_sources[0].id);
    if (dsFromDb) {
      return {
        kind: 'data_source',
        id: dsFromDb.id,
        properties: dsFromDb.properties ?? {},
      };
    }
  }

  if (db) {
    return {
      kind: 'database',
      id: db.id,
      properties: db.properties ?? {},
    };
  }

  const search = await notionRequest<NotionSearchResponse>('/search', {
    method: 'POST',
    body: JSON.stringify({
      query: 'meeting notes',
      page_size: 20,
    }),
  });

  for (const result of search.results ?? []) {
    if (result.object === 'data_source') {
      const found = await tryGetDataSource(result.id);
      if (found) {
        return {
          kind: 'data_source',
          id: found.id,
          properties: found.properties ?? {},
        };
      }
    }

    if (result.object === 'database') {
      const foundDb = await tryGetDatabase(result.id);
      if (foundDb?.data_sources?.[0]?.id) {
        const foundDs = await tryGetDataSource(foundDb.data_sources[0].id);
        if (foundDs) {
          return {
            kind: 'data_source',
            id: foundDs.id,
            properties: foundDs.properties ?? {},
          };
        }
      }
      if (foundDb) {
        return {
          kind: 'database',
          id: foundDb.id,
          properties: foundDb.properties ?? {},
        };
      }
    }
  }

  throw new Error('Meeting Notes source was not found. Share that database/data source with this integration.');
}

function buildParentPayload(parent: { kind: ParentKind; id: string }) {
  if (parent.kind === 'data_source') {
    return {
      type: 'data_source_id',
      data_source_id: parent.id,
    };
  }

  return {
    type: 'database_id',
    database_id: parent.id,
  };
}

export async function createMeetingCheckIn(input: MeetingCheckInInput) {
  const parent = await resolveMeetingNotesParent();
  const properties = parent.properties ?? {};
  const masterListId = process.env.NOTION_MASTER_LIST_DATABASE_ID?.trim() ?? '';

  const titlePropertyName = findTitlePropertyName(properties);
  if (!titlePropertyName) {
    throw new Error('Meeting Notes schema missing title property');
  }

  const relationPropertyName = masterListId
    ? Object.entries(properties).find(([, value]) => {
        if (value.type !== 'relation') return false;
        const relationDbId = value.relation?.database_id;
        const relationDsId = value.relation?.data_source_id;
        const normalizedMaster = normalizePageId(masterListId);
        return (relationDbId && normalizePageId(relationDbId) === normalizedMaster) || (relationDsId && normalizePageId(relationDsId) === normalizedMaster);
      })?.[0] ?? propertyByCandidates(properties, ['Account', 'Dispensary', 'Store'], ['relation'])
    : propertyByCandidates(properties, ['Account', 'Dispensary', 'Store'], ['relation']);

  if (!relationPropertyName) {
    throw new Error('Meeting Notes is missing a relation property to the Dispensary Master List. Check-in could not be linked.');
  }

  const datePropertyName = propertyByCandidates(properties, ['Date', 'Meeting Date', 'Check-in Date'], ['date']);
  const accountPropertyName = propertyByCandidates(properties, ['Account', 'Dispensary', 'Store', 'Store Name'], ['rich_text', 'title']);
  const addressPropertyName = propertyByCandidates(properties, ['Address', 'Location'], ['rich_text']);
  const repPropertyName = propertyByCandidates(properties, ['Rep', 'PICC Rep', 'Sales Rep', 'Owner'], ['rich_text']);
  const associatedContactPropertyName = propertyByCandidates(
    properties,
    ['Associated Contact', 'Contact', 'Primary Contact', 'Contact Name'],
    ['rich_text'],
  );
  const statusPropertyName = propertyByCandidates(properties, ['Status', 'Type', 'Meeting Type'], ['status', 'select']);
  const notesPropertyName = propertyByCandidates(properties, ['Notes', 'Meeting Notes', 'Summary'], ['rich_text']);

  const checkInTitle = `${input.mode === 'voice' ? 'Voice' : 'Written'} Check-in: ${input.store.name} (${new Date().toLocaleDateString('en-US')})`;

  const notionProperties: Record<string, unknown> = {
    [titlePropertyName]: {
      title: [{ text: { content: checkInTitle } }],
    },
  };

  notionProperties[relationPropertyName] = {
    relation: [{ id: normalizePageId(input.store.notionPageId) }],
  };

  if (datePropertyName) {
    notionProperties[datePropertyName] = {
      date: {
        start: new Date().toISOString(),
      },
    };
  }

  if (accountPropertyName && accountPropertyName !== titlePropertyName) {
    notionProperties[accountPropertyName] = {
      rich_text: [{ text: { content: input.store.name } }],
    };
  }

  if (addressPropertyName && input.store.address) {
    notionProperties[addressPropertyName] = {
      rich_text: [{ text: { content: input.store.address } }],
    };
  }

  if (repPropertyName && input.store.repName) {
    notionProperties[repPropertyName] = {
      rich_text: [{ text: { content: input.store.repName } }],
    };
  }

  if (associatedContactPropertyName && input.associatedContact?.name) {
    const contactLabel = [
      input.associatedContact.name,
      input.associatedContact.roleTitle?.trim() ? `(${input.associatedContact.roleTitle.trim()})` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    notionProperties[associatedContactPropertyName] = {
      rich_text: [{ text: { content: contactLabel } }],
    };
  }

  if (notesPropertyName && input.noteText?.trim()) {
    notionProperties[notesPropertyName] = {
      rich_text: [{ text: { content: input.noteText.trim() } }],
    };
  }

  if (statusPropertyName) {
    const statusProperty = properties[statusPropertyName];
    if (statusProperty?.type === 'status') {
      const option = findCheckInOption(statusProperty.status?.options);
      if (option) {
        notionProperties[statusPropertyName] = {
          status: { name: option },
        };
      }
    }
    if (statusProperty?.type === 'select') {
      const option = findCheckInOption(statusProperty.select?.options);
      if (option) {
        notionProperties[statusPropertyName] = {
          select: { name: option },
        };
      }
    }
  }

  const children = [
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content:
                input.mode === 'voice'
                  ? 'Voice check-in started from PICC Push. Start voice transcription in this note.'
                  : 'Written check-in created from PICC Push.',
            },
          },
        ],
      },
    },
  ] as Array<Record<string, unknown>>;

  if (input.actorEmail?.trim()) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `Recorded by: ${input.actorEmail.trim()}`,
            },
          },
        ],
      },
    });
  }

  if (input.associatedContact?.name) {
    const contactParts = [
      input.associatedContact.name.trim(),
      input.associatedContact.roleTitle?.trim() || '',
      input.associatedContact.email?.trim() || '',
      input.associatedContact.phone?.trim() || '',
    ].filter(Boolean);

    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `Associated contact: ${contactParts.join(' · ')}`,
            },
          },
        ],
      },
    });
  }

  if (input.noteText?.trim()) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: input.noteText.trim(),
            },
          },
        ],
      },
    });
  }

  const created = await notionRequest<NotionCreatePageResponse>('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: buildParentPayload(parent),
      properties: notionProperties,
      children,
    }),
  });

  if (!created?.id || !created?.url) {
    throw new Error('Check-in page created but Notion did not return page URL');
  }

  return {
    id: created.id,
    url: created.url,
  };
}

export async function listMeetingCheckInsForStore(input: MeetingCheckInHistoryInput): Promise<MeetingCheckInHistoryRow[]> {
  const parent = await resolveMeetingNotesParent();
  const properties = parent.properties ?? {};
  const relationPropertyName = propertyByCandidates(properties, ['Account', 'Dispensary', 'Store'], ['relation']);
  const accountPropertyName = propertyByCandidates(properties, ['Account', 'Dispensary', 'Store', 'Store Name'], ['rich_text', 'title']);
  const titlePropertyName = findTitlePropertyName(properties);
  const notesPropertyName = propertyByCandidates(properties, ['Notes', 'Meeting Notes', 'Summary'], ['rich_text']);

  const filter = relationPropertyName
    ? {
        property: relationPropertyName,
        relation: {
          contains: normalizePageId(input.storePageId),
        },
      }
    : input.storeName && accountPropertyName
      ? {
          property: accountPropertyName,
          rich_text: {
            contains: input.storeName,
          },
        }
      : undefined;

  const path = parent.kind === 'data_source' ? `/data_sources/${parent.id}/query` : `/databases/${parent.id}/query`;
  const payload = await notionRequest<NotionQueryResponse>(path, {
    method: 'POST',
    body: JSON.stringify({
      page_size: Math.min(25, Math.max(1, input.limit ?? 10)),
      ...(filter ? { filter } : {}),
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'descending',
        },
      ],
    }),
  });

  return (payload.results ?? []).map((row) => {
    const rowProperties = row.properties ?? {};
    const title = titlePropertyName ? propertyValueToString(rowProperties[titlePropertyName]) : null;
    const notePreview = notesPropertyName ? propertyValueToString(rowProperties[notesPropertyName]) : null;
    const statusValue = propertyValueToString(propertyValueByCandidates(rowProperties, ['Status', 'Type', 'Meeting Type'])) ?? '';
    const normalizedStatus = normalize(statusValue);
    const normalizedTitle = normalize(title ?? '');

    const mode: CheckInMode | 'unknown' = normalizedStatus.includes('voice') || normalizedTitle.includes('voice')
      ? 'voice'
      : normalizedStatus.includes('written') || normalizedTitle.includes('written') || notePreview
        ? 'written'
        : 'unknown';

    return {
      id: row.id,
      url: row.url ?? null,
      title: title ?? 'Check-in',
      createdTime: row.created_time ?? new Date().toISOString(),
      mode,
      notePreview,
    };
  });
}
