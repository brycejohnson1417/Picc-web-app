// Rep Copilot MCP: production providers. This is the only module in the
// rep-copilot layer that touches the app's existing systems:
//   - territory read model (app Postgres) for the store list and pins
//   - the existing territory store-detail service for CRM fields and the
//     Nabis monthly order history (no second Nabis integration)
//   - the Sales NY boundary (sales-ny.ts) for SYNC / Headset Connections /
//     AR (Credit Status tab) facts
//   - the existing Google geocode boundary for route origins
//   - Prisma account tags for the Do Not Target (difficult account) flag

import { prisma } from '@/lib/db/prisma';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { geocodeAddress } from '../google-geocode';
import { loadTerritoryStoreDetail } from '../notion-territory';
import { loadTerritoryStoresFromReadModel } from '../territory-read-model';
import { loadSalesNyData, lookupByKeys, normalizeStoreKey, type SalesNyData } from './sales-ny';
import type { RepCopilotProviders } from './service';
import { DISPLAY_CATALOG, type MonthlyOrder, type StoreFacts } from './types';

const PPP_ENROLLED_VALUES = ['Approved & Connected', 'Self-Managed Inventory PPP', 'Self-Reporting Inventory PPP'];

export function parsePpp(pppStatus: string | null | undefined): { enrolled: boolean; type: string | null } {
  const value = (pppStatus ?? '').trim();
  if (!value) return { enrolled: false, type: null };
  if (PPP_ENROLLED_VALUES.includes(value)) return { enrolled: true, type: value };
  if (/self-managed/i.test(value)) return { enrolled: true, type: 'Self-Managed' };
  if (/self-reporting/i.test(value)) return { enrolled: true, type: 'Self-Reporting' };
  if (/approved|connected|enrolled|active/i.test(value)) return { enrolled: true, type: value };
  return { enrolled: false, type: null };
}

export function parseHeadsetCrm(status: string | null | undefined): boolean | null {
  const value = (status ?? '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('not on headset') || value.includes('not connected') || value === 'no') return false;
  if (value.includes('connected') || value === 'yes') return true;
  return null;
}

function storeKeys(pin: TerritoryStorePin, licenseNumber: string | null): Array<string | null> {
  return [
    pin.notionPageId ? `page:${pin.notionPageId.replace(/-/g, '')}` : null,
    licenseNumber ? `license:${licenseNumber.trim()}` : null,
    `name:${normalizeStoreKey(pin.name)}`,
  ];
}

function pinToFacts(
  pin: TerritoryStorePin,
  salesNy: SalesNyData,
  doNotTargetPageIds: Set<string>,
): StoreFacts {
  const keys = storeKeys(pin, pin.licenseNumber ?? null);
  const sync = lookupByKeys(salesNy.syncByKey, keys);
  const headsetSheet = lookupByKeys(salesNy.headsetByKey, keys);
  const ar = lookupByKeys(salesNy.arByKey, keys);
  const ppp = parsePpp(pin.pppStatus);

  const carries = sync?.carries ?? [];
  const displaysPresent = sync?.displaysPresent ?? [];

  return {
    storeId: pin.id,
    notionPageId: pin.notionPageId ?? null,
    name: pin.name,
    address: pin.locationAddress ?? pin.locationLabel ?? null,
    city: pin.city ?? null,
    state: pin.state ?? null,
    zipcode: (pin.locationAddress ?? '').match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null,
    neighborhood: null,
    lat: pin.lat ?? null,
    lng: pin.lng ?? null,
    primaryContactName: null,
    accountStatus: pin.status ?? null,
    pinKind: pin.pinKind,
    pppEnrolled: ppp.enrolled,
    pppType: ppp.type,
    headsetConnectedCrm: parseHeadsetCrm(pin.headsetConnectionStatus),
    mediaKitSent: null,
    followUpDate: pin.followUpDate ?? null,
    lastCheckIn: pin.lastCheckIn ?? null,
    interactionsScore: pin.metrics?.interactionsScore ?? null,
    creditStatus: sync?.creditStatus ?? null,
    nabisRating: sync?.nabisRating ?? null,
    daysOverdue: sync?.daysOverdue ?? pin.daysOverdue ?? null,
    paymentAverageDays: sync?.paymentAverageDays ?? null,
    ordersPaid: sync?.ordersPaid ?? null,
    totalOrders: sync?.totalOrders ?? null,
    lastOrderDate: sync?.lastOrderDate ?? pin.lastOrderDate ?? null,
    lastOrderAmount: sync?.lastOrderAmount ?? null,
    lastSampleDate: sync?.lastSampleDate ?? pin.lastSampleDeliveryDate ?? null,
    firstOrderDate: sync?.firstOrderDate ?? null,
    carries,
    displaysPresent,
    displaysMissing:
      sync?.displaysMissing ?? DISPLAY_CATALOG.filter((display) => !displaysPresent.includes(display)),
    syncAsOf: sync?.asOf ?? null,
    whyStopped: pin.followUpReason ?? null,
    headsetConnectedSheet: headsetSheet,
    arCreditStatus: ar?.creditStatus ?? null,
    arPaymentRequired: ar?.paymentRequired ?? null,
    arDaysOverdue: ar?.daysOverdue ?? null,
    arUnpaidOrders: ar?.unpaidOrders ?? null,
    arOverdueOrders: ar?.overdueOrders ?? null,
    arAmountPaid: ar?.amountPaid ?? null,
    arOpenInvoices: null,
    syncCreditStatus: sync?.creditStatus ?? null,
    syncDaysOverdue: sync?.daysOverdue ?? null,
    distruCompanyId: sync?.distruCompanyId ?? null,
    doNotTarget: pin.notionPageId ? doNotTargetPageIds.has(pin.notionPageId.replace(/-/g, '')) : false,
  };
}

async function loadDoNotTargetPageIds(): Promise<Set<string>> {
  try {
    const accounts = await prisma.account.findMany({
      where: { accountTags: { some: { tag: { name: 'Do Not Target' } } } },
      select: { notionPageId: true },
    });
    return new Set(
      accounts
        .map((account: { notionPageId: string | null }) => account.notionPageId?.replace(/-/g, ''))
        .filter((value: string | undefined): value is string => Boolean(value)),
    );
  } catch (error) {
    console.debug('[rep-copilot] Do Not Target tag lookup failed', error);
    return new Set();
  }
}

let cachedStores: { expiresAt: number; stores: StoreFacts[] } | null = null;
const STORES_CACHE_TTL_MS = 5 * 60 * 1000;

async function listStores(): Promise<StoreFacts[]> {
  if (cachedStores && cachedStores.expiresAt > Date.now()) return cachedStores.stores;
  const [pinsResult, salesNy, doNotTargetPageIds] = await Promise.all([
    loadTerritoryStoresFromReadModel({}),
    loadSalesNyData(),
    loadDoNotTargetPageIds(),
  ]);
  const stores = pinsResult.stores.map((pin: TerritoryStorePin) => pinToFacts(pin, salesNy, doNotTargetPageIds));
  cachedStores = { expiresAt: Date.now() + STORES_CACHE_TTL_MS, stores };
  return stores;
}

async function enrichStore(facts: StoreFacts): Promise<Partial<StoreFacts>> {
  const detail = await loadTerritoryStoreDetail(facts.storeId);
  if (!detail) return {};
  const ppp = parsePpp(detail.crm.pppStatus ?? undefined);
  return {
    primaryContactName:
      detail.crm.primaryContactName ?? detail.crm.primaryContactBuyer ?? detail.crm.contact ?? facts.primaryContactName,
    accountStatus: detail.crm.accountStatus ?? facts.accountStatus,
    pppEnrolled: ppp.enrolled || facts.pppEnrolled,
    pppType: ppp.type ?? facts.pppType,
    headsetConnectedCrm: parseHeadsetCrm(detail.crm.headsetConnectionStatus) ?? facts.headsetConnectedCrm,
    lastOrderAmount: detail.crm.lastOrderAmount ?? facts.lastOrderAmount,
    lastOrderDate: detail.crm.lastOrderDate ?? facts.lastOrderDate,
    lastSampleDate: detail.crm.lastSampleOrderDate ?? facts.lastSampleDate,
  };
}

async function getMonthlyHistory(facts: StoreFacts): Promise<MonthlyOrder[]> {
  const detail = await loadTerritoryStoreDetail(facts.storeId);
  if (!detail) return [];
  return (detail.analytics?.monthly ?? []).map((month) => ({
    month: month.month,
    orderCount: month.orderCount,
    orderTotal: month.orderTotal,
  }));
}

export function createProductionProviders(deps: {
  distru: RepCopilotProviders['distru'];
  now: () => Date;
}): RepCopilotProviders {
  return {
    listStores,
    enrichStore,
    getMonthlyHistory,
    geocode: async (origin: string) => {
      const result = await geocodeAddress({ address: origin });
      return { lat: result.lat, lng: result.lng, label: result.formattedAddress };
    },
    distru: deps.distru,
    now: deps.now,
    writesEnabled: () => process.env.MCP_ENABLE_WRITES === 'true',
  };
}
