import 'server-only';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

type NotionPage = {
  id: string;
  url?: string;
  properties?: Record<string, unknown>;
};

type NotionQueryResponse = {
  results?: NotionPage[];
};

interface CrmRetailerSyncInput {
  licensedLocationId: string;
  nabisRetailerId?: string | null;
  licenseNumber?: string | null;
  name: string;
  doingBusinessAs?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  hasOrders: boolean;
  notionPageId?: string | null;
}

function requiredEnv(name: 'NOTION_API_KEY' | 'NOTION_MASTER_LIST_DATABASE_ID') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function compactText(value: string | null | undefined) {
  return value?.trim() || null;
}

function asRichText(value: string | null | undefined) {
  const text = compactText(value);
  return text
    ? {
        rich_text: [{ type: 'text', text: { content: text } }],
      }
    : null;
}

function asTitle(value: string) {
  return {
    title: [{ type: 'text', text: { content: value.trim() } }],
  };
}

function fullAddress(input: CrmRetailerSyncInput) {
  return [input.address1, input.address2, [input.city, input.state].filter(Boolean).join(', '), input.zipcode]
    .map((part) => compactText(part))
    .filter(Boolean)
    .join(', ');
}

async function notionRequest<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requiredEnv('NOTION_API_KEY')}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    return notionRequest<T>(path, init, attempt + 1);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Notion request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

async function findMasterListPageByLicensedLocationId(licensedLocationId: string) {
  const payload = await notionRequest<NotionQueryResponse>(`/databases/${requiredEnv('NOTION_MASTER_LIST_DATABASE_ID')}/query`, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 5,
      filter: {
        property: 'Licensed Location ID',
        rich_text: {
          equals: licensedLocationId,
        },
      },
    }),
  });

  return payload.results?.[0] ?? null;
}

function buildRetailerProperties(input: CrmRetailerSyncInput, options?: { includeAccountStatus?: boolean }) {
  const properties: Record<string, unknown> = {
    'Dispensary Name': asTitle(input.name),
  };

  const maybeSet = (key: string, value: string | null | undefined) => {
    const payload = asRichText(value);
    if (payload) {
      properties[key] = payload;
    }
  };

  maybeSet('Licensed Location ID', input.licensedLocationId);
  maybeSet('Nabis Retailer ID', input.nabisRetailerId ?? input.licensedLocationId);
  maybeSet('License Number', input.licenseNumber);
  maybeSet('DBA', input.doingBusinessAs);
  maybeSet('Address 1', input.address1);
  maybeSet('City', input.city);
  maybeSet('Zipcode', input.zipcode);
  maybeSet('Full Address', fullAddress(input));

  if (options?.includeAccountStatus) {
    properties['Account Status'] = {
      status: {
        name: input.hasOrders ? 'Customer' : 'Lead - Cold',
      },
    };
  }

  return properties;
}

export async function upsertDispensaryCrmPageFromRetailer(input: CrmRetailerSyncInput) {
  const existing =
    (input.notionPageId
      ? ({
          id: input.notionPageId,
        } as NotionPage)
      : null) ?? (await findMasterListPageByLicensedLocationId(input.licensedLocationId));

  if (!existing) {
    const created = await notionRequest<NotionPage>('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: {
          database_id: requiredEnv('NOTION_MASTER_LIST_DATABASE_ID'),
        },
        properties: buildRetailerProperties(input, { includeAccountStatus: true }),
      }),
    });

    return {
      pageId: created.id,
      created: true,
      updated: false,
    };
  }

  await notionRequest<NotionPage>(`/pages/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: buildRetailerProperties(input),
    }),
  });

  return {
    pageId: existing.id,
    created: false,
    updated: true,
  };
}
