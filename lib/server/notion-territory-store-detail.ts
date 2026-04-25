import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type {
  TerritoryStoreCheckIn,
  TerritoryStoreContact,
  TerritoryStoreDetailResponse,
  TerritoryStorePin,
  TerritoryVendorDaySummary,
} from '@/lib/territory/types';

type CachedContactRow = TerritoryStoreContact & {
  accountPageIds: string[];
  lastEditedTime: string;
};

type NotionPropertyValue = {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  email?: string | null;
  phone_number?: string | null;
  url?: string | null;
  select?: { name?: string; color?: string | null } | null;
  status?: { name?: string; color?: string | null } | null;
  people?: Array<{ name?: string; person?: { email?: string | null } | null }>;
  date?: { start?: string | null; end?: string | null } | null;
  formula?: {
    type?: 'string' | 'number' | 'boolean' | 'date';
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: { start?: string | null } | null;
  } | null;
  rollup?: {
    type?: 'string' | 'number' | 'date' | 'array';
    string?: string | null;
    number?: number | null;
    date?: { start?: string | null } | null;
    array?: NotionPropertyValue[];
  } | null;
  number?: number | null;
  checkbox?: boolean;
};

type NotionPageResponse = {
  properties?: Record<string, NotionPropertyValue>;
};

const CANCELED_ORDER_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);

type TerritoryStoreDetailServiceDeps = {
  getTerritorySnapshot: () => Promise<{ stores: TerritoryStorePin[] }>;
  loadTerritoryStoreFromReadModel: (storeId: string) => Promise<TerritoryStorePin | null>;
  resolveStoreByIdentifier: (stores: TerritoryStorePin[], storeId: string) => Promise<TerritoryStorePin | null>;
  loadStoreCheckIns: (store: TerritoryStorePin) => Promise<TerritoryStoreCheckIn[]>;
  loadStoreVendorDaySummary: (store: TerritoryStorePin) => Promise<TerritoryVendorDaySummary>;
  notionRequest: <T>(path: string, init?: RequestInit, attempt?: number) => Promise<T>;
  readNotionCacheSnapshot: <T>(key: string) => Promise<{ payload: T } | null>;
  contactsSnapshotKey: string;
  normalizeCachedContacts: (payload: unknown) => CachedContactRow[];
  normalizePageId: (value: string) => string;
};

function propertyValueByCandidates(properties: Record<string, NotionPropertyValue>, candidates: string[]) {
  const candidateSet = new Set(candidates.map(normalizePropertyName));
  for (const [name, value] of Object.entries(properties)) {
    if (candidateSet.has(normalizePropertyName(name))) {
      return value;
    }
  }
  return undefined;
}

function normalizePropertyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readNumberProperty(property: NotionPropertyValue | undefined) {
  if (typeof property?.number === 'number') {
    return property.number;
  }
  if (property?.formula?.type === 'number' && typeof property.formula.number === 'number') {
    return property.formula.number;
  }
  return null;
}

function readTextFromAnyProperty(property: NotionPropertyValue | undefined): string {
  if (!property) return '';

  const title = (property.title ?? []).map((item) => item?.plain_text ?? '').join('').trim();
  if (title) return title;

  const richText = (property.rich_text ?? []).map((item) => item?.plain_text ?? '').join('').trim();
  if (richText) return richText;

  if (property.email) return property.email.trim();
  if (property.phone_number) return property.phone_number.trim();
  if (property.url) return property.url.trim();
  if (property.select?.name) return property.select.name.trim();
  if (property.status?.name) return property.status.name.trim();

  if (Array.isArray(property.people) && property.people.length > 0) {
    const people = property.people
      .map((person) => person?.name ?? person?.person?.email ?? '')
      .filter(Boolean)
      .join(', ')
      .trim();
    if (people) return people;
  }

  if (property.date?.start) return property.date.start;
  if (property.formula?.type === 'string' && property.formula.string) return property.formula.string.trim();
  if (property.formula?.type === 'date' && property.formula.date?.start) return property.formula.date.start;
  if (property.formula?.type === 'number' && typeof property.formula.number === 'number') return String(property.formula.number);
  if (property.rollup?.type === 'string' && property.rollup.string) return property.rollup.string.trim();
  if (property.rollup?.type === 'date' && property.rollup.date?.start) return property.rollup.date.start;
  if (property.rollup?.type === 'number' && typeof property.rollup.number === 'number') return String(property.rollup.number);
  if (property.rollup?.type === 'array' && Array.isArray(property.rollup.array)) {
    const values: string[] = property.rollup.array.map(readTextFromAnyProperty).filter(Boolean);
    if (values.length > 0) return values.join(', ');
  }
  if (typeof property.number === 'number') return String(property.number);
  if (typeof property.checkbox === 'boolean') return property.checkbox ? 'Yes' : 'No';

  return '';
}

function readSelectLikeColorProperty(property: NotionPropertyValue | undefined) {
  if (property?.status?.color?.trim()) return property.status.color.trim().toLowerCase();
  if (property?.select?.color?.trim()) return property.select.color.trim().toLowerCase();
  return null;
}

function toIsoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dateToIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function normalizeIdentity(value: string | null | undefined) {
  const clean = value?.trim().toLowerCase();
  return clean || null;
}

function uniqueOrderFilters(filters: Prisma.NabisOrderWhereInput[]) {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = JSON.stringify(filter);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function findMatchedAccountForStore(store: TerritoryStorePin) {
  const accountCandidates = await prisma.account.findMany({
    where: {
      OR: [
        { notionPageId: store.notionPageId },
        store.licenseNumber?.trim() ? { licenseNumber: store.licenseNumber.trim() } : undefined,
        store.name.trim() ? { name: { equals: store.name.trim(), mode: 'insensitive' } } : undefined,
      ].filter(Boolean) as Prisma.AccountWhereInput[],
    },
    select: {
      id: true,
      licensedLocationId: true,
      nabisRetailerId: true,
    },
    take: 5,
  });

  return accountCandidates.find((candidate) => candidate.licensedLocationId || candidate.nabisRetailerId) ?? accountCandidates[0] ?? null;
}

export function createTerritoryStoreDetailService(deps: TerritoryStoreDetailServiceDeps) {
  async function loadStoreCrmFields(store: TerritoryStorePin, contacts: CachedContactRow[]) {
    const page = await deps.notionRequest<NotionPageResponse>(`/pages/${store.notionPageId}`);
    const properties = page.properties ?? {};
    const firstContact = contacts[0];

    const contactText = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Contact']));
    const contactEmail = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Contact Email', 'Contact Email (1)', 'Email', 'Nabis POC Email', 'Billing AP Email', 'VD Contact Email']));
    const contactPhone = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Contact Phone', 'Contact Number', 'Phone', 'Nabis POC Phone', 'Billing AP Phone', 'VD Contact Number']));
    const primaryContactName = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact Name', 'Primary Contact']));
    const primaryContactBuyer = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact / Buyer', 'Primary Contact Buyer', 'Buyer']));
    const primaryContactEmail = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact Email', 'Buyer Email', 'Contact Email', 'Contact Email (1)', 'Nabis POC Email']));
    const primaryContactPhone = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact Phone', 'Buyer Phone', 'Contact Phone', 'Contact Number', 'Nabis POC Phone']));
    const rep = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Rep', 'PICC Rep', 'Sales Rep']));
    const accountManager = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Account Manager', 'Manager']));
    const piccCreditStatus = readTextFromAnyProperty(propertyValueByCandidates(properties, ['PICC Credit Status', 'Credit Status', 'Nabis Credit Rating', 'PICC Credit Status (Formula)', 'PICC Credit Status (1)']));
    const accountStatusProperty = propertyValueByCandidates(properties, ['Account Status']);
    const accountStatus = readTextFromAnyProperty(accountStatusProperty);
    const accountStatusColorName = readSelectLikeColorProperty(accountStatusProperty);
    const lastOrderAmount = readNumberProperty(propertyValueByCandidates(properties, ['Last Order Amount', 'Latest Order Amount', 'Order Amount']));
    const lastContacted = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Last Contacted', 'Last Contact Date']));
    const lastDeliveryDate = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Last Delivery Date', 'Most Recent Delivery Date', 'Last Order Delivery Date']));
    const lastSampleOrderDate = readTextFromAnyProperty(
      propertyValueByCandidates(properties, ['Last Sample Order Date', 'Sample Order Date', 'Last Sample Date']),
    );
    const lastOrderDate = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Last Order Date', 'Most Recent Order Date']));
    const referralSource = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Referral Source', 'Lead Source', 'Source']));
    const customerSince = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Customer Since', 'Customer Since Date', 'Start Date']));
    const pennyBundlePromoStatus = readTextFromAnyProperty(
      propertyValueByCandidates(properties, ['Penny Bundle Promo Status', 'Penny Bundle Status', 'Penny Bundle', 'Penny Bundle Promo']),
    );
    const pppStatusProperty = propertyValueByCandidates(properties, ['PPP Status']);
    const pppStatus = readTextFromAnyProperty(pppStatusProperty);
    const pppStatusColorName = readSelectLikeColorProperty(pppStatusProperty);
    const headsetConnectionProperty = propertyValueByCandidates(properties, ['Headset Connection Status', 'Headset Status', 'Headset Connection']);
    const headsetConnectionStatus = readTextFromAnyProperty(headsetConnectionProperty);
    const headsetConnectionStatusColorName = readSelectLikeColorProperty(headsetConnectionProperty);
    const productTracking = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Product Tracking']));
    const displayTracking = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Display Tracking']));

    const contactFallback = contacts.slice(0, 3).map((contact) => contact.name).filter(Boolean).join(', ');

    return {
      contact: contactText || contactFallback || null,
      contactEmail: contactEmail || primaryContactEmail || firstContact?.email || null,
      contactPhone: contactPhone || primaryContactPhone || firstContact?.phone || null,
      primaryContactName: primaryContactName || firstContact?.name || null,
      primaryContactBuyer: primaryContactBuyer || null,
      primaryContactEmail: primaryContactEmail || firstContact?.email || null,
      primaryContactPhone: primaryContactPhone || firstContact?.phone || null,
      rep: rep || store.repNames[0] || null,
      accountManager: accountManager || null,
      piccCreditStatus: piccCreditStatus || null,
      accountStatus: accountStatus || store.status || null,
      accountStatusColorName: accountStatusColorName || store.statusColorName || null,
      lastOrderAmount,
      lastContacted: toIsoDate(lastContacted) ?? null,
      lastDeliveryDate: toIsoDate(lastDeliveryDate) ?? null,
      lastSampleOrderDate: toIsoDate(lastSampleOrderDate) ?? null,
      lastOrderDate: toIsoDate(lastOrderDate) ?? null,
      referralSource: referralSource || null,
      customerSince: customerSince ? (toIsoDate(customerSince) ?? customerSince) : null,
      pennyBundlePromoStatus: pennyBundlePromoStatus || null,
      pppStatus: pppStatus || null,
      pppStatusColorName: pppStatusColorName || store.pppStatusColorName || null,
      headsetConnectionStatus: headsetConnectionStatus || null,
      headsetConnectionStatusColorName: headsetConnectionStatusColorName || store.headsetConnectionStatusColorName || null,
      productTracking: productTracking || null,
      displayTracking: displayTracking || null,
    };
  }

  async function loadStoreNabisOrderSummary(store: TerritoryStorePin) {
    const account = await findMatchedAccountForStore(store);

    const orFilters: Prisma.NabisOrderWhereInput[] = [];
    if (account?.id) {
      orFilters.push({ accountId: account.id });
    }
    if (account?.licensedLocationId?.trim()) {
      orFilters.push({ licensedLocationId: account.licensedLocationId.trim() });
    }
    if (account?.nabisRetailerId?.trim()) {
      orFilters.push({ nabisRetailerId: account.nabisRetailerId.trim() });
    }
    if (store.licenseNumber?.trim()) {
      orFilters.push({ licensedLocationId: store.licenseNumber.trim() });
    }
    if (store.name.trim()) {
      orFilters.push({ licensedLocationName: { equals: store.name.trim(), mode: 'insensitive' } });
    }

    const uniqueFilters = uniqueOrderFilters(orFilters);

    const rows = await prisma.nabisOrder.findMany({
      where: {
        OR: uniqueFilters,
        isInternalTransfer: false,
        NOT: [...CANCELED_ORDER_STATUSES].map((status) => ({ status })),
      },
      select: {
        id: true,
        externalOrderId: true,
        orderNumber: true,
        licensedLocationName: true,
        orderCreatedDate: true,
        deliveryDate: true,
        createdAt: true,
        status: true,
        orderTotal: true,
        salesRep: true,
      },
      orderBy: [{ orderCreatedDate: 'desc' }, { deliveryDate: 'desc' }, { createdAt: 'desc' }],
    });

    const now = new Date();
    const monthStarts = Array.from({ length: 6 }, (_, index) => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
      return start;
    });

    const buckets = new Map(
      monthStarts.map((start) => {
        const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
        return [key, { month: key, orderCount: 0, orderTotal: 0, revenue: 0 }];
      }),
    );

    for (const row of rows) {
      const date = row.orderCreatedDate ?? row.deliveryDate ?? row.createdAt;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }

      const orderTotal = row.orderTotal ? Number(row.orderTotal) : 0;
      bucket.orderCount += 1;
      bucket.orderTotal += orderTotal;
      bucket.revenue += orderTotal;
    }

    const latestOrder = rows[0] ?? null;

    const matchedBy: 'account' | 'name' | 'identifier' = account?.id
      ? 'account'
      : uniqueFilters.some((filter) => normalizeIdentity(String((filter as { licensedLocationName?: { equals?: string } }).licensedLocationName?.equals ?? '')) === normalizeIdentity(store.name))
        ? 'name'
        : 'identifier';

    return {
      matchedAccountId: account?.id ?? null,
      matchedBy,
      monthly: [...buckets.values()],
      recentOrders: rows.slice(0, 6).map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber ?? row.externalOrderId,
        createdDate: dateToIso(row.orderCreatedDate),
        deliveryDate: dateToIso(row.deliveryDate),
        status: row.status ?? 'UNKNOWN',
        total: row.orderTotal ? Number(row.orderTotal) : 0,
        salesRep: row.salesRep,
        customerName: row.licensedLocationName,
      })),
      orders: rows.slice(0, 25).map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber ?? row.externalOrderId,
        createdDate: dateToIso(row.orderCreatedDate),
        deliveryDate: dateToIso(row.deliveryDate),
        status: row.status ?? 'UNKNOWN',
        total: row.orderTotal ? Number(row.orderTotal) : 0,
        salesRep: row.salesRep,
        customerName: row.licensedLocationName,
      })),
      lastOrderDate: dateToIso(latestOrder?.orderCreatedDate),
      lastDeliveryDate: dateToIso(latestOrder?.deliveryDate),
      lastOrderAmount: latestOrder?.orderTotal ? Number(latestOrder.orderTotal) : null,
    };
  }

  async function loadStoreAccountHistory(store: TerritoryStorePin) {
    const account = await findMatchedAccountForStore(store);
    if (!account?.id) {
      return [];
    }

    const rows = await prisma.activityLog.findMany({
      where: {
        accountId: account.id,
        type: 'ACCOUNT_UPDATED',
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      type: row.type,
      title: row.title,
      description: row.description ?? null,
    }));
  }

  async function loadTerritoryStoreDetail(storeId: string): Promise<TerritoryStoreDetailResponse> {
    const snapshot = await deps.getTerritorySnapshot();
    const foundStore = (await deps.loadTerritoryStoreFromReadModel(storeId)) ?? (await deps.resolveStoreByIdentifier(snapshot.stores, storeId));
    if (!foundStore) {
      throw new Error('Store not found');
    }
    const snapshotStore = await deps.resolveStoreByIdentifier(snapshot.stores, foundStore.id).catch(() => null);
    const store: TerritoryStorePin = {
      ...foundStore,
      pppStatus: snapshotStore?.pppStatus ?? foundStore.pppStatus ?? null,
      pppStatusColorName: snapshotStore?.pppStatusColorName ?? foundStore.pppStatusColorName ?? null,
      headsetConnectionStatus: snapshotStore?.headsetConnectionStatus ?? foundStore.headsetConnectionStatus ?? null,
      headsetConnectionStatusColorName:
        snapshotStore?.headsetConnectionStatusColorName ?? foundStore.headsetConnectionStatusColorName ?? null,
      isPreferredPartner: snapshotStore?.isPreferredPartner ?? foundStore.isPreferredPartner ?? false,
      followUpNeeded: snapshotStore?.followUpNeeded ?? foundStore.followUpNeeded ?? null,
      followUpReason: snapshotStore?.followUpReason ?? foundStore.followUpReason ?? null,
    };

    const contactsSnapshot = await deps.readNotionCacheSnapshot<CachedContactRow[]>(deps.contactsSnapshotKey);
    const contacts = deps.normalizeCachedContacts(contactsSnapshot?.payload).filter((contact) =>
      contact.accountPageIds.some((pageId) => deps.normalizePageId(pageId) === deps.normalizePageId(store.notionPageId)),
    );

    contacts.sort((a, b) => a.name.localeCompare(b.name));

    const [checkIns, vendorDays, crm, orderSummary, accountUpdates] = await Promise.all([
      deps.loadStoreCheckIns(store),
      deps.loadStoreVendorDaySummary(store),
      loadStoreCrmFields(store, contacts).catch(() => ({
        contact: contacts.slice(0, 3).map((contact) => contact.name).filter(Boolean).join(', ') || null,
        contactEmail: contacts[0]?.email ?? null,
        contactPhone: contacts[0]?.phone ?? null,
        primaryContactName: contacts[0]?.name ?? null,
        primaryContactBuyer: null,
        primaryContactEmail: contacts[0]?.email ?? null,
        primaryContactPhone: contacts[0]?.phone ?? null,
        rep: store.repNames[0] ?? null,
        accountManager: null,
        piccCreditStatus: null,
        accountStatus: store.status ?? null,
        accountStatusColorName: store.statusColorName ?? null,
        lastOrderAmount: null,
        lastContacted: null,
        lastDeliveryDate: null,
        lastSampleOrderDate: null,
        lastOrderDate: null,
        referralSource: null,
        customerSince: null,
        pennyBundlePromoStatus: null,
        pppStatus: null,
        pppStatusColorName: store.pppStatusColorName ?? null,
        headsetConnectionStatus: null,
        headsetConnectionStatusColorName: store.headsetConnectionStatusColorName ?? null,
        productTracking: null,
        displayTracking: null,
      })),
      loadStoreNabisOrderSummary(store).catch(() => ({
        matchedAccountId: null as string | null,
        matchedBy: 'identifier' as const,
        monthly: [] as Array<{ month: string; orderCount: number; orderTotal: number; revenue: number }>,
        recentOrders: [] as Array<{
          id: string;
          orderNumber: string;
          createdDate: string | null;
          deliveryDate: string | null;
          status: string;
          total: number;
          salesRep: string | null;
          customerName: string | null;
        }>,
        orders: [] as Array<{
          id: string;
          orderNumber: string;
          createdDate: string | null;
          deliveryDate: string | null;
          status: string;
          total: number;
          salesRep: string | null;
          customerName: string | null;
        }>,
        lastOrderDate: null as string | null,
        lastDeliveryDate: null as string | null,
        lastOrderAmount: null as number | null,
      })),
      loadStoreAccountHistory(store).catch(() => [] as Array<{
        id: string;
        createdAt: string;
        type: string;
        title: string;
        description: string | null;
      }>),
    ]);

    return {
      store,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        roleTitle: contact.roleTitle,
        email: contact.email,
        phone: contact.phone,
        status: contact.status,
        linkedWork: contact.linkedWork,
      })),
      checkIns,
      vendorDays,
      crm: {
        ...crm,
        lastOrderAmount: crm.lastOrderAmount ?? orderSummary.lastOrderAmount,
        lastDeliveryDate: crm.lastDeliveryDate ?? orderSummary.lastDeliveryDate,
        lastOrderDate: crm.lastOrderDate ?? orderSummary.lastOrderDate,
      },
      analytics: {
        matchedAccountId: orderSummary.matchedAccountId,
        matchedBy: orderSummary.matchedBy,
        monthly: orderSummary.monthly,
        recentOrders: orderSummary.recentOrders,
        orders: orderSummary.orders,
      },
      history: {
        accountUpdates,
      },
    };
  }

  return {
    loadStoreCrmFields,
    loadStoreNabisOrderSummary,
    loadTerritoryStoreDetail,
  };
}
