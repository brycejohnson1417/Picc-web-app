// Rep Copilot MCP: acceptance and rules tests (PRD section 6).
// All external boundaries are mocked; no real keys, Notion, or database.

import { describe, expect, it, vi } from 'vitest';
import type { DistruBoundary } from './distru';
import { buildActionPlan, rankAttackCandidates } from './rules';
import { parseArPage, parseHeadsetPage, parseSyncPage } from './sales-ny';
import { createRepCopilotService, type RepCopilotProviders } from './service';
import { DISPLAY_CATALOG, type StoreFacts } from './types';

const NOW = new Date('2026-11-18T12:00:00Z');

function makeFacts(overrides: Partial<StoreFacts> = {}): StoreFacts {
  return {
    storeId: 'store-1',
    notionPageId: null,
    name: 'Test Store',
    address: '1 Test Ave, New York, NY 10001',
    city: 'New York',
    state: 'NY',
    zipcode: '10001',
    neighborhood: 'Midtown',
    lat: 40.75,
    lng: -73.98,
    primaryContactName: null,
    accountStatus: 'Customer',
    pinKind: 'customer',
    pppEnrolled: false,
    pppType: null,
    headsetConnectedCrm: null,
    mediaKitSent: null,
    followUpDate: null,
    lastCheckIn: null,
    interactionsScore: null,
    creditStatus: null,
    nabisRating: null,
    daysOverdue: null,
    paymentAverageDays: null,
    ordersPaid: null,
    totalOrders: null,
    lastOrderDate: null,
    lastOrderAmount: null,
    lastSampleDate: null,
    firstOrderDate: null,
    carries: [],
    displaysPresent: [],
    displaysMissing: [...DISPLAY_CATALOG],
    syncAsOf: '2026-11-18T00:00:00Z',
    whyStopped: null,
    headsetConnectedSheet: null,
    arCreditStatus: null,
    arPaymentRequired: null,
    arDaysOverdue: null,
    arUnpaidOrders: null,
    arOverdueOrders: null,
    arAmountPaid: null,
    arOpenInvoices: null,
    syncCreditStatus: null,
    syncDaysOverdue: null,
    distruCompanyId: null,
    doNotTarget: false,
    ...overrides,
  };
}

// The Daily Green fixture, verified against Notion CRM and SYNC on
// 2026-11-18 (PRD section 6).
function dailyGreenFacts(): StoreFacts {
  return makeFacts({
    storeId: 'daily-green',
    name: 'The Daily Green',
    address: '719 7th Ave, New York, NY 10036',
    zipcode: '10036',
    neighborhood: 'Times Square',
    primaryContactName: 'Kayleigh',
    pppEnrolled: true,
    pppType: 'Self-Managed',
    headsetConnectedCrm: false,
    creditStatus: 'Send/Good',
    nabisRating: 'Good',
    daysOverdue: 0,
    paymentAverageDays: 3,
    ordersPaid: 18,
    totalOrders: 16,
    lastOrderDate: '2026-10-29',
    lastOrderAmount: 5825,
    lastSampleDate: '2026-10-29',
    carries: ['SMACK 1G', 'SMACK 0.5G', 'CHAMPS 1G', 'Sushi 1G', 'Ichi-Roll 1G', '#Juan 1G'],
    displaysPresent: [
      'SMACK Display',
      'CHAMPS Display',
      'Sushi Hash Display',
      'SoM Display',
      'LED Screen',
      'Neon Sign',
      'Ichi/Juan Display',
    ],
    displaysMissing: ['Chopsticks Display', 'Oh Yeah (O-Yeah) Display'],
    distruCompanyId: '00000000-0000-0000-0000-00000010076e',
  });
}

const nullDistru: DistruBoundary = {
  isConfigured: () => false,
  getCatalog: async () => null,
  getOpenInvoices: async () => null,
  getMarketplaceOrders: async () => null,
};

function makeService(stores: StoreFacts[], overrides: Partial<RepCopilotProviders> = {}) {
  return createRepCopilotService({
    listStores: async () => stores,
    getMonthlyHistory: async () => [],
    geocode: async () => ({ lat: 40.7046, lng: -73.9766, label: 'Waterside Plaza, New York, NY' }),
    distru: nullDistru,
    now: () => NOW,
    writesEnabled: () => false,
    ...overrides,
  });
}

describe('store_report: The Daily Green fixture (PRD section 6)', () => {
  it('matches the verified CRM and SYNC values', async () => {
    const service = makeService([dailyGreenFacts()]);
    const result = await service.storeReport({ store_query: 'The Daily Green' });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('expected a report');
    const report = result.report;

    expect(report.store.name).toBe('The Daily Green');
    expect(report.store.address).toBe('719 7th Ave, New York, NY 10036');
    expect(report.store.primary_contact_name).toBe('Kayleigh');
    expect(report.credit_status).toBe('Send/Good');
    expect(report.nabis_rating).toBe('Good');
    expect(report.days_overdue).toBe(0);
    expect(report.payment_average_days).toBe(3);
    expect(report.orders_paid).toBe(18);
    expect(report.last_order).toEqual({ date: '2026-10-29', amount: 5825 });
    expect(report.last_sample).toEqual({ date: '2026-10-29' });
    expect(report.payment_required).toBe(false);
    expect(report.open_invoices).toEqual([]);
    expect(report.headset_connected).toBe(false);
    expect(report.ppp).toEqual({ enrolled: true, type: 'Self-Managed' });
    expect(report.last_vmi_check).toBeNull();
  });

  it('lists only the missing SKUs and displays', async () => {
    const service = makeService([dailyGreenFacts()]);
    const result = await service.storeReport({ store_query: 'Daily Green' });
    if (!result.found) throw new Error('expected a report');
    const report = result.report;

    expect(report.carries_count).toBe(6);
    expect(report.carries_all).toBe(false);
    for (const expected of ['Nom Nom', 'Oh Yeah (O-Yeah) 1G', 'State of Mind (SoM) 1G', 'Chopsticks', 'Sushi 5pk', 'Ichi-Roll 4pk', '#Juan 4pk']) {
      expect(report.missing_skus).toContain(expected);
    }
    for (const carried of ['SMACK 1G', 'CHAMPS 1G', 'Sushi 1G']) {
      expect(report.missing_skus).not.toContain(carried);
    }
    expect(report.displays.missing).toEqual(expect.arrayContaining(['Chopsticks Display', 'Oh Yeah (O-Yeah) Display']));
    expect(report.displays.present).toEqual(
      expect.arrayContaining(['SMACK Display', 'CHAMPS Display', 'Sushi Hash Display']),
    );
  });

  it('builds the action plan in Travis order without leading with payment', async () => {
    const service = makeService([dailyGreenFacts()]);
    const result = await service.storeReport({ store_query: 'Daily Green' });
    if (!result.found) throw new Error('expected a report');
    const plan = result.report.action_plan;

    expect(plan[0].action).not.toMatch(/payment/i);
    const joined = plan.map((item) => `${item.action} ${item.detail}`).join('\n');
    expect(joined).toMatch(/25 percent|25%/);
    expect(joined).toMatch(/Oh Yeah/);
    expect(joined).toMatch(/State of Mind/);
    expect(joined).toMatch(/Headset/);
    const priorities = plan.map((item) => item.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it('returns a disambiguation list when the query matches several stores', async () => {
    const service = makeService([
      dailyGreenFacts(),
      makeFacts({ storeId: 'dg2', name: 'The Daily Green Uptown' }),
    ]);
    const result = await service.storeReport({ store_query: 'Daily Green' });
    expect(result.found).toBe(false);
    if (result.found) throw new Error('expected disambiguation');
    expect(result.matches).toEqual(expect.arrayContaining(['The Daily Green', 'The Daily Green Uptown']));
  });
});

describe('store_report: payment-required store (AR wins over SYNC)', () => {
  it('leads with payment, applies AR ownership, and names Distru invoices', async () => {
    const facts = makeFacts({
      name: 'Harbor Wellness',
      // SYNC is stale here; AR (Credit Status tab) is authoritative.
      creditStatus: 'Send/Good',
      syncCreditStatus: 'Send/Good',
      syncDaysOverdue: 0,
      daysOverdue: 0,
      arCreditStatus: 'Payment Required',
      arPaymentRequired: true,
      arDaysOverdue: 45,
      arOverdueOrders: 2,
      arUnpaidOrders: 3,
      totalOrders: 9,
      lastOrderDate: '2026-08-20',
    });
    const distruWithInvoices: DistruBoundary = {
      isConfigured: () => true,
      getCatalog: async () => null,
      getOpenInvoices: async () => ({
        data: [
          { invoice_number: 'INV-1042', amount: 1240, days_overdue: 45 },
          { invoice_number: 'INV-1077', amount: 860, days_overdue: 30 },
        ],
        asOf: '2026-11-18T15:00:00Z',
        transport: 'mcp' as const,
      }),
      getMarketplaceOrders: async () => null,
    };
    const service = makeService([facts], { distru: distruWithInvoices });
    const result = await service.storeReport({ store_query: 'Harbor Wellness' });
    if (!result.found) throw new Error('expected a report');
    expect(result.report.payment_required).toBe(true);
    expect(result.report.credit_status).toBe('Payment Required');
    expect(result.report.days_overdue).toBe(45);
    expect(result.report.open_invoices.map((inv) => inv.invoice_number)).toEqual(['INV-1042', 'INV-1077']);
    expect(result.report.action_plan[0].action).toMatch(/payment/i);
    expect(result.report.action_plan[0].detail).toContain('INV-1042');
    expect(result.report.sources.map((stamp) => stamp.source_system)).toContain(
      'AR — Credit Status tab (Nabis Master Sheet)',
    );
  });

  it('uses the Follow Up Reason in the reorder action', () => {
    const plan = buildActionPlan(
      makeFacts({
        totalOrders: 5,
        lastOrderDate: '2026-06-01',
        creditStatus: 'Send/Good',
        whyStopped: 'Buyer left; new buyer prefers another brand',
        carries: ['SMACK 1G'],
      }),
      NOW,
    );
    const reorder = plan.find((item) => /find out why/i.test(item.action));
    expect(reorder?.detail).toContain('Buyer left');
  });
});

describe('attack_list ranking (PRD section 6)', () => {
  function manhattanStores(): StoreFacts[] {
    const base = { city: 'New York', neighborhood: 'Manhattan' };
    return [
      makeFacts({ ...base, storeId: 'conbud', name: 'Conbud LES', zipcode: '10002', totalOrders: 4, lastOrderDate: '2025-08-18', lastOrderAmount: 6475, creditStatus: 'Good' }),
      makeFacts({ ...base, storeId: 'torches', name: 'Torches', zipcode: '10017', totalOrders: 3, lastOrderDate: '2025-10-18', creditStatus: 'Good' }),
      makeFacts({ ...base, storeId: 'genius', name: 'Green Genius NYC', zipcode: '10010', totalOrders: 2, lastOrderDate: '2025-10-18', creditStatus: 'Good' }),
      makeFacts({ ...base, storeId: 'elevation', name: 'Elevation HQ', zipcode: '10018', totalOrders: 1, lastOrderDate: '2025-07-18', creditStatus: 'Good' }),
      makeFacts({ ...base, storeId: 'alchemy', name: 'The Alchemy Chelsea', zipcode: '10001', totalOrders: 1, lastOrderDate: '2025-10-18', creditStatus: 'Good' }),
      makeFacts({ ...base, storeId: 'cannadreams', name: 'CannaDreams NYC', zipcode: '10019', totalOrders: 1, lastOrderDate: '2025-07-18', lastOrderAmount: 10000, creditStatus: 'COD' }),
      makeFacts({ ...base, storeId: 'newamsterdam', name: 'New Amsterdam', zipcode: '10014', totalOrders: 2, lastOrderDate: '2025-09-18', creditStatus: 'COD' }),
      // Difficult account (Do Not Target): a real dispensary chain that is
      // difficult to work, excluded from the default list by flag, not by
      // any data problem.
      makeFacts({ ...base, storeId: 'travel', name: 'The Travel Agency 5th Avenue', zipcode: '10022', totalOrders: 6, lastOrderDate: '2025-06-18', creditStatus: 'Good', doNotTarget: true }),
    ];
  }

  it('ranks dormant good-credit accounts above COD accounts', async () => {
    const service = makeService(manhattanStores());
    const result = await service.attackList({ area: 'Manhattan', limit: 10 });
    const names = result.stores.map((store) => store.name);
    const goodFive = ['Conbud LES', 'Torches', 'Green Genius NYC', 'Elevation HQ', 'The Alchemy Chelsea'];
    expect(new Set(names.slice(0, 5))).toEqual(new Set(goodFive));
    expect(names.indexOf('CannaDreams NYC')).toBeGreaterThan(4);
    expect(names.indexOf('New Amsterdam')).toBeGreaterThan(4);
    for (const store of result.stores) {
      expect(store.rankReason.length).toBeGreaterThan(0);
    }
  });

  it('excludes the difficult account (Do Not Target) from the default top 10', async () => {
    const service = makeService(manhattanStores());
    const result = await service.attackList({ area: 'Manhattan', limit: 10 });
    expect(result.stores.map((store) => store.name)).not.toContain('The Travel Agency 5th Avenue');
  });

  it('includes the difficult account last when include_difficult is true', () => {
    const ranked = rankAttackCandidates(manhattanStores(), { includeDifficult: true }, NOW);
    const visible = ranked.filter((store) => store.name === 'The Travel Agency 5th Avenue');
    expect(visible).toHaveLength(1);
    expect(ranked[ranked.length - 1].name).toBe('The Travel Agency 5th Avenue');
    expect(ranked[ranked.length - 1].rankReason).toMatch(/difficult account/i);
  });

  it('applies the sampled-not-closed filter', async () => {
    const stores = [
      makeFacts({ storeId: 's1', name: 'Sampled Never Closed', neighborhood: 'Manhattan', zipcode: '10003', lastSampleDate: '2026-10-20', totalOrders: 0 }),
      makeFacts({ storeId: 's2', name: 'Sampled And Closed', neighborhood: 'Manhattan', zipcode: '10003', lastSampleDate: '2026-10-20', totalOrders: 3, lastOrderDate: '2026-11-01' }),
    ];
    const service = makeService(stores);
    const result = await service.attackList({ area: 'Manhattan', filters: { sampledNotClosed: true } });
    expect(result.stores.map((store) => store.name)).toEqual(['Sampled Never Closed']);
  });
});

describe('route_top10 (PRD section 6)', () => {
  it('returns ordered stops with a directions URL on every stop', async () => {
    const stores: StoreFacts[] = [];
    for (let i = 0; i < 12; i += 1) {
      stores.push(
        makeFacts({
          storeId: `r${i}`,
          name: `Route Store ${i + 1}`,
          address: `${100 + i} Broadway, New York, NY 1000${i % 10}`,
          zipcode: '10005',
          neighborhood: 'Manhattan',
          lat: 40.71 + i * 0.01,
          lng: -74.0 + i * 0.005,
          totalOrders: 3,
          lastOrderDate: '2025-08-01',
          creditStatus: 'Good',
        }),
      );
    }
    const service = makeService(stores);
    const result = await service.routeTop10({ origin: 'Waterside Plaza, Kips Bay', area: 'Manhattan', limit: 10 });
    expect(result.stops).toHaveLength(10);
    for (const stop of result.stops) {
      expect(stop.directions_url).toContain('https://www.google.com/maps/dir/');
      expect(stop.address).toBeTruthy();
    }
    expect(result.stops[0].leg.from).toContain('Waterside Plaza');
    expect(result.stops.map((stop) => stop.stop)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('order_history and create_checkin', () => {
  it('returns monthly history and a dormant RFM segment for a quiet store', async () => {
    const service = makeService([dailyGreenFacts()], {
      getMonthlyHistory: async () => [
        { month: '2026-06', orderCount: 2, orderTotal: 4000 },
        { month: '2026-07', orderCount: 1, orderTotal: 2100 },
      ],
    });
    const quietFacts = { ...dailyGreenFacts(), lastOrderDate: '2026-07-15' };
    const quietService = makeService([quietFacts], {
      getMonthlyHistory: async () => [
        { month: '2026-06', orderCount: 2, orderTotal: 4000 },
        { month: '2026-07', orderCount: 1, orderTotal: 2100 },
      ],
    });
    void service;
    const result = await quietService.orderHistory({ store_query: 'Daily Green', months: 12 });
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('expected history');
    expect(result.months).toHaveLength(2);
    expect(result.rfm.segment).toBe('dormant');
  });

  it('create_checkin is hard-disabled in v1', async () => {
    const service = makeService([dailyGreenFacts()]);
    const result = await service.createCheckin({ store_query: 'Daily Green', note: 'Visited' });
    expect(result.created).toBe(false);
    expect(result.error).toMatch(/disabled/i);
  });
});

describe('Sales NY boundary parsers', () => {
  it('parses a SYNC page with the observed Sales NY schema', () => {
    const page = {
      id: '413a86d9-9998-8169-9308-da3fbbf4d761',
      last_edited_time: '2026-11-18T00:00:00.000Z',
      properties: {
        'Dispensary Name': { type: 'title', title: [{ plain_text: 'The Daily Green Times Square' }] },
        'Credit Status': { type: 'select', select: { name: 'Send/Good' } },
        'Nabis Credit Rating': { type: 'select', select: { name: 'Good' } },
        'Days Overdue 1': { type: 'number', number: 0 },
        'Days Overdue 2': { type: 'number', number: 0 },
        'Days Overdue 3': { type: 'number', number: 0 },
        'Payment Average': { type: 'number', number: 3 },
        'Orders Paid': { type: 'number', number: 18 },
        'Total Orders': { type: 'number', number: 16 },
        'Last Order Amount': { type: 'number', number: 5825 },
        'Last Order Delivered': { type: 'date', date: { start: '2026-10-29' } },
        'Last Sample Delivered': { type: 'date', date: { start: '2026-10-29' } },
        'SMACK\n1G': { type: 'date', date: { start: '2026-09-01' } },
        'SMACK\n0.5 G': { type: 'date', date: { start: '2026-09-01' } },
        'Champs\n1G': { type: 'date', date: { start: '2026-09-15' } },
        'Sushi\n1G': { type: 'date', date: { start: '2026-10-01' } },
        'Ichi-Roll\n1G': { type: 'date', date: { start: '2026-10-01' } },
        '#Juan\n1G': { type: 'date', date: { start: '2026-10-01' } },
        'SMACK Display': { type: 'date', date: { start: '2026-09-01' } },
        'Champs  Display': { type: 'date', date: { start: '2026-09-01' } },
        'Sushi Hash Display': { type: 'date', date: { start: '2026-09-01' } },
        'Distru Company ID': { type: 'rich_text', rich_text: [{ plain_text: '00000000-0000-0000-0000-00000010076e' }] },
      },
    };
    const { facts, keys } = parseSyncPage(page as never);
    expect(facts.creditStatus).toBe('Send/Good');
    expect(facts.nabisRating).toBe('Good');
    expect(facts.daysOverdue).toBe(0);
    expect(facts.paymentAverageDays).toBe(3);
    expect(facts.ordersPaid).toBe(18);
    expect(facts.lastOrderAmount).toBe(5825);
    expect(facts.carries).toEqual(
      expect.arrayContaining(['SMACK 1G', 'SMACK 0.5G', 'CHAMPS 1G', 'Sushi 1G', 'Ichi-Roll 1G', '#Juan 1G']),
    );
    expect(facts.displaysMissing).toEqual(expect.arrayContaining(['Chopsticks Display', 'Oh Yeah (O-Yeah) Display']));
    expect(keys).toContain('distru:00000000-0000-0000-0000-00000010076e');
  });

  it('parses Headset and AR (Credit Status tab) pages; AR models no balance', () => {
    const headset = parseHeadsetPage({
      id: 'h1',
      properties: {
        'Dispensary Name': { type: 'title', title: [{ plain_text: 'Harbor Wellness' }] },
        'Headset Connection': { type: 'select', select: { name: 'Connected' } },
      },
    } as never);
    expect(headset?.connected).toBe(true);

    const ar = parseArPage({
      id: 'a1',
      properties: {
        'Dispensary Name': { type: 'title', title: [{ plain_text: 'Harbor Wellness' }] },
        'Credit Status': { type: 'rich_text', rich_text: [{ plain_text: 'Payment Required' }] },
        'Payment Required Rule': { type: 'checkbox', checkbox: true },
        'Days Overdue': { type: 'number', number: 45 },
        'Unpaid Orders': { type: 'number', number: 3 },
        'Overdue Orders': { type: 'number', number: 2 },
        'Amount Paid': { type: 'number', number: 500 },
      },
    } as never);
    expect(ar?.facts).toEqual({
      creditStatus: 'Payment Required',
      paymentRequired: true,
      daysOverdue: 45,
      unpaidOrders: 3,
      overdueOrders: 2,
      amountPaid: 500,
    });
    // The Credit Status tab has no balance-due column; none is modeled.
    expect(ar?.facts).not.toHaveProperty('balance');
  });
});

describe('provider wiring', () => {
  it('does not call Distru for a store in good standing beyond the catalog', async () => {
    const getOpenInvoices = vi.fn(async () => null);
    const distru: DistruBoundary = { ...nullDistru, getOpenInvoices };
    const service = makeService([dailyGreenFacts()], { distru });
    await service.storeReport({ store_query: 'Daily Green' });
    expect(getOpenInvoices).not.toHaveBeenCalled();
  });
});
