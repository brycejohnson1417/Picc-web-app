import 'server-only';

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
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  people?: Array<{ name?: string; person?: { email?: string | null } | null }>;
  date?: { start?: string | null; end?: string | null } | null;
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

type NotionPageResponse = {
  properties?: Record<string, NotionPropertyValue>;
};

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

function readTextFromAnyProperty(property: NotionPropertyValue | undefined) {
  if (!property) return '';

  const title = (property.title ?? []).map((item) => item?.plain_text ?? '').join('').trim();
  if (title) return title;

  const richText = (property.rich_text ?? []).map((item) => item?.plain_text ?? '').join('').trim();
  if (richText) return richText;

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
  if (typeof property.number === 'number') return String(property.number);
  if (typeof property.checkbox === 'boolean') return property.checkbox ? 'Yes' : 'No';

  return '';
}

function toIsoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function createTerritoryStoreDetailService(deps: TerritoryStoreDetailServiceDeps) {
  async function loadStoreCrmFields(store: TerritoryStorePin, contacts: CachedContactRow[]) {
    const page = await deps.notionRequest<NotionPageResponse>(`/pages/${store.notionPageId}`);
    const properties = page.properties ?? {};
    const firstContact = contacts[0];

    const contactText = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Contact']));
    const contactEmail = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Contact Email', 'Email']));
    const contactPhone = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Contact Phone', 'Phone']));
    const primaryContactName = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact Name', 'Primary Contact']));
    const primaryContactBuyer = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact / Buyer', 'Primary Contact Buyer', 'Buyer']));
    const primaryContactEmail = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact Email', 'Buyer Email', 'Contact Email']));
    const primaryContactPhone = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Primary Contact Phone', 'Buyer Phone', 'Contact Phone']));
    const rep = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Rep', 'PICC Rep', 'Sales Rep']));
    const accountManager = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Account Manager', 'Manager']));
    const piccCreditStatus = readTextFromAnyProperty(propertyValueByCandidates(properties, ['PICC Credit Status', 'Credit Status']));
    const accountStatus = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Account Status']));
    const lastOrderAmount = readNumberProperty(propertyValueByCandidates(properties, ['Last Order Amount', 'Latest Order Amount', 'Order Amount']));
    const lastContacted = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Last Contacted', 'Last Contact Date']));
    const lastDeliveryDate = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Last Delivery Date', 'Most Recent Delivery Date']));
    const lastSampleOrderDate = readTextFromAnyProperty(
      propertyValueByCandidates(properties, ['Last Sample Order Date', 'Sample Order Date', 'Last Sample Date']),
    );
    const lastOrderDate = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Last Order Date', 'Most Recent Order Date']));
    const referralSource = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Referral Source', 'Lead Source', 'Source']));
    const customerSince = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Customer Since', 'Customer Since Date', 'Start Date']));
    const pennyBundlePromoStatus = readTextFromAnyProperty(
      propertyValueByCandidates(properties, ['Penny Bundle Promo Status', 'Penny Bundle Status', 'Penny Bundle']),
    );
    const pppStatus = readTextFromAnyProperty(propertyValueByCandidates(properties, ['PPP Status']));
    const headsetConnectionStatus = readTextFromAnyProperty(propertyValueByCandidates(properties, ['Headset Connection Status', 'Headset Status']));
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
      lastOrderAmount,
      lastContacted: toIsoDate(lastContacted) ?? null,
      lastDeliveryDate: toIsoDate(lastDeliveryDate) ?? null,
      lastSampleOrderDate: toIsoDate(lastSampleOrderDate) ?? null,
      lastOrderDate: toIsoDate(lastOrderDate) ?? null,
      referralSource: referralSource || null,
      customerSince: toIsoDate(customerSince) ?? customerSince ?? null,
      pennyBundlePromoStatus: pennyBundlePromoStatus || null,
      pppStatus: pppStatus || null,
      headsetConnectionStatus: headsetConnectionStatus || null,
      productTracking: productTracking || null,
      displayTracking: displayTracking || null,
    };
  }

  async function loadStoreMonthlyAnalytics(store: TerritoryStorePin) {
    const orFilters: Array<{ licensedLocationId?: string; licensedLocationName?: string }> = [];
    if (store.licenseNumber?.trim()) {
      orFilters.push({ licensedLocationId: store.licenseNumber.trim() });
    }
    orFilters.push({ licensedLocationName: store.name });

    const rows = await prisma.nabisOrder.findMany({
      where: {
        OR: orFilters,
      },
      select: {
        deliveryDate: true,
        createdAt: true,
        orderTotal: true,
      },
      orderBy: {
        deliveryDate: 'asc',
      },
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
      const date = row.deliveryDate ?? row.createdAt;
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

    return [...buckets.values()];
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
      followUpNeeded: snapshotStore?.followUpNeeded ?? foundStore.followUpNeeded ?? null,
      followUpReason: snapshotStore?.followUpReason ?? foundStore.followUpReason ?? null,
    };

    const contactsSnapshot = await deps.readNotionCacheSnapshot<CachedContactRow[]>(deps.contactsSnapshotKey);
    const contacts = deps.normalizeCachedContacts(contactsSnapshot?.payload).filter((contact) =>
      contact.accountPageIds.some((pageId) => deps.normalizePageId(pageId) === deps.normalizePageId(store.notionPageId)),
    );

    contacts.sort((a, b) => a.name.localeCompare(b.name));

    const [checkIns, vendorDays, crm, analytics] = await Promise.all([
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
        lastOrderAmount: null,
        lastContacted: null,
        lastDeliveryDate: null,
        lastSampleOrderDate: null,
        lastOrderDate: null,
        referralSource: null,
        customerSince: null,
        pennyBundlePromoStatus: null,
        pppStatus: null,
        headsetConnectionStatus: null,
        productTracking: null,
        displayTracking: null,
      })),
      loadStoreMonthlyAnalytics(store).then((monthly) => ({ monthly })).catch(() => ({
        monthly: [] as Array<{ month: string; orderCount: number; orderTotal: number; revenue: number }>,
      })),
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
      crm,
      analytics,
    };
  }

  return {
    loadStoreCrmFields,
    loadStoreMonthlyAnalytics,
    loadTerritoryStoreDetail,
  };
}
