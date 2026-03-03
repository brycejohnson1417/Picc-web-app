import 'server-only';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';
const DEFAULT_MEETING_NOTES_ID = '2cba86d9999881b7bc4dc863b58ef347';

interface MeetingCheckInInput {
  store: {
    name: string;
    notionPageId: string;
    address?: string | null;
    repName?: string | null;
    lat?: number;
    lng?: number;
  };
  actorEmail?: string;
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

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requiredEnv(name: 'NOTION_API_KEY') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function meetingNotesId() {
  return process.env.NOTION_MEETING_NOTES_DATABASE_ID?.trim() || DEFAULT_MEETING_NOTES_ID;
}

function notionHeaders() {
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
      ...notionHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return notionRequest<T>(path, init, attempt + 1);
  }

  const payloadText = await response.text();
  const payload = payloadText ? JSON.parse(payloadText) : {};

  if (!response.ok) {
    throw new NotionApiError(response.status, payload);
  }

  return payload as T;
}

function normalizePageId(id: string) {
  const trimmed = id.replace(/-/g, '').trim();
  if (trimmed.length !== 32) return id;
  return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`;
}

function findTitlePropertyName(properties: Record<string, NotionPropertySchema>) {
  const titleEntry = Object.entries(properties).find(([, value]) => value.type === 'title');
  return titleEntry?.[0] ?? null;
}

function findPropertyByCandidates(
  properties: Record<string, NotionPropertySchema>,
  candidates: string[],
  allowedTypes?: string[],
) {
  const normalizedCandidates = candidates.map(normalize);
  for (const [name, property] of Object.entries(properties)) {
    const normalizedName = normalize(name);
    if (!normalizedCandidates.includes(normalizedName)) {
      continue;
    }
    if (!allowedTypes || allowedTypes.includes(property.type)) {
      return name;
    }
  }
  return null;
}

function findRelationToMasterListProperty(
  properties: Record<string, NotionPropertySchema>,
  masterListId: string,
) {
  const normalizedMaster = normalizePageId(masterListId);

  for (const [name, property] of Object.entries(properties)) {
    if (property.type !== 'relation') continue;
    const relationDbId = property.relation?.database_id;
    const relationDsId = property.relation?.data_source_id;

    if (relationDbId && normalizePageId(relationDbId) === normalizedMaster) {
      return name;
    }
    if (relationDsId && normalizePageId(relationDsId) === normalizedMaster) {
      return name;
    }
  }

  const fallbackByName = findPropertyByCandidates(properties, ['Account', 'Dispensary', 'Store'], ['relation']);
  return fallbackByName;
}

function findCheckInStatusOption(options: Array<{ name?: string }> | undefined) {
  const safe = options ?? [];
  const exact = safe.find((option) => normalize(option.name ?? '') === 'check in');
  if (exact?.name) return exact.name;

  const partial = safe.find((option) => {
    const normalized = normalize(option.name ?? '');
    return normalized.includes('check in') || normalized.includes('checkin');
  });

  return partial?.name ?? null;
}

async function tryResolveDataSourceById(id: string) {
  try {
    return await notionRequest<NotionDataSourceResponse>(`/data_sources/${id}`);
  } catch (error) {
    if (error instanceof NotionApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function tryResolveDatabaseById(id: string) {
  try {
    return await notionRequest<NotionDatabaseResponse>(`/databases/${id}`);
  } catch (error) {
    if (error instanceof NotionApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function resolveMeetingNotesParent(configuredId: string): Promise<{ kind: ParentKind; id: string; properties: Record<string, NotionPropertySchema> }> {
  const normalizedId = normalizePageId(configuredId);

  const dataSource = await tryResolveDataSourceById(normalizedId);
  if (dataSource) {
    return {
      kind: 'data_source',
      id: dataSource.id,
      properties: dataSource.properties ?? {},
    };
  }

  const database = await tryResolveDatabaseById(normalizedId);
  if (database?.data_sources?.[0]?.id) {
    const ds = await tryResolveDataSourceById(database.data_sources[0].id);
    if (ds) {
      return {
        kind: 'data_source',
        id: ds.id,
        properties: ds.properties ?? {},
      };
    }
  }
  if (database) {
    return {
      kind: 'database',
      id: database.id,
      properties: database.properties ?? {},
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
    if (result.object !== 'data_source' && result.object !== 'database') {
      continue;
    }

    if (result.object === 'data_source') {
      const found = await tryResolveDataSourceById(result.id);
      if (found) {
        return {
          kind: 'data_source',
          id: found.id,
          properties: found.properties ?? {},
        };
      }
      continue;
    }

    const foundDb = await tryResolveDatabaseById(result.id);
    if (foundDb?.data_sources?.[0]?.id) {
      const foundDs = await tryResolveDataSourceById(foundDb.data_sources[0].id);
      if (foundDs) {
        return {
          kind: 'data_source',
          id: foundDs.id,
          properties: foundDs.properties ?? {},
        };
      }
    }
  }

  throw new Error(
    'Meeting Notes data source not found. Share the Meeting Notes database with this Notion integration, then retry check-in.',
  );
}

function normalizeNotionPageReference(id: string) {
  return normalizePageId(id);
}

export async function createMeetingCheckIn(input: MeetingCheckInInput) {
  const configuredId = meetingNotesId();
  const masterListId = process.env.NOTION_MASTER_LIST_DATABASE_ID?.trim() ?? '';

  const parent = await resolveMeetingNotesParent(configuredId);
  const properties = parent.properties ?? {};

  const titlePropertyName = findTitlePropertyName(properties);
  if (!titlePropertyName) {
    throw new Error('Meeting Notes schema is missing a title property');
  }

  const relationPropertyName = masterListId ? findRelationToMasterListProperty(properties, masterListId) : null;
  const datePropertyName = findPropertyByCandidates(properties, ['Date', 'Meeting Date', 'Check-in Date'], ['date']);
  const accountTextPropertyName = findPropertyByCandidates(properties, ['Account', 'Dispensary', 'Store', 'Store Name'], ['rich_text', 'title']);
  const addressPropertyName = findPropertyByCandidates(properties, ['Address', 'Location'], ['rich_text']);
  const repPropertyName = findPropertyByCandidates(properties, ['Rep', 'PICC Rep', 'Sales Rep', 'Owner'], ['rich_text']);
  const statusPropertyName = findPropertyByCandidates(properties, ['Status', 'Type', 'Meeting Type'], ['status', 'select']);

  const checkInTitle = `Check-in: ${input.store.name} (${new Date().toLocaleDateString('en-US')})`;

  const notionProperties: Record<string, unknown> = {
    [titlePropertyName]: {
      title: [{ text: { content: checkInTitle } }],
    },
  };

  if (relationPropertyName) {
    notionProperties[relationPropertyName] = {
      relation: [{ id: normalizeNotionPageReference(input.store.notionPageId) }],
    };
  }

  if (datePropertyName) {
    notionProperties[datePropertyName] = {
      date: {
        start: new Date().toISOString(),
      },
    };
  }

  if (accountTextPropertyName && accountTextPropertyName !== titlePropertyName) {
    notionProperties[accountTextPropertyName] = {
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

  if (statusPropertyName) {
    const statusProperty = properties[statusPropertyName];
    if (statusProperty?.type === 'status') {
      const checkInOption = findCheckInStatusOption(statusProperty.status?.options);
      if (checkInOption) {
        notionProperties[statusPropertyName] = {
          status: { name: checkInOption },
        };
      }
    }
    if (statusProperty?.type === 'select') {
      const checkInOption = findCheckInStatusOption(statusProperty.select?.options);
      if (checkInOption) {
        notionProperties[statusPropertyName] = {
          select: { name: checkInOption },
        };
      }
    }
  }

  const parentPayload =
    parent.kind === 'data_source'
      ? {
          type: 'data_source_id',
          data_source_id: parent.id,
        }
      : {
          type: 'database_id',
          database_id: parent.id,
        };

  const created = await notionRequest<NotionCreatePageResponse>('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: parentPayload,
      properties: notionProperties,
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'Check-in started from PICC Command Center.',
                },
              },
            ],
          },
        },
      ],
    }),
  });

  if (!created?.url || !created?.id) {
    throw new Error('Notion meeting check-in created but response is missing URL');
  }

  return {
    id: created.id,
    url: created.url,
  };
}
