// Rep Copilot MCP: tool implementations. Pure assembly over injected
// providers; the production providers live in sources.ts and the Distru
// boundary in distru.ts. Nothing here calls an external API inline.

import type { DistruBoundary } from './distru';
import {
  applyAttackListWindow,
  areaMatches,
  buildActionPlan,
  missingSkus,
  monthsQuiet,
  rankAttackCandidates,
} from './rules';
import {
  DISPLAY_CATALOG,
  PRODUCT_CATALOG,
  applyArOwnership,
  effectiveHeadsetConnected,
  isPaymentRequired,
  normalizeName,
  type AttackFilters,
  type MonthlyOrder,
  type OpenInvoice,
  type RankedStore,
  type SourceStamp,
  type StoreFacts,
} from './types';

export interface RepCopilotProviders {
  listStores: () => Promise<StoreFacts[]>;
  enrichStore?: (facts: StoreFacts) => Promise<Partial<StoreFacts>>;
  getMonthlyHistory: (facts: StoreFacts) => Promise<MonthlyOrder[]>;
  geocode: (origin: string) => Promise<{ lat: number; lng: number; label: string } | null>;
  distru: DistruBoundary;
  now: () => Date;
  writesEnabled: () => boolean;
}

export interface StoreReport {
  store: { name: string; address: string | null; neighborhood: string | null; primary_contact_name: string | null };
  credit_status: string | null;
  nabis_rating: string | null;
  days_overdue: number | null;
  payment_average_days: number | null;
  orders_paid: number | null;
  payment_required: boolean;
  open_invoices: OpenInvoice[];
  ppp: { enrolled: boolean; type: string | null };
  headset_connected: boolean | null;
  last_order: { date: string | null; amount: number | null };
  last_sample: { date: string | null };
  last_vmi_check: { date: string; status: string } | null;
  carries_count: number;
  catalog_count: number;
  carries_all: boolean;
  missing_skus: string[];
  displays: { present: string[]; missing: string[] };
  why_stopped: string | null;
  marketplace_orders: { count: number; latest_date: string | null } | null;
  action_plan: ReturnType<typeof buildActionPlan>;
  sources: SourceStamp[];
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function directionsUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({ api: '1', origin, destination });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function createRepCopilotService(providers: RepCopilotProviders) {
  const nowIso = () => providers.now().toISOString();

  async function resolveStores(storeQuery: string): Promise<StoreFacts[]> {
    const stores = await providers.listStores();
    const query = normalizeName(storeQuery);
    if (!query) return [];
    const exact = stores.filter((store) => normalizeName(store.name) === query);
    if (exact.length > 0) return exact;
    return stores.filter((store) => normalizeName(store.name).includes(query) || query.includes(normalizeName(store.name)));
  }

  async function buildReport(rawFacts: StoreFacts): Promise<StoreReport> {
    // AR (Credit Status tab, Nabis Master Sheet) wins credit status,
    // payment-required, and days overdue over SYNC. Conflicts are logged,
    // never blocking (PRD section 4 rule, refined by the 2026-11-18 merge).
    if (rawFacts.arCreditStatus != null && rawFacts.syncCreditStatus != null && rawFacts.arCreditStatus !== rawFacts.syncCreditStatus) {
      console.debug(
        `[rep-copilot] credit status conflict for ${rawFacts.name}: AR "${rawFacts.arCreditStatus}" wins over SYNC "${rawFacts.syncCreditStatus}"`,
      );
    }
    if (rawFacts.arDaysOverdue != null && rawFacts.syncDaysOverdue != null && rawFacts.arDaysOverdue !== rawFacts.syncDaysOverdue) {
      console.debug(
        `[rep-copilot] days overdue conflict for ${rawFacts.name}: AR ${rawFacts.arDaysOverdue}d wins over SYNC ${rawFacts.syncDaysOverdue}d`,
      );
    }
    const facts = applyArOwnership(rawFacts);
    const now = providers.now();
    const sources: SourceStamp[] = [
      {
        field_group: 'store identity, contact, PPP, account status',
        source_system: 'Notion CRM (Dispensary Master List) via app territory data',
        as_of: nowIso(),
      },
    ];
    if (facts.syncAsOf) {
      sources.push({
        field_group: 'credit, payment, orders, carries, displays',
        source_system: 'Sales NY SYNC (Notion)',
        as_of: facts.syncAsOf,
      });
    }
    if (facts.whyStopped) {
      sources.push({
        field_group: 'why stopped',
        source_system: 'CRM Follow Up Reason (Proposal Tracker Quick Notes / Store Notes upstream)',
        as_of: nowIso(),
      });
    }
    if (facts.headsetConnectedSheet != null) {
      sources.push({
        field_group: 'headset status',
        source_system: 'NY Headset Connections (Notion)',
        as_of: nowIso(),
      });
    }
    if (facts.arCreditStatus != null || facts.arPaymentRequired != null || facts.arDaysOverdue != null) {
      sources.push({
        field_group: 'credit status, payment-required, days overdue',
        source_system: 'AR — Credit Status tab (Nabis Master Sheet)',
        as_of: nowIso(),
      });
    }

    // Catalog: Distru wins live inventory/catalog when it answers; the SYNC
    // product columns are the fallback catalog (PRD field ownership).
    let catalog = PRODUCT_CATALOG;
    const distruCatalog = await providers.distru.getCatalog().catch(() => null);
    if (distruCatalog && distruCatalog.data.length > 0) {
      const distruNames = new Set(distruCatalog.data.map((item) => normalizeName(item.name)));
      const matched = PRODUCT_CATALOG.filter((line) =>
        [...distruNames].some((name) => name.includes(normalizeName(line)) || normalizeName(line).includes(name)),
      );
      if (matched.length > 0) catalog = matched;
      sources.push({ field_group: 'live catalog', source_system: 'Distru', as_of: distruCatalog.asOf });
    }
    const missing = missingSkus(facts, catalog);
    const carriesCount = catalog.length - missing.length;

    // Open invoices: AR owns the payment-required determination and the
    // overdue aggregates, but the Credit Status tab is per-store and names
    // no invoices. Named open invoices come from Distru when the account is
    // payment-required; otherwise the list stays empty rather than invented.
    let openInvoices: OpenInvoice[] = [];
    if (isPaymentRequired(facts)) {
      const distruInvoices = await providers.distru
        .getOpenInvoices({ distruCompanyId: facts.distruCompanyId, storeName: facts.name })
        .catch(() => null);
      if (distruInvoices && distruInvoices.data.length > 0) {
        openInvoices = distruInvoices.data.map((inv) => ({ ...inv, source_note: 'Distru' }));
        sources.push({ field_group: 'open invoices', source_system: 'Distru', as_of: distruInvoices.asOf });
      }
    }

    let marketplaceOrders: StoreReport['marketplace_orders'] = null;
    const marketplace = await providers.distru
      .getMarketplaceOrders({ distruCompanyId: facts.distruCompanyId, storeName: facts.name })
      .catch(() => null);
    if (marketplace) {
      marketplaceOrders = { count: marketplace.data.count, latest_date: marketplace.data.latestDate };
      if (marketplace.data.count > 0) {
        sources.push({ field_group: 'marketplace orders', source_system: 'Distru Commerce', as_of: marketplace.asOf });
      }
    }

    const planFacts: StoreFacts = { ...facts, arOpenInvoices: openInvoices.length > 0 ? openInvoices : facts.arOpenInvoices };

    return {
      store: {
        name: facts.name,
        address: facts.address,
        neighborhood: facts.neighborhood,
        primary_contact_name: facts.primaryContactName,
      },
      credit_status: facts.creditStatus,
      nabis_rating: facts.nabisRating,
      days_overdue: facts.daysOverdue,
      payment_average_days: facts.paymentAverageDays,
      orders_paid: facts.ordersPaid,
      payment_required: isPaymentRequired(planFacts),
      open_invoices: openInvoices,
      ppp: { enrolled: facts.pppEnrolled, type: facts.pppType },
      headset_connected: effectiveHeadsetConnected(facts),
      last_order: { date: facts.lastOrderDate, amount: facts.lastOrderAmount },
      last_sample: { date: facts.lastSampleDate },
      last_vmi_check: null,
      carries_count: carriesCount,
      catalog_count: catalog.length,
      carries_all: missing.length === 0,
      missing_skus: missing,
      displays: {
        present: facts.displaysPresent.length > 0 ? facts.displaysPresent : [],
        missing: facts.displaysMissing.length > 0 ? facts.displaysMissing : DISPLAY_CATALOG.filter((d) => !facts.displaysPresent.includes(d)),
      },
      why_stopped: facts.whyStopped,
      marketplace_orders: marketplaceOrders,
      action_plan: buildActionPlan(planFacts, now),
      sources,
    };
  }

  async function storeReport(input: { store_query: string }) {
    const matches = await resolveStores(input.store_query);
    if (matches.length === 0) {
      return { found: false as const, error: `No store matched "${input.store_query}"`, matches: [] as string[] };
    }
    if (matches.length > 1) {
      return {
        found: false as const,
        error: `More than one store matched "${input.store_query}"; ask the rep to pick one`,
        matches: matches.map((store) => store.name),
      };
    }
    let facts = matches[0];
    if (providers.enrichStore) {
      const enrichment = await providers.enrichStore(facts).catch(() => null);
      if (enrichment) facts = { ...facts, ...enrichment };
    }
    return { found: true as const, report: await buildReport(facts) };
  }

  async function attackList(input: {
    area: string;
    limit?: number;
    offset?: number;
    filters?: AttackFilters;
  }) {
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;
    const filters = input.filters ?? {};
    const stores = (await providers.listStores())
      .map((store) => applyArOwnership(store))
      .filter((store) => areaMatches(store, input.area));
    const ranked = rankAttackCandidates(stores, filters, providers.now());
    const windowed = applyAttackListWindow(ranked, {
      limit,
      offset,
      includeDifficult: filters.includeDifficult ?? false,
    });
    return {
      area: input.area,
      limit,
      offset,
      total_ranked: filters.includeDifficult ? ranked.length : ranked.filter((s) => !s.doNotTarget).length,
      stores: windowed.map((entry) => {
        const rankedStore: RankedStore = { ...entry };
        delete rankedStore.score;
        return rankedStore;
      }),
      sources: [
        { field_group: 'ranking inputs', source_system: 'Sales NY SYNC + Notion CRM via app territory data', as_of: nowIso() },
      ] as SourceStamp[],
    };
  }

  async function routeTop10(input: { origin: string; area?: string; limit?: number }) {
    const limit = input.limit ?? 10;
    const list = await attackList({ area: input.area ?? '', limit, offset: 0, filters: {} });
    const stores = await providers.listStores();
    const byId = new Map(stores.map((store) => [store.storeId, store]));

    let originPoint: { lat: number; lng: number } | null = null;
    const latLngMatch = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(input.origin);
    if (latLngMatch) {
      originPoint = { lat: Number(latLngMatch[1]), lng: Number(latLngMatch[2]) };
    } else {
      originPoint = await providers.geocode(input.origin).catch(() => null);
    }

    const candidates = list.stores
      .map((ranked) => ({ ranked, facts: byId.get(ranked.storeId) }))
      .filter((entry): entry is { ranked: (typeof list.stores)[number]; facts: StoreFacts } => entry.facts != null);

    const withCoords = candidates.filter((entry) => entry.facts.lat != null && entry.facts.lng != null);
    const withoutCoords = candidates.filter((entry) => entry.facts.lat == null || entry.facts.lng == null);

    const ordered: typeof candidates = [];
    if (originPoint && withCoords.length > 0) {
      const remaining = [...withCoords];
      let current = originPoint;
      while (remaining.length > 0) {
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        remaining.forEach((entry, index) => {
          const distance = haversineKm(current, { lat: entry.facts.lat as number, lng: entry.facts.lng as number });
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        });
        const [next] = remaining.splice(bestIndex, 1);
        ordered.push(next);
        current = { lat: next.facts.lat as number, lng: next.facts.lng as number };
      }
    } else {
      ordered.push(...withCoords);
    }
    ordered.push(...withoutCoords);

    let previousLabel = input.origin;
    const stops = ordered.map((entry, index) => {
      const destination = entry.facts.address ?? entry.facts.name;
      const stop = {
        stop: index + 1,
        store: entry.ranked.name,
        address: entry.facts.address,
        neighborhood: entry.ranked.neighborhood,
        rank_reason: entry.ranked.rankReason,
        leg: { from: previousLabel, to: destination },
        directions_url: directionsUrl(previousLabel, destination),
      };
      previousLabel = destination;
      return stop;
    });

    return {
      origin: input.origin,
      area: input.area ?? null,
      stops,
      sources: list.sources,
    };
  }

  async function orderHistory(input: { store_query: string; months?: number }) {
    const matches = await resolveStores(input.store_query);
    if (matches.length !== 1) {
      return {
        found: false as const,
        error:
          matches.length === 0
            ? `No store matched "${input.store_query}"`
            : `More than one store matched "${input.store_query}"; ask the rep to pick one`,
        matches: matches.map((store) => store.name),
      };
    }
    const facts = matches[0];
    const months = input.months ?? 12;
    const history = (await providers.getMonthlyHistory(facts)).slice(-months);
    const totalOrders = history.reduce((sum, month) => sum + month.orderCount, 0);
    const totalRevenue = history.reduce((sum, month) => sum + month.orderTotal, 0);
    const quiet = monthsQuiet(facts, providers.now());
    const segment = computeRfmSegment({ monthsQuiet: quiet, totalOrders, totalRevenue });
    return {
      found: true as const,
      store: facts.name,
      months: history.map((month) => ({ month: month.month, order_count: month.orderCount, order_total: month.orderTotal })),
      rfm: segment,
      sources: [
        { field_group: 'order history', source_system: 'Nabis (cached in app)', as_of: nowIso() },
      ] as SourceStamp[],
    };
  }

  function computeRfmSegment(input: { monthsQuiet: number | null; totalOrders: number; totalRevenue: number }) {
    const { monthsQuiet: quiet, totalOrders, totalRevenue } = input;
    let segment = 'steady';
    if (totalOrders === 0) segment = 'never ordered';
    else if (quiet != null && quiet >= 4) segment = 'dormant';
    else if (quiet != null && quiet <= 1 && totalOrders >= 6) segment = 'champion';
    else if (quiet != null && quiet <= 2 && totalOrders >= 3) segment = 'loyal';
    else if (quiet != null && quiet >= 2 && totalOrders >= 3) segment = 'at risk';
    else if (totalOrders <= 2 && (quiet == null || quiet <= 2)) segment = 'new';
    return {
      segment,
      basis: {
        months_since_last_order: quiet,
        orders_in_window: totalOrders,
        revenue_in_window: totalRevenue,
      },
      source_note: 'Segment computed server-side from Nabis monthly order history (recency, frequency, monetary).',
    };
  }

  async function createCheckin(input: { store_query: string; note: string }) {
    if (!providers.writesEnabled()) {
      return {
        created: false as const,
        error:
          'create_checkin is disabled in v1 (MCP_ENABLE_WRITES is not true). Check-ins stay in the app until Phase 2 is approved.',
        store_query: input.store_query,
        note_received: Boolean(input.note),
      };
    }
    // Phase 2: the write path is intentionally not implemented in v1 even if
    // the flag is flipped; enabling it requires its own approval-lane PR.
    return {
      created: false as const,
      error: 'create_checkin write path is not implemented in v1.',
      store_query: input.store_query,
      note_received: Boolean(input.note),
    };
  }

  return { storeReport, attackList, routeTop10, orderHistory, createCheckin, buildReport };
}
