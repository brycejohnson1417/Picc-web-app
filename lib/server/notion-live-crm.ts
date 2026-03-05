import 'server-only';

import type { AccountTableRow } from '@/components/crm/accounts-table';
import type { ContactTableRow } from '@/components/crm/contacts-table';
import {
  getSyncTtlMinutes,
  isSnapshotStale,
  readNotionCacheSnapshot,
  writeNotionCacheSnapshot,
} from '@/lib/server/notion-cache-store';
import { getCachedTerritoryStores } from '@/lib/server/notion-territory';
import { prisma } from '@/lib/db/prisma';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const CONTACTS_DB_FALLBACK = '3bce11e6de354ca0bac75ed6114a1b0f';
const CONTACTS_SNAPSHOT_KEY = 'crm-contacts-v1';
const DEFAULT_CONTACTS_SYNC_TTL_MINUTES = 20;
let contactsSyncInFlight: Promise<void> | null = null;

interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

type NotionQueryResponse = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

interface CachedContactRow extends ContactTableRow {
  accountPageIds: string[];
  lastEditedTime: string;
}

export interface LiveAccountContact {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
  status: ContactTableRow['status'];
  linkedWork: string;
}

function requiredEnv(name: 'NOTION_API_KEY') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getContactsDbId() {
  return process.env.NOTION_CONTACTS_DATABASE_ID?.trim() || CONTACTS_DB_FALLBACK;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getPropertyByCandidates(props: Record<string, unknown>, candidates: string[]) {
  const entries = Object.entries(props);
  const byNormalized = new Map(entries.map(([key, value]) => [normalizeKey(key), value]));

  for (const candidate of candidates) {
    const direct = props[candidate];
    if (direct !== undefined) {
      return direct;
    }

    const normalizedMatch = byNormalized.get(normalizeKey(candidate));
    if (normalizedMatch !== undefined) {
      return normalizedMatch;
    }
  }

  return undefined;
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

  if ((response.status === 429 || response.status >= 500) && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return notionRequest<T>(path, init, attempt + 1);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Notion request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

async function queryAllPages(databaseId: string) {
  const pages: NotionPage[] = [];
  let startCursor: string | undefined;

  while (true) {
    const data = await notionRequest<NotionQueryResponse>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    });

    pages.push(...(data.results ?? []));
    if (!data.has_more || !data.next_cursor) {
      break;
    }

    startCursor = data.next_cursor;
  }

  return pages;
}

function readTitle(value: unknown) {
  const title = (value as { title?: Array<{ plain_text?: string }> } | undefined)?.title;
  if (!Array.isArray(title)) {
    return '';
  }
  return title.map((item) => item?.plain_text ?? '').join('').trim();
}

function readRichText(value: unknown) {
  const richText = (value as { rich_text?: Array<{ plain_text?: string }> } | undefined)?.rich_text;
  if (!Array.isArray(richText)) {
    return '';
  }
  return richText.map((item) => item?.plain_text ?? '').join('').trim();
}

function readEmail(value: unknown) {
  const email = (value as { email?: string } | undefined)?.email;
  return typeof email === 'string' ? email : '';
}

function readPhone(value: unknown) {
  const phone = (value as { phone_number?: string } | undefined)?.phone_number;
  return typeof phone === 'string' ? phone : '';
}

function readMultiSelectText(value: unknown) {
  const options = (value as { multi_select?: Array<{ name?: string }> } | undefined)?.multi_select;
  if (!Array.isArray(options)) {
    return '';
  }

  return options
    .map((option) => option?.name ?? '')
    .filter(Boolean)
    .join(', ');
}

function readRelationIds(value: unknown) {
  const relation = (value as { relation?: Array<{ id?: string }> } | undefined)?.relation;
  if (!Array.isArray(relation)) {
    return [];
  }

  return relation
    .map((item) => item?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => id.replace(/-/g, ''));
}

function readStatusName(value: unknown) {
  const status = (value as { status?: { name?: string } } | undefined)?.status?.name;
  return typeof status === 'string' ? status : '';
}

function readRollupStatusName(value: unknown) {
  const rollup = (value as { rollup?: { array?: Array<{ type?: string; status?: { name?: string } }> } } | undefined)?.rollup;
  if (!Array.isArray(rollup?.array)) {
    return '';
  }

  for (const item of rollup.array) {
    if (item?.type === 'status' && item.status?.name) {
      return item.status.name;
    }
  }

  return '';
}

function toAccountStatus(statusName: string): 'ACTIVE' | 'INACTIVE' {
  const normalized = statusName.trim().toLowerCase();
  if (!normalized) {
    return 'ACTIVE';
  }
  if (normalized === 'bad customer' || normalized === 'inactive' || normalized === 'closed') {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

function parseStateFromAddress(address: string | null | undefined) {
  if (!address) {
    return '—';
  }
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?/);
  return match?.[1] ?? '—';
}

function normalizeCachedContacts(payload: unknown): CachedContactRow[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is CachedContactRow => {
    if (typeof row !== 'object' || row === null) {
      return false;
    }
    const typed = row as CachedContactRow;
    return Boolean(typed.id && typed.name && Array.isArray(typed.accountPageIds));
  });
}

async function syncContactsSnapshotFromNotion() {
  const contactsDbId = getContactsDbId();
  const pages = await queryAllPages(contactsDbId);
  const territory = await getCachedTerritoryStores();
  const accountNameByPageId = new Map(territory.stores.map((store) => [store.notionPageId.replace(/-/g, ''), store.name]));

  const rows: CachedContactRow[] = pages.map((page) => {
    const props = page.properties ?? {};

    const name =
      readTitle(getPropertyByCandidates(props, ['Contact Name', 'Name', 'Full Name'])) ||
      readRichText(getPropertyByCandidates(props, ['Contact Name', 'Name', 'Full Name'])) ||
      'Unnamed Contact';

    const relationIds = readRelationIds(getPropertyByCandidates(props, ['Dispensary', 'Account', 'Store', 'Company']));
    const accountName = relationIds.map((id) => accountNameByPageId.get(id)).find(Boolean) ?? '—';

    const statusName =
      readRollupStatusName(getPropertyByCandidates(props, ['Dispensary Account Status', 'Account Status'])) ||
      readStatusName(getPropertyByCandidates(props, ['Status']));

    const phone =
      readPhone(getPropertyByCandidates(props, ['Phone Number', 'Phone'])) ||
      readPhone(getPropertyByCandidates(props, Object.keys(props).filter((key) => key.toLowerCase().includes('phone'))));

    return {
      id: page.id,
      name,
      roleTitle:
        readRichText(getPropertyByCandidates(props, ['Contact Position', 'Role', 'Role Title', 'Title'])) ||
        '—',
      accountName,
      email: readEmail(getPropertyByCandidates(props, ['Email', 'Email Address'])) || '—',
      phone: phone || '—',
      status: toAccountStatus(statusName),
      linkedWork: readMultiSelectText(getPropertyByCandidates(props, ['Where Contact Info Came From', 'Source', 'Linked Work'])) || '—',
      accountPageIds: relationIds,
      lastEditedTime: page.last_edited_time,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const lastEditedMax = rows.reduce<string | null>((max, row) => {
    if (!max || row.lastEditedTime > max) {
      return row.lastEditedTime;
    }
    return max;
  }, null);

  await writeNotionCacheSnapshot<CachedContactRow[]>({
    key: CONTACTS_SNAPSHOT_KEY,
    payload: rows,
    recordsRead: pages.length,
    lastEditedMax,
  });

  return {
    rows,
    recordsRead: pages.length,
    lastEditedMax,
  };
}

function startContactsBackgroundSync() {
  if (contactsSyncInFlight) {
    return;
  }

  contactsSyncInFlight = syncContactsSnapshotFromNotion()
    .then(() => undefined)
    .catch(() => {
      // Background refresh failures should not block reads from existing cache.
      return undefined;
    })
    .finally(() => {
      contactsSyncInFlight = null;
    });
}

async function getCachedContacts(input?: { refresh?: boolean }) {
  const ttlMinutes = getSyncTtlMinutes(DEFAULT_CONTACTS_SYNC_TTL_MINUTES);
  let snapshot = await readNotionCacheSnapshot<CachedContactRow[]>(CONTACTS_SNAPSHOT_KEY);

  if (snapshot) {
    snapshot = {
      ...snapshot,
      payload: normalizeCachedContacts(snapshot.payload),
    };
  }

  const needsSync =
    Boolean(input?.refresh) ||
    !snapshot ||
    snapshot.payload.length === 0 ||
    snapshot.recordsRead === 0 ||
    isSnapshotStale(snapshot.syncedAt, ttlMinutes);

  if (needsSync) {
    if (input?.refresh || !snapshot || snapshot.payload.length === 0) {
      try {
        const synced = await syncContactsSnapshotFromNotion();
        return {
          rows: synced.rows,
          syncedAt: new Date().toISOString(),
        };
      } catch (error) {
        if (!snapshot) {
          throw error;
        }

        return {
          rows: snapshot.payload,
          syncedAt: snapshot.syncedAt,
        };
      }
    } else {
      startContactsBackgroundSync();
      return {
        rows: snapshot.payload,
        syncedAt: snapshot.syncedAt,
      };
    }
  }

  if (!snapshot) {
    throw new Error('Contacts cache is unavailable');
  }

  return {
    rows: snapshot.payload,
    syncedAt: snapshot.syncedAt,
  };
}

export async function loadLiveNotionAccounts(orgIdInput?: string): Promise<AccountTableRow[]> {
  const territory = await getCachedTerritoryStores();
  const contacts = await getCachedContacts().catch(() => ({ rows: [] as CachedContactRow[] }));
  const orgId = orgIdInput?.trim() || process.env.TERRITORY_ORG_ID?.trim();
  if (!orgId) {
    throw new Error('Territory org context is required');
  }

  const [localAccounts, openOppValueByAccount] = await Promise.all([
    prisma.account.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        licenseNumber: true,
        notionPageId: true,
      },
    }),
    prisma.opportunity.groupBy({
      by: ['accountId'],
      where: { orgId, status: 'OPEN' },
      _sum: { value: true },
    }),
  ]);

  const accountByNotionId = new Map(
    localAccounts
      .filter((account) => Boolean(account.notionPageId))
      .map((account) => [account.notionPageId?.replace(/-/g, '').toLowerCase() ?? '', account]),
  );
  const accountByLicense = new Map(localAccounts.map((account) => [account.licenseNumber.trim().toLowerCase(), account]));
  const accountByName = new Map(localAccounts.map((account) => [account.name.trim().toLowerCase(), account]));
  const openOppByAccountId = new Map(openOppValueByAccount.map((row) => [row.accountId, Number(row._sum.value ?? 0)]));

  const contactsByAccountId = new Map<string, number>();
  for (const row of contacts.rows) {
    for (const pageId of row.accountPageIds) {
      contactsByAccountId.set(pageId, (contactsByAccountId.get(pageId) ?? 0) + 1);
    }
  }

  const rows: AccountTableRow[] = territory.stores.map((store) => {
    const normalizedPageId = store.notionPageId.replace(/-/g, '');
    const localAccount =
      accountByNotionId.get(normalizedPageId.toLowerCase()) ??
      (store.licenseNumber ? accountByLicense.get(store.licenseNumber.trim().toLowerCase()) : undefined) ??
      accountByName.get(store.name.trim().toLowerCase());

    return {
      id: localAccount?.id ?? store.notionPageId,
      name: store.name,
      licenseNumber: store.licenseNumber || '—',
      status: toAccountStatus(store.status),
      city: store.city || '—',
      state: store.state || parseStateFromAddress(store.locationAddress),
      contactsCount: contactsByAccountId.get(normalizedPageId) ?? 0,
      openValue: localAccount ? openOppByAccountId.get(localAccount.id) ?? 0 : 0,
      daysOverdue: Math.max(0, Math.trunc(store.daysOverdue ?? 0)),
      lastUpdated: new Date(store.lastEditedTime).toLocaleDateString(),
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function loadLiveNotionContacts(): Promise<ContactTableRow[]> {
  const contacts = await getCachedContacts();

  return contacts.rows.map((row) => ({
    id: row.id,
    name: row.name,
    roleTitle: row.roleTitle,
    accountName: row.accountName,
    email: row.email,
    phone: row.phone,
    status: row.status,
    linkedWork: row.linkedWork,
  }));
}

export async function loadLiveNotionContactsForAccount(accountPageId: string): Promise<LiveAccountContact[]> {
  const normalizedTargetId = accountPageId.replace(/-/g, '').trim();
  if (!normalizedTargetId) {
    return [];
  }

  const contacts = await getCachedContacts();
  return contacts.rows
    .filter((row) => row.accountPageIds.includes(normalizedTargetId))
    .map((row) => ({
      id: row.id,
      name: row.name,
      roleTitle: row.roleTitle,
      email: row.email,
      phone: row.phone,
      status: row.status,
      linkedWork: row.linkedWork,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function prewarmLiveCrmCaches() {
  const [territory, contacts] = await Promise.allSettled([
    getCachedTerritoryStores({ refresh: true }),
    getCachedContacts({ refresh: true }),
  ]);

  return {
    territory:
      territory.status === 'fulfilled'
        ? {
            ok: true,
            recordsRead: territory.value.meta.recordsRead,
            unresolvedLocationCount: territory.value.meta.unresolvedLocationCount,
            syncedAt: territory.value.meta.syncedAt,
            stale: territory.value.meta.stale,
          }
        : {
            ok: false,
            error: territory.reason instanceof Error ? territory.reason.message : 'Territory cache sync failed',
          },
    contacts:
      contacts.status === 'fulfilled'
        ? {
            ok: true,
            recordsRead: contacts.value.rows.length,
            syncedAt: contacts.value.syncedAt,
          }
        : {
            ok: false,
            error: contacts.reason instanceof Error ? contacts.reason.message : 'Contacts cache sync failed',
          },
  };
}
