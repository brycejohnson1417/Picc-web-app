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

type CrmReviewReason = 'nabis_retailer_id_conflict' | 'license_conflict' | 'name_location_conflict';

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

type CrmRetailerSyncResult = {
  pageId: string;
  created: boolean;
  updated: false;
  skippedExisting: boolean;
  reviewRequired?: boolean;
  reviewReason?: CrmReviewReason;
};

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

async function queryMasterList(filter: Record<string, unknown>) {
  const payload = await notionRequest<NotionQueryResponse>(`/databases/${requiredEnv('NOTION_MASTER_LIST_DATABASE_ID')}/query`, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 5,
      filter,
    }),
  });

  return payload.results?.[0] ?? null;
}

async function findMasterListPageByRichText(property: string, value: string | null | undefined) {
  const text = compactText(value);
  if (!text) {
    return null;
  }

  return queryMasterList({
    property,
    rich_text: {
      equals: text,
    },
  });
}

async function findMasterListPageByLicensedLocationId(licensedLocationId: string) {
  return findMasterListPageByRichText('Licensed Location ID', licensedLocationId);
}

async function findPotentialDuplicateForReview(input: CrmRetailerSyncInput) {
  const nabisRetailerMatch = await findMasterListPageByRichText('Nabis Retailer ID', input.nabisRetailerId);
  if (nabisRetailerMatch) {
    return {
      page: nabisRetailerMatch,
      reason: 'nabis_retailer_id_conflict' as const,
    };
  }

  const licenseMatch = await findMasterListPageByRichText('License Number', input.licenseNumber);
  if (licenseMatch) {
    return {
      page: licenseMatch,
      reason: 'license_conflict' as const,
    };
  }

  const name = compactText(input.name);
  const city = compactText(input.city);
  const zipcode = compactText(input.zipcode);
  if (!name || (!city && !zipcode)) {
    return null;
  }

  const andFilters: Record<string, unknown>[] = [
    {
      property: 'Dispensary Name',
      title: {
        equals: name,
      },
    },
  ];

  if (city) {
    andFilters.push({
      property: 'City',
      rich_text: {
        equals: city,
      },
    });
  }

  if (zipcode) {
    andFilters.push({
      property: 'Zipcode',
      rich_text: {
        equals: zipcode,
      },
    });
  }

  const nameLocationMatch = await queryMasterList({
    and: andFilters,
  });

  return nameLocationMatch
    ? {
        page: nameLocationMatch,
        reason: 'name_location_conflict' as const,
      }
    : null;
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

export async function ensureDispensaryCrmPageFromRetailer(input: CrmRetailerSyncInput): Promise<CrmRetailerSyncResult> {
  const existing =
    (input.notionPageId
      ? ({
          id: input.notionPageId,
        } as NotionPage)
      : null) ?? (await findMasterListPageByLicensedLocationId(input.licensedLocationId));

  if (!existing) {
    const potentialDuplicate = await findPotentialDuplicateForReview(input);
    if (potentialDuplicate) {
      return {
        pageId: potentialDuplicate.page.id,
        created: false,
        updated: false,
        skippedExisting: false,
        reviewRequired: true,
        reviewReason: potentialDuplicate.reason,
      };
    }

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
      skippedExisting: false,
    };
  }

  return {
    pageId: existing.id,
    created: false,
    updated: false,
    skippedExisting: true,
  };
}
