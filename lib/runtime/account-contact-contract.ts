import type { ContactTableRow } from '@/components/crm/contacts-table';
import type { TerritoryStoresResponse } from '@/lib/territory/types';

export type RuntimeDataSource = 'notion-territory' | 'notion-contacts' | 'postgres-read-model';

export type RuntimeFreshnessState = 'fresh' | 'stale' | 'syncing' | 'error' | 'unknown';

export interface RuntimeFreshness {
  source: RuntimeDataSource;
  label: string;
  state: RuntimeFreshnessState;
  syncedAt: string | null;
  lastEditedAt: string | null;
  recordsRead: number;
  ageSeconds: number | null;
  stale: boolean;
  syncing: boolean;
  error: string | null;
  detail: string;
}

export interface RuntimeAccountSummary {
  id: string;
  notionPageId: string;
  name: string;
  status: string;
  statusKey: string;
  repNames: string[];
  repEmails: string[];
  licenseNumber: string | null;
  city: string | null;
  state: string | null;
  contactCount: number;
  lastEditedAt: string | null;
  source: 'territory-read-model';
}

export interface RuntimeContactSummary extends ContactTableRow {
  notionPageId: string;
  accountPageIds: string[];
  lastEditedAt: string | null;
  source: 'notion-contacts-cache';
}

export interface AccountContactRuntimePayload {
  accounts: RuntimeAccountSummary[];
  contacts: RuntimeContactSummary[];
  freshness: {
    accounts: RuntimeFreshness;
    contacts: RuntimeFreshness;
  };
  summary: {
    accountCount: number;
    contactCount: number;
    unlinkedContactCount: number;
    staleSourceCount: number;
  };
}

type TerritoryFreshnessMeta = TerritoryStoresResponse['meta'];

export interface ContactsFreshnessMeta {
  syncedAt: string | null;
  lastEditedMax: string | null;
  recordsRead: number;
  stale: boolean;
  syncing: boolean;
  syncError: string | null;
}

function secondsSince(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

function freshnessState(input: {
  syncedAt: string | null;
  stale: boolean;
  syncing: boolean;
  error: string | null;
}): RuntimeFreshnessState {
  if (input.error) {
    return 'error';
  }

  if (input.syncing) {
    return 'syncing';
  }

  if (input.stale) {
    return 'stale';
  }

  if (!input.syncedAt) {
    return 'unknown';
  }

  return 'fresh';
}

export function buildTerritoryFreshness(meta: TerritoryFreshnessMeta): RuntimeFreshness {
  const syncedAt = meta.syncedAt ?? null;
  const error = meta.syncError ?? null;
  const state = freshnessState({
    syncedAt,
    stale: meta.stale,
    syncing: meta.syncing,
    error,
  });
  const engine = meta.sourceEngine === 'postgis' ? 'Postgres read model' : 'Notion cache';

  return {
    source: meta.sourceEngine === 'postgis' ? 'postgres-read-model' : 'notion-territory',
    label: 'Accounts',
    state,
    syncedAt,
    lastEditedAt: meta.lastEditedMax ?? null,
    recordsRead: meta.recordsRead,
    ageSeconds: secondsSince(syncedAt),
    stale: meta.stale,
    syncing: meta.syncing,
    error,
    detail:
      state === 'fresh'
        ? `${engine} is current.`
        : state === 'syncing'
          ? `Showing ${engine.toLowerCase()} while a refresh is running.`
          : state === 'error'
            ? `Showing the last usable ${engine.toLowerCase()} because the latest refresh failed.`
            : state === 'stale'
              ? `Showing stale ${engine.toLowerCase()} data.`
              : `${engine} has not reported a sync time yet.`,
  };
}

export function buildContactsFreshness(meta: ContactsFreshnessMeta): RuntimeFreshness {
  const syncedAt = meta.syncedAt ?? null;
  const error = meta.syncError ?? null;
  const state = freshnessState({
    syncedAt,
    stale: meta.stale,
    syncing: meta.syncing,
    error,
  });

  return {
    source: 'notion-contacts',
    label: 'Contacts',
    state,
    syncedAt,
    lastEditedAt: meta.lastEditedMax ?? null,
    recordsRead: meta.recordsRead,
    ageSeconds: secondsSince(syncedAt),
    stale: meta.stale,
    syncing: meta.syncing,
    error,
    detail:
      state === 'fresh'
        ? 'Notion contact cache is current.'
        : state === 'syncing'
          ? 'Showing cached contacts while a refresh is running.'
          : state === 'error'
            ? 'Showing the last usable contact cache because the latest refresh failed.'
            : state === 'stale'
              ? 'Showing stale contact data from the Notion cache.'
              : 'Contact cache has not reported a sync time yet.',
  };
}

export function buildRuntimeErrorFreshness(input: {
  source: RuntimeDataSource;
  label: string;
  error: unknown;
}): RuntimeFreshness {
  const message = input.error instanceof Error ? input.error.message : String(input.error || 'Source failed to load');

  return {
    source: input.source,
    label: input.label,
    state: 'error',
    syncedAt: null,
    lastEditedAt: null,
    recordsRead: 0,
    ageSeconds: null,
    stale: true,
    syncing: false,
    error: message,
    detail: `${input.label} could not load. Showing no rows from this source until the connection recovers.`,
  };
}

export function staleSourceCount(freshness: RuntimeFreshness[]) {
  return freshness.filter((item) => item.state === 'stale' || item.state === 'syncing' || item.state === 'error').length;
}
