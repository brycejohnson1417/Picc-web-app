import 'server-only';

import {
  type AccountContactRuntimePayload,
  buildContactsFreshness,
  buildRuntimeErrorFreshness,
  buildTerritoryFreshness,
  staleSourceCount,
  type RuntimeAccountSummary,
} from '@/lib/runtime/account-contact-contract';
import { loadLiveNotionContactsWithMeta } from '@/lib/server/notion-live-crm';
import { loadTerritoryStores } from '@/lib/server/notion-territory';
import type { PreferredPartnerFilter } from '@/lib/territory/preferred-partner';
import type { TerritoryStoresResponse } from '@/lib/territory/types';

export interface AccountContactRuntimeInput {
  statuses?: string[];
  reps?: string[];
  pppStatuses?: string[];
  headsetConnectionStatuses?: string[];
  preferredPartnerFilter?: PreferredPartnerFilter;
  referralSources?: string[];
  includeNoReferralSource?: boolean;
  vendorDayStatuses?: string[];
  query?: string;
  refresh?: boolean;
}

function normalizePageId(value: string) {
  return value.replace(/-/g, '').trim().toLowerCase();
}

function buildContactCountByAccount(contacts: AccountContactRuntimePayload['contacts']) {
  const counts = new Map<string, number>();

  for (const contact of contacts) {
    for (const accountPageId of contact.accountPageIds) {
      const normalizedId = normalizePageId(accountPageId);
      if (!normalizedId) {
        continue;
      }
      counts.set(normalizedId, (counts.get(normalizedId) ?? 0) + 1);
    }
  }

  return counts;
}

function mapAccounts(
  territory: TerritoryStoresResponse,
  contactCountByAccount: Map<string, number>,
): RuntimeAccountSummary[] {
  return territory.stores.map((store) => ({
    id: store.id,
    notionPageId: store.notionPageId,
    name: store.name,
    status: store.status,
    statusKey: store.statusKey,
    repNames: store.repNames,
    repEmails: store.repEmails,
    licenseNumber: store.licenseNumber ?? null,
    city: store.city ?? null,
    state: store.state ?? null,
    contactCount: contactCountByAccount.get(normalizePageId(store.notionPageId)) ?? 0,
    lastEditedAt: store.lastEditedTime ?? null,
    source: 'territory-read-model',
  }));
}

export async function loadAccountContactRuntime(
  input: AccountContactRuntimeInput = {},
): Promise<AccountContactRuntimePayload> {
  const [territoryResult, contactsResult] = await Promise.allSettled([
    loadTerritoryStores({
      statuses: input.statuses,
      reps: input.reps,
      pppStatuses: input.pppStatuses,
      headsetConnectionStatuses: input.headsetConnectionStatuses,
      preferredPartnerFilter: input.preferredPartnerFilter,
      referralSources: input.referralSources,
      includeNoReferralSource: input.includeNoReferralSource,
      vendorDayStatuses: input.vendorDayStatuses,
      query: input.query,
      refresh: input.refresh,
    }),
    loadLiveNotionContactsWithMeta(),
  ]);

  const contacts = contactsResult.status === 'fulfilled' ? contactsResult.value.rows : [];
  const contactCountByAccount = buildContactCountByAccount(contacts);
  const accounts = territoryResult.status === 'fulfilled'
    ? mapAccounts(territoryResult.value, contactCountByAccount)
    : [];
  const freshness = {
    accounts:
      territoryResult.status === 'fulfilled'
        ? buildTerritoryFreshness(territoryResult.value.meta)
        : buildRuntimeErrorFreshness({
            source: 'notion-territory',
            label: 'Accounts',
            error: territoryResult.reason,
          }),
    contacts:
      contactsResult.status === 'fulfilled'
        ? buildContactsFreshness(contactsResult.value.meta)
        : buildRuntimeErrorFreshness({
            source: 'notion-contacts',
            label: 'Contacts',
            error: contactsResult.reason,
          }),
  };

  return {
    accounts,
    contacts,
    freshness,
    summary: {
      accountCount: accounts.length,
      contactCount: contacts.length,
      unlinkedContactCount: contacts.filter((contact) => contact.accountPageIds.length === 0).length,
      staleSourceCount: staleSourceCount([freshness.accounts, freshness.contacts]),
    },
  };
}
