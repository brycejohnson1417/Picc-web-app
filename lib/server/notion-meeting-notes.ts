import 'server-only';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_MEETING_NOTES_DATABASE_ID = '2cba86d9999881b7bc4dc863b58ef347';

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

type NotionDatabaseProperty = {
  type: string;
  relation?: {
    database_id?: string;
  };
  select?: {
    options?: Array<{ name?: string }>;
  };
  status?: {
    options?: Array<{ name?: string }>;
  };
};

type NotionDatabaseResponse = {
  properties?: Record<string, NotionDatabaseProperty>;
};

type NotionCreatePageResponse = {
  id?: string;
  url?: string;
};

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

function meetingNotesDatabaseId() {
  return process.env.NOTION_MEETING_NOTES_DATABASE_ID?.trim() || DEFAULT_MEETING_NOTES_DATABASE_ID;
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
    throw new Error(`Notion request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

function normalizePageId(id: string) {
  const trimmed = id.replace(/-/g, '').trim();
  if (trimmed.length !== 32) return id;
  return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`;
}

function findTitlePropertyName(properties: Record<string, NotionDatabaseProperty>) {
  const titleEntry = Object.entries(properties).find(([, value]) => value.type === 'title');
  return titleEntry?.[0] ?? null;
}

function findPropertyByCandidates(
  properties: Record<string, NotionDatabaseProperty>,
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
  properties: Record<string, NotionDatabaseProperty>,
  masterListDatabaseId: string,
) {
  const normalizedMasterId = normalizePageId(masterListDatabaseId);
  for (const [name, property] of Object.entries(properties)) {
    if (property.type !== 'relation') continue;
    const relationDbId = property.relation?.database_id;
    if (relationDbId && normalizePageId(relationDbId) === normalizedMasterId) {
      return name;
    }
  }
  return null;
}

function findCheckInStatusOption(options: Array<{ name?: string }> | undefined) {
  const safe = options ?? [];
  const exact = safe.find((option) => normalize(option.name ?? '') === 'check in');
  if (exact?.name) return exact.name;

  const partial = safe.find((option) => {
    const normalized = normalize(option.name ?? '');
    return normalized.includes('check in') || normalized.includes('check-in');
  });

  return partial?.name ?? null;
}

export async function createMeetingCheckIn(input: MeetingCheckInInput) {
  const databaseId = meetingNotesDatabaseId();
  const masterListDatabaseId = process.env.NOTION_MASTER_LIST_DATABASE_ID?.trim() ?? '';

  const database = await notionRequest<NotionDatabaseResponse>(`/databases/${databaseId}`);
  const properties = database.properties ?? {};

  const titlePropertyName = findTitlePropertyName(properties);
  if (!titlePropertyName) {
    throw new Error('Meeting Notes database is missing a title property');
  }

  const relationPropertyName = masterListDatabaseId ? findRelationToMasterListProperty(properties, masterListDatabaseId) : null;
  const datePropertyName = findPropertyByCandidates(properties, ['Date', 'Meeting Date', 'Check-in Date'], ['date']);
  const accountTextPropertyName = findPropertyByCandidates(properties, ['Account', 'Dispensary', 'Store', 'Store Name'], ['rich_text', 'title']);
  const addressPropertyName = findPropertyByCandidates(properties, ['Address', 'Location'], ['rich_text']);
  const repPropertyName = findPropertyByCandidates(properties, ['Rep', 'PICC Rep', 'Sales Rep', 'Owner'], ['rich_text', 'people']);
  const statusPropertyName = findPropertyByCandidates(properties, ['Status', 'Type', 'Meeting Type'], ['status', 'select']);

  const checkInTitle = `Check-in: ${input.store.name} (${new Date().toLocaleDateString('en-US')})`;

  const notionProperties: Record<string, unknown> = {
    [titlePropertyName]: {
      title: [{ text: { content: checkInTitle } }],
    },
  };

  if (relationPropertyName) {
    notionProperties[relationPropertyName] = {
      relation: [{ id: normalizePageId(input.store.notionPageId) }],
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
    const repProperty = properties[repPropertyName];
    if (repProperty?.type === 'rich_text') {
      notionProperties[repPropertyName] = {
        rich_text: [{ text: { content: input.store.repName } }],
      };
    }
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

  const created = await notionRequest<NotionCreatePageResponse>('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {
        database_id: databaseId,
      },
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
