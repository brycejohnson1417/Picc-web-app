import 'server-only';

import {
  IntegrationProvider,
  IntegrationSyncStatus,
  Prisma,
  VendorDayArtifactType,
  VendorDayRequestStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { appendAuditEvent } from '@/lib/server/audit-log';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

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

type NotionPropertyValue = {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  people?: Array<{ name?: string; person?: { email?: string | null } | null }>;
  date?: { start?: string | null; end?: string | null } | null;
  files?: Array<{
    name?: string;
    type?: 'external' | 'file';
    external?: { url?: string | null } | null;
  }>;
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

function buildParentPayload(parent: { kind: ParentKind; id: string }) {
  return parent.kind === 'data_source'
    ? {
        data_source_id: parent.id,
      }
    : {
        database_id: parent.id,
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

async function resolveVendorDayParent(): Promise<{ kind: ParentKind; id: string; properties: Record<string, NotionPropertySchema> } | null> {
  const configuredId =
    process.env.NOTION_VENDOR_DAY_DATA_SOURCE_ID?.trim() ||
    process.env.NOTION_VENDOR_DAY_DATABASE_ID?.trim() ||
    process.env.NOTION_VENDOR_DAY_EVENTS_DATABASE_ID?.trim();

  if (configuredId) {
    const normalized = normalizePageId(configuredId);
    const ds = await tryGetDataSource(normalized);
    if (ds) return { kind: 'data_source', id: ds.id, properties: ds.properties ?? {} };

    const db = await tryGetDatabase(normalized);
    if (db?.data_sources?.[0]?.id) {
      const dataSource = await tryGetDataSource(db.data_sources[0].id);
      if (dataSource) {
        return { kind: 'data_source', id: dataSource.id, properties: dataSource.properties ?? {} };
      }
      return { kind: 'data_source', id: db.data_sources[0].id, properties: db.properties ?? {} };
    }
    if (db) return { kind: 'database', id: db.id, properties: db.properties ?? {} };
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
      if (ds) return { kind: 'data_source', id: ds.id, properties: ds.properties ?? {} };
    }

    if (result.object === 'database') {
      const db = await tryGetDatabase(result.id);
      if (db?.data_sources?.[0]?.id) {
        const dataSource = await tryGetDataSource(db.data_sources[0].id);
        if (dataSource) {
          return { kind: 'data_source', id: dataSource.id, properties: dataSource.properties ?? {} };
        }
        return { kind: 'data_source', id: db.data_sources[0].id, properties: db.properties ?? {} };
      }
      if (db) return { kind: 'database', id: db.id, properties: db.properties ?? {} };
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

type VendorDayArchivePropertyKind =
  | 'title'
  | 'rich_text'
  | 'status'
  | 'select'
  | 'date'
  | 'relation'
  | 'checkbox'
  | 'files';

type VendorDayArchiveParent = NonNullable<Awaited<ReturnType<typeof resolveVendorDayParent>>>;

type VendorDayArchiveSnapshot = {
  request: Awaited<ReturnType<typeof loadVendorDayRequestSnapshot>>['request'];
  assignment: Awaited<ReturnType<typeof loadVendorDayRequestSnapshot>>['assignment'];
  execution: Awaited<ReturnType<typeof loadVendorDayRequestSnapshot>>['execution'];
  accountPageId: string | null;
  pageId: string | null;
  existingMapId: string | null;
  parent: VendorDayArchiveParent;
};

type VendorDayArchiveSyncResult = {
  pageId: string | null;
  created: boolean;
  updated: boolean;
  skipped: boolean;
  requestId: string;
  assignmentId: string | null;
  executionId: string | null;
  integrationId: string | null;
  reason?: string | null;
};

function findPropertyNameByCandidates(
  properties: Record<string, NotionPropertySchema>,
  candidates: string[],
  allowedTypes?: VendorDayArchivePropertyKind[],
) {
  const normalized = new Map<string, { name: string; schema: NotionPropertySchema }>();
  for (const [name, schema] of Object.entries(properties)) {
    normalized.set(normalize(name), { name, schema });
  }

  for (const candidate of candidates) {
    const found = normalized.get(normalize(candidate));
    if (!found) continue;
    if (allowedTypes && !allowedTypes.includes(found.schema.type as VendorDayArchivePropertyKind)) continue;
    return found.name;
  }

  return null;
}

function findTitlePropertyName(properties: Record<string, NotionPropertySchema>) {
  const entry = Object.entries(properties).find(([, value]) => value.type === 'title');
  return entry?.[0] ?? null;
}

function compactText(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeWorkflowLabel(status: VendorDayRequestStatus) {
  switch (status) {
    case VendorDayRequestStatus.PROPOSED:
      return 'Propose';
    case VendorDayRequestStatus.REQUESTED:
    case VendorDayRequestStatus.AWAITING_REP_APPROVAL:
      return 'Request';
    default:
      return 'Confirm';
  }
}

function normalizeVendorDayStatusLabel(status: VendorDayRequestStatus) {
  switch (status) {
    case VendorDayRequestStatus.ASSIGNED:
    case VendorDayRequestStatus.PASSED_OFF:
    case VendorDayRequestStatus.READY_FOR_DISPATCH:
    case VendorDayRequestStatus.OFFER_PENDING:
      return 'In progress';
    case VendorDayRequestStatus.DISPUTED:
    case VendorDayRequestStatus.EXCEPTION:
    case VendorDayRequestStatus.NO_SHOW:
      return 'Needs Vendor Day ASAP';
    case VendorDayRequestStatus.COMPLETED:
      return 'Done';
    case VendorDayRequestStatus.PROPOSED:
    case VendorDayRequestStatus.REQUESTED:
    case VendorDayRequestStatus.AWAITING_REP_APPROVAL:
    case VendorDayRequestStatus.CANCELLED:
    default:
      return 'Not started';
  }
}

function normalizeOperationalStatus(
  requestStatus: VendorDayRequestStatus,
  assignment: Awaited<ReturnType<typeof loadVendorDayRequestSnapshot>>['assignment'],
  execution: Awaited<ReturnType<typeof loadVendorDayRequestSnapshot>>['execution'],
) {
  const inProgressStatuses: VendorDayRequestStatus[] = [
    VendorDayRequestStatus.ASSIGNED,
    VendorDayRequestStatus.OFFER_PENDING,
    VendorDayRequestStatus.PASSED_OFF,
    VendorDayRequestStatus.EXCEPTION,
    VendorDayRequestStatus.DISPUTED,
    VendorDayRequestStatus.NO_SHOW,
    VendorDayRequestStatus.READY_FOR_DISPATCH,
  ];

  if (execution?.checkOutAt || requestStatus === VendorDayRequestStatus.COMPLETED) return 'Done';
  if (execution?.checkInAt || assignment || inProgressStatuses.includes(requestStatus)) {
    return 'In progress';
  }
  return 'Not Started';
}

function normalizePennyBundlePromoStatus(requestPennyBundleRequested: boolean, executionStatus: string | null | undefined) {
  if (!requestPennyBundleRequested) return null;
  const normalized = normalize(executionStatus ?? '');
  if (!normalized) return 'Offered';
  if (normalized.includes('declin')) return 'Declined';
  if (normalized.includes('pend')) return 'Pending Credit';
  if (normalized.includes('accept')) return 'Accepted';
  if (normalized.includes('complete')) return 'Completed';
  return executionStatus?.trim() ?? 'Offered';
}

function normalizePbAcceptedStatus(requestPennyBundleRequested: boolean, executionStatus: string | null | undefined) {
  if (!requestPennyBundleRequested) return 'Not Offered';
  const normalized = normalize(executionStatus ?? '');
  if (!normalized) return null;
  if (normalized.includes('declin')) return 'Declined';
  if (normalized.includes('accept') || normalized.includes('pend') || normalized.includes('complete')) {
    return 'Accepted';
  }
  return null;
}

function formatDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildVendorDayArchiveTitle(snapshot: VendorDayArchiveSnapshot) {
  const accountName = snapshot.request.account?.name?.trim() || 'Vendor Day';
  const dateLabel = snapshot.assignment?.scheduledStart
    ? formatDateLabel(snapshot.assignment.scheduledStart)
    : formatDateLabel(snapshot.request.requestedStart);
  return `${accountName} - ${dateLabel}`;
}

function collectArtifactUrls(snapshot: VendorDayArchiveSnapshot) {
  const artifacts = snapshot.execution?.artifacts ?? [];
  return artifacts
    .map((artifact) => artifact.storageUrl?.trim())
    .filter((value): value is string => Boolean(value));
}

function selectSingleArtifact(
  snapshot: VendorDayArchiveSnapshot,
  type: VendorDayArtifactType,
) {
  return snapshot.execution?.artifacts.find((artifact) => artifact.type === type && artifact.storageUrl?.trim()) ?? null;
}

function summarizeVendorDayNotes(snapshot: VendorDayArchiveSnapshot) {
  const notes: string[] = [];
  if (snapshot.request.notes?.trim()) notes.push(`Request notes: ${snapshot.request.notes.trim()}`);
  if (snapshot.request.overrideReason?.trim()) notes.push(`60-day override: ${snapshot.request.overrideReason.trim()}`);
  if (snapshot.assignment?.passOffReason?.trim()) notes.push(`Pass-off: ${snapshot.assignment.passOffReason.trim()}`);
  if (snapshot.execution?.checkInNotes?.trim()) notes.push(`Check-in: ${snapshot.execution.checkInNotes.trim()}`);
  if (snapshot.execution?.checkOutNotes?.trim()) notes.push(`Check-out: ${snapshot.execution.checkOutNotes.trim()}`);
  if (snapshot.execution?.restockNeeded?.trim()) notes.push(`Restock: ${snapshot.execution.restockNeeded.trim()}`);
  if (snapshot.execution?.objections?.trim()) notes.push(`Objections: ${snapshot.execution.objections.trim()}`);
  if (snapshot.execution?.bestConversation?.trim()) notes.push(`Best conversation: ${snapshot.execution.bestConversation.trim()}`);
  return notes.join('\n').trim() || null;
}

function buildVendorDayPropertyValue(schema: NotionPropertySchema, value: unknown) {
  if (value == null) return null;

  switch (schema.type) {
    case 'title': {
      const text = compactText(String(value));
      return text
        ? {
            title: [{ type: 'text', text: { content: text } }],
          }
        : null;
    }
    case 'rich_text': {
      const text = compactText(String(value));
      return text
        ? {
            rich_text: [{ type: 'text', text: { content: text } }],
          }
        : null;
    }
    case 'status':
      return {
        status: {
          name: String(value).trim(),
        },
      };
    case 'select':
      return {
        select: {
          name: String(value).trim(),
        },
      };
    case 'date': {
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) return null;
      return {
        date: {
          start: date.toISOString(),
        },
      };
    }
    case 'checkbox':
      if (typeof value === 'string') {
        const normalized = normalize(value);
        if (['yes', 'true', 'checked', 'on', 'paid', 'accepted', 'completed'].includes(normalized)) {
          return { checkbox: true };
        }
        if (['no', 'false', 'unchecked', 'off', 'unpaid', 'declined', 'not offered'].includes(normalized)) {
          return { checkbox: false };
        }
      }
      return {
        checkbox: Boolean(value),
      };
    case 'relation': {
      const ids = Array.isArray(value) ? value : [value];
      const relation = ids
        .map((id) => compactText(String(id)))
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ id }));
      return relation.length > 0 ? { relation } : null;
    }
    case 'files': {
      const files = Array.isArray(value) ? value : [];
      const entries = files
        .map((file, index) => {
          if (typeof file === 'string') {
            const url = compactText(file);
            return url
              ? {
                  name: `Artifact ${index + 1}`,
                  type: 'external' as const,
                  external: { url },
                }
              : null;
          }

          if (!file || typeof file !== 'object') return null;
          const record = file as { name?: string; url?: string };
          const url = compactText(record.url);
          if (!url) return null;
          return {
            name: compactText(record.name) || `Artifact ${index + 1}`,
            type: 'external' as const,
            external: { url },
          };
        })
        .filter((entry): entry is { name: string; type: 'external'; external: { url: string } } => Boolean(entry));

      return entries.length > 0 ? { files: entries } : null;
    }
    default: {
      if (typeof value === 'boolean') {
        return {
          checkbox: value,
        };
      }
      if (typeof value === 'number') {
        return {
          number: value,
        };
      }
      const text = compactText(String(value));
      return text
        ? {
            rich_text: [{ type: 'text', text: { content: text } }],
          }
        : null;
    }
  }
}

async function ensureVendorDayArchiveIntegration(orgId: string) {
  return prisma.integrationConnection.upsert({
    where: {
      id: `notion-vendor-day-archive-${orgId}`,
    },
    update: {
      enabled: true,
      provider: IntegrationProvider.NOTION,
      name: 'Vendor Day Archive',
      config: {},
    },
    create: {
      id: `notion-vendor-day-archive-${orgId}`,
      orgId,
      provider: IntegrationProvider.NOTION,
      name: 'Vendor Day Archive',
      config: {},
      enabled: true,
    },
  });
}

async function markVendorDayArchiveCheckpoint(input: {
  orgId: string;
  integrationId: string;
  status: IntegrationSyncStatus;
  metadata?: Record<string, unknown>;
}) {
  await prisma.syncCheckpoint.upsert({
    where: {
      integrationId_module: {
        integrationId: input.integrationId,
        module: 'vendor_day_archive',
      },
    },
    update: {
      status: input.status,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      updatedAt: new Date(),
    },
    create: {
      orgId: input.orgId,
      integrationId: input.integrationId,
      module: 'vendor_day_archive',
      status: input.status,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

async function withVendorDayArchiveSyncRun<T>(
  input: { orgId: string; actor?: { userId?: string | null; email?: string | null } },
  fn: (runId: string, integrationId: string) => Promise<{ result: T; recordsIn: number; recordsUpserted: number; metadata?: Record<string, unknown> }>,
) {
  const integration = await ensureVendorDayArchiveIntegration(input.orgId);
  const run = await prisma.syncRun.create({
    data: {
      orgId: input.orgId,
      integrationId: integration.id,
      module: 'vendor_day_archive',
      status: IntegrationSyncStatus.RUNNING,
      metadata: (input.actor?.email ? { requestedBy: input.actor.email } : undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  try {
    const outcome = await fn(run.id, integration.id);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: IntegrationSyncStatus.SUCCESS,
        finishedAt: new Date(),
        recordsIn: outcome.recordsIn,
        recordsUpserted: outcome.recordsUpserted,
        metadata: outcome.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await prisma.integrationConnection.update({
      where: { id: integration.id },
      data: {
        status: IntegrationSyncStatus.SUCCESS,
        lastSyncedAt: new Date(),
      },
    });
    await markVendorDayArchiveCheckpoint({
      orgId: input.orgId,
      integrationId: integration.id,
      status: IntegrationSyncStatus.SUCCESS,
      metadata: {
        ...(outcome.metadata ?? {}),
        lastSuccessfulSyncAt: new Date().toISOString(),
      },
    });

    return outcome.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: IntegrationSyncStatus.ERROR,
        finishedAt: new Date(),
        error: message,
      },
    });
    await prisma.integrationConnection.update({
      where: { id: integration.id },
      data: {
        status: IntegrationSyncStatus.ERROR,
      },
    });
    await markVendorDayArchiveCheckpoint({
      orgId: input.orgId,
      integrationId: integration.id,
      status: IntegrationSyncStatus.ERROR,
      metadata: {
        error: message,
      },
    });
    await appendAuditEvent({
      orgId: input.orgId,
      actorClerkUserId: input.actor?.userId ?? null,
      actorEmail: input.actor?.email ?? null,
      action: 'vendor_day_archive.sync_failed',
      entityType: 'SyncRun',
      entityId: run.id,
      reason: message,
      metadata: {
        module: 'vendor_day_archive',
      },
    });
    throw error;
  }
}

async function loadVendorDayRequestSnapshot(input: { orgId: string; requestId: string }) {
  const request = await prisma.vendorDayRequest.findFirst({
    where: { id: input.requestId, orgId: input.orgId },
    include: {
      account: true,
      policySnapshot: true,
      offers: {
        include: {
          workerProfile: true,
        },
        orderBy: [{ rankScore: 'desc' }, { createdAt: 'asc' }],
      },
      assignments: {
        include: {
          workerProfile: true,
          payrollLineItem: true,
          execution: {
            include: {
              artifacts: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      },
    },
  });

  if (!request) {
    throw new Error('Vendor-day request not found');
  }

  const assignment = request.assignments[0] ?? null;
  const execution = assignment?.execution ?? null;
  const accountPageId = compactText(request.account.notionPageId);

  return {
    request,
    assignment,
    execution,
    accountPageId,
  };
}

async function resolveVendorDayArchivePageByRequestId(input: {
  orgId: string;
  requestId: string;
  parent: VendorDayArchiveParent;
}) {
  const existingMap = await prisma.externalRecordMap.findFirst({
    where: {
      orgId: input.orgId,
      provider: IntegrationProvider.NOTION,
      externalId: input.requestId,
      localModel: 'VendorDayRequest',
    },
    select: {
      id: true,
      localId: true,
      integrationId: true,
    },
  });

  if (existingMap?.localId) {
    return {
      pageId: existingMap.localId,
      existingMapId: existingMap.id,
    };
  }

  const requestPropertyName = findPropertyNameByCandidates(input.parent.properties, ['Vendor Day Request ID', 'Request ID', 'Vendor Day Request', 'Local Request ID'], ['rich_text', 'title', 'select', 'status']);
  if (!requestPropertyName) {
    return {
      pageId: null,
      existingMapId: null,
    };
  }

  const schema = input.parent.properties[requestPropertyName];
  const filter =
    schema.type === 'title'
      ? {
          property: requestPropertyName,
          title: {
            equals: input.requestId,
          },
        }
      : schema.type === 'select'
        ? {
            property: requestPropertyName,
            select: {
              equals: input.requestId,
            },
          }
        : schema.type === 'status'
          ? {
              property: requestPropertyName,
              status: {
                equals: input.requestId,
              },
            }
          : {
              property: requestPropertyName,
              rich_text: {
                equals: input.requestId,
              },
            };

  const path = input.parent.kind === 'data_source' ? `/data_sources/${input.parent.id}/query` : `/databases/${input.parent.id}/query`;
  const payload = await notionRequest<NotionQueryResponse>(path, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 1,
      filter,
    }),
  });

  return {
    pageId: payload.results?.[0]?.id ?? null,
    existingMapId: null,
  };
}

async function buildVendorDayArchiveProperties(snapshot: VendorDayArchiveSnapshot) {
  const title = buildVendorDayArchiveTitle(snapshot);
  const requestedStart = snapshot.assignment?.scheduledStart ?? snapshot.request.requestedStart;
  const workflow = normalizeWorkflowLabel(snapshot.request.status);
  const vendorDayStatus = normalizeVendorDayStatusLabel(snapshot.request.status);
  const operationalStatus = normalizeOperationalStatus(snapshot.request.status, snapshot.assignment, snapshot.execution);
  const bundlePromoStatus = normalizePennyBundlePromoStatus(Boolean(snapshot.request.pennyBundleRequested), snapshot.execution?.pennyBundleStatus ?? null);
  const bundleAcceptedStatus = normalizePbAcceptedStatus(Boolean(snapshot.request.pennyBundleRequested), snapshot.execution?.pennyBundleStatus ?? null);
  const checkInPhoto = selectSingleArtifact(snapshot, VendorDayArtifactType.CHECK_IN_PHOTO);
  const checkOutPhoto = selectSingleArtifact(snapshot, VendorDayArtifactType.CHECK_OUT_PHOTO);
  const files = collectArtifactUrls(snapshot);
  const notes = summarizeVendorDayNotes(snapshot);

  const propertyEntries: Array<[string, unknown]> = [
    ['Vendor Day Event', title],
    ['Vendor Day Request ID', snapshot.request.id],
    ['Vendor Day Date', requestedStart],
    ['Vendor Day Rep', snapshot.request.requestedByEmail ?? snapshot.request.requestedByRole ?? snapshot.request.requestedByClerkUserId ?? null],
    ['Vendor Day Ambassador', snapshot.assignment?.workerProfile.displayName ?? null],
    ['Workflow', workflow],
    ['Vendor Day Status', vendorDayStatus],
    ['Status', operationalStatus],
    ['Penny Bundle Promo', bundlePromoStatus],
    ['PB_Accepted', bundleAcceptedStatus],
    ['Store_Notes_CheckIn', snapshot.execution?.checkInNotes ?? null],
    ['CheckIn_Time', snapshot.execution?.checkInAt ?? null],
    ['CheckIn_Photo', checkInPhoto ? [{ url: checkInPhoto.storageUrl, name: checkInPhoto.originalName ?? 'Check-in photo' }] : null],
    ['CheckOut_Notes', snapshot.execution?.checkOutNotes ?? null],
    ['CheckOut_Time', snapshot.execution?.checkOutAt ?? null],
    ['CheckOut_Photo', checkOutPhoto ? [{ url: checkOutPhoto.storageUrl, name: checkOutPhoto.originalName ?? 'Check-out photo' }] : null],
    ['Displays_Missing', snapshot.execution?.restockNeeded?.trim() ? 'Yes' : 'No'],
    ['Missing_Displays_Notes', snapshot.execution?.restockNeeded ?? null],
    ['Files & media', files.map((url, index) => ({ url, name: `Vendor Day File ${index + 1}` }))],
    ['Paid/Unpaid', snapshot.assignment?.payrollLineItem?.status === 'PAID' ? 'Paid' : 'Unpaid'],
    ['Notes', notes],
  ];

  if (snapshot.accountPageId) {
    propertyEntries.push(['Dispensary', [snapshot.accountPageId]]);
  }

  return propertyEntries;
}

async function upsertVendorDayArchivePage(input: {
  orgId: string;
  integrationId: string;
  parent: VendorDayArchiveParent;
  snapshot: VendorDayArchiveSnapshot;
  resolvedPageId: string | null;
}) {
  const titlePropertyName = findTitlePropertyName(input.parent.properties);
  if (!titlePropertyName) {
    throw new Error('Vendor-day archive is missing a title property');
  }

  const schemaEntries = Object.entries(input.parent.properties);
  const properties: Record<string, unknown> = {};

  const propertyValues = await buildVendorDayArchiveProperties(input.snapshot);
  const propertyLookup = new Map(propertyValues);

  for (const [propertyName, schema] of schemaEntries) {
    const candidates: string[] = [];
    switch (propertyName) {
      case 'Vendor Day Event':
      case titlePropertyName:
        candidates.push('Vendor Day Event');
        break;
      case 'Dispensary':
      case 'Account':
      case 'Store':
        candidates.push('Dispensary', 'Account', 'Store');
        break;
      case 'Vendor Day Date':
      case 'Event Date':
      case 'Date':
        candidates.push('Vendor Day Date', 'Event Date', 'Date');
        break;
      case 'Vendor Day Rep':
      case 'Rep':
      case 'Sales Rep':
      case 'PICC Rep':
        candidates.push('Vendor Day Rep', 'Rep', 'Sales Rep', 'PICC Rep');
        break;
      case 'Vendor Day Ambassador':
      case 'Brand Ambassador':
      case 'Ambassador':
      case 'BA':
        candidates.push('Vendor Day Ambassador', 'Brand Ambassador', 'Ambassador', 'BA');
        break;
      case 'Workflow':
        candidates.push('Workflow');
        break;
      case 'Vendor Day Status':
        candidates.push('Vendor Day Status');
        break;
      case 'Status':
        candidates.push('Status');
        break;
      case 'Penny Bundle Promo':
        candidates.push('Penny Bundle Promo');
        break;
      case 'PB_Accepted':
        candidates.push('PB_Accepted');
        break;
      case 'Store_Notes_CheckIn':
        candidates.push('Store_Notes_CheckIn');
        break;
      case 'CheckIn_Time':
        candidates.push('CheckIn_Time');
        break;
      case 'CheckIn_Photo':
        candidates.push('CheckIn_Photo');
        break;
      case 'CheckOut_Notes':
        candidates.push('CheckOut_Notes');
        break;
      case 'CheckOut_Time':
        candidates.push('CheckOut_Time');
        break;
      case 'CheckOut_Photo':
        candidates.push('CheckOut_Photo');
        break;
      case 'Displays_Missing':
        candidates.push('Displays_Missing');
        break;
      case 'Missing_Displays_Notes':
        candidates.push('Missing_Displays_Notes');
        break;
      case 'Files & media':
        candidates.push('Files & media');
        break;
      case 'Paid/Unpaid':
        candidates.push('Paid/Unpaid');
        break;
      case 'Notes':
      case 'Summary':
        candidates.push('Notes', 'Summary');
        break;
      case 'Vendor Day Request ID':
        candidates.push('Vendor Day Request ID', 'Request ID', 'Local Request ID');
        break;
      default:
        break;
    }

    const resolved = candidates.length > 0 ? findPropertyNameByCandidates(input.parent.properties, candidates, [schema.type as VendorDayArchivePropertyKind]) : null;
    if (!resolved) continue;

    const value =
      resolved === titlePropertyName
        ? input.snapshot.request.account?.name?.trim() || 'Vendor Day Event'
        : propertyLookup.get(resolved) ??
          (resolved === 'Vendor Day Event'
            ? input.snapshot.request.account?.name?.trim() || 'Vendor Day Event'
            : resolved === 'Vendor Day Request ID'
              ? input.snapshot.request.id
              : undefined);

    if (value == null) continue;

    const payload = buildVendorDayPropertyValue(schema, value);
    if (payload) {
      properties[resolved] = payload;
    }
  }

  const pagePayload: Record<string, unknown> = {
    parent: buildParentPayload(input.parent),
    properties,
  };

  if (!input.resolvedPageId) {
    const created = await notionRequest<{ id?: string; url?: string }>('/pages', {
      method: 'POST',
      body: JSON.stringify(pagePayload),
    });

    if (!created.id) {
      throw new Error('Vendor-day archive page was not created');
    }

    return {
      pageId: created.id,
      created: true,
      updated: false,
    };
  }

  await notionRequest<{ id?: string }>(`/pages/${input.resolvedPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties,
    }),
  });

  return {
    pageId: input.resolvedPageId,
    created: false,
    updated: true,
  };
}

async function linkArchivePageToLocalModels(input: {
  orgId: string;
  integrationId: string;
  pageId: string;
  requestId: string;
  assignmentId?: string | null;
  executionId?: string | null;
}) {
  const maps = [
    {
      localModel: 'VendorDayRequest',
      localId: input.requestId,
      externalId: input.requestId,
    },
    ...(input.assignmentId
      ? [
          {
            localModel: 'VendorDayAssignment',
            localId: input.assignmentId,
            externalId: input.assignmentId,
          },
        ]
      : []),
    ...(input.executionId
      ? [
          {
            localModel: 'VendorDayExecution',
            localId: input.executionId,
            externalId: input.executionId,
          },
        ]
      : []),
  ];

  for (const map of maps) {
    await prisma.externalRecordMap.upsert({
      where: {
        orgId_provider_externalId_localModel: {
          orgId: input.orgId,
          provider: IntegrationProvider.NOTION,
          externalId: map.externalId,
          localModel: map.localModel,
        },
      },
      update: {
        integrationId: input.integrationId,
        localId: input.pageId,
      },
      create: {
        orgId: input.orgId,
        integrationId: input.integrationId,
        provider: IntegrationProvider.NOTION,
        externalId: map.externalId,
        localModel: map.localModel,
        localId: input.pageId,
      },
    });
  }
}

async function syncVendorDayArchiveRequestInternal(input: {
  orgId: string;
  requestId: string;
  actor?: { userId?: string | null; email?: string | null };
}): Promise<VendorDayArchiveSyncResult> {
  return withVendorDayArchiveSyncRun<VendorDayArchiveSyncResult>(
    {
      orgId: input.orgId,
      actor: input.actor,
    },
    async (_runId, integrationId): Promise<{
      result: VendorDayArchiveSyncResult;
      recordsIn: number;
      recordsUpserted: number;
      metadata?: Record<string, unknown>;
    }> => {
      const parent = await resolveVendorDayParent();
      if (!parent) {
        const skippedResult: VendorDayArchiveSyncResult = {
          pageId: null,
          created: false,
          updated: false,
          skipped: true,
          requestId: input.requestId,
          assignmentId: null,
          executionId: null,
          integrationId,
          reason: 'Vendor-day Notion archive is not configured',
        };
        return {
          result: skippedResult,
          recordsIn: 0,
          recordsUpserted: 0,
          metadata: {
            skipped: true,
            reason: 'Vendor-day Notion archive is not configured',
          },
        };
      }

      const snapshot = await loadVendorDayRequestSnapshot({
        orgId: input.orgId,
        requestId: input.requestId,
      });

      const resolved = await resolveVendorDayArchivePageByRequestId({
        orgId: input.orgId,
        requestId: input.requestId,
        parent,
      });

      const upserted = await upsertVendorDayArchivePage({
        orgId: input.orgId,
        integrationId,
        parent,
        snapshot: {
          ...snapshot,
          pageId: resolved.pageId,
          existingMapId: resolved.existingMapId,
          parent,
        },
        resolvedPageId: resolved.pageId,
      });

      await linkArchivePageToLocalModels({
        orgId: input.orgId,
        integrationId,
        pageId: upserted.pageId,
        requestId: input.requestId,
        assignmentId: snapshot.assignment?.id ?? null,
        executionId: snapshot.execution?.id ?? null,
      });

      const syncedResult: VendorDayArchiveSyncResult = {
        pageId: upserted.pageId,
        created: upserted.created,
        updated: upserted.updated,
        skipped: false,
        requestId: input.requestId,
        assignmentId: snapshot.assignment?.id ?? null,
        executionId: snapshot.execution?.id ?? null,
        integrationId,
      };

      return {
        result: syncedResult,
        recordsIn: 1,
        recordsUpserted: 1,
        metadata: {
          pageId: upserted.pageId,
          created: upserted.created,
          updated: upserted.updated,
        },
      };
    },
  );
}

export async function syncVendorDayArchiveForRequestId(input: {
  orgId: string;
  requestId: string;
  actor?: { userId?: string | null; email?: string | null };
}): Promise<VendorDayArchiveSyncResult> {
  return syncVendorDayArchiveRequestInternal(input);
}

export async function syncVendorDayArchiveForAssignmentId(input: {
  orgId: string;
  assignmentId: string;
  actor?: { userId?: string | null; email?: string | null };
}): Promise<VendorDayArchiveSyncResult> {
  const assignment = await prisma.vendorDayAssignment.findFirst({
    where: { id: input.assignmentId, orgId: input.orgId },
    select: { requestId: true },
  });
  if (!assignment) {
    throw new Error('Vendor-day assignment not found');
  }

  return syncVendorDayArchiveRequestInternal({
    orgId: input.orgId,
    requestId: assignment.requestId,
    actor: input.actor,
  });
}

export async function syncVendorDayArchiveForExecutionId(input: {
  orgId: string;
  executionId: string;
  actor?: { userId?: string | null; email?: string | null };
}): Promise<VendorDayArchiveSyncResult> {
  const execution = await prisma.vendorDayExecution.findFirst({
    where: { id: input.executionId, orgId: input.orgId },
    include: {
      assignment: {
        select: { requestId: true },
      },
    },
  });
  if (!execution) {
    throw new Error('Vendor-day execution not found');
  }

  return syncVendorDayArchiveRequestInternal({
    orgId: input.orgId,
    requestId: execution.assignment.requestId,
    actor: input.actor,
  });
}

export async function syncPendingVendorDayArchiveRequests(input?: {
  orgId?: string;
  actor?: { userId?: string | null; email?: string | null };
  limitPerOrg?: number;
}) {
  const orgIds =
    input?.orgId != null
      ? [input.orgId]
      : (await prisma.organizationWorkspace.findMany({
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })).map((org) => org.id);

  const summary = {
    orgCount: orgIds.length,
    requestsSynced: 0,
    requestsErrored: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    skipped: 0,
    errors: [] as Array<{ orgId: string; requestId: string; error: string }>,
  };

  for (const orgId of orgIds) {
    const requests = await prisma.vendorDayRequest.findMany({
      where: {
        orgId,
        OR: [
          {
            status: {
              in: [
                VendorDayRequestStatus.PROPOSED,
                VendorDayRequestStatus.REQUESTED,
                VendorDayRequestStatus.AWAITING_REP_APPROVAL,
                VendorDayRequestStatus.READY_FOR_DISPATCH,
                VendorDayRequestStatus.OFFER_PENDING,
                VendorDayRequestStatus.ASSIGNED,
                VendorDayRequestStatus.PASSED_OFF,
                VendorDayRequestStatus.NO_SHOW,
                VendorDayRequestStatus.EXCEPTION,
                VendorDayRequestStatus.DISPUTED,
                VendorDayRequestStatus.COMPLETED,
              ],
            },
          },
          {
            updatedAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      select: { id: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: input?.limitPerOrg ?? 75,
    });

    for (const request of requests) {
      try {
        const result: VendorDayArchiveSyncResult = await syncVendorDayArchiveForRequestId({
          orgId,
          requestId: request.id,
          actor: input?.actor,
        });
        summary.requestsSynced += 1;
        if (result.created) summary.pagesCreated += 1;
        if (result.updated) summary.pagesUpdated += 1;
        if (result.skipped) summary.skipped += 1;
      } catch (error) {
        summary.requestsErrored += 1;
        summary.errors.push({
          orgId,
          requestId: request.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return summary;
}
