import { describe, expect, it } from 'vitest';
import {
  buildCacheCoverage,
  summarizeNabisDashboardAnalytics,
  type AnalyticsOrder,
  type AnalyticsTerritoryStore,
} from '@/lib/dashboard/nabis-analytics';

const orders: AnalyticsOrder[] = [
  {
    id: 'march-ben-first',
    orderNumber: '1001',
    createdDate: '2026-03-04',
    status: 'DELIVERED',
    customerName: 'Albany Wellness',
    total: 100,
    salesRep: 'Ben',
    licensedLocationId: 'NABIS-LOCATION-1',
  },
  {
    id: 'april-ben-reorder',
    orderNumber: '1002',
    createdDate: '2026-04-10',
    status: 'DELIVERED',
    customerName: 'Albany Wellness',
    total: 125,
    salesRep: 'Ben',
    licensedLocationId: 'NABIS-LOCATION-1',
  },
  {
    id: 'april-ben-territory-order-from-other-sales-rep',
    orderNumber: '1002-B',
    createdDate: '2026-04-11',
    status: 'DELIVERED',
    customerName: 'Albany Wellness',
    total: 50,
    salesRep: 'Mario',
    licensedLocationId: 'NABIS-LOCATION-1',
  },
  {
    id: 'april-unmatched-old-sales-rep',
    orderNumber: '1002-C',
    createdDate: '2026-04-15',
    status: 'DELIVERED',
    customerName: 'Legacy Shop',
    total: 75,
    salesRep: 'Kali',
    licensedLocationId: 'LEGACY-LOCATION',
  },
  {
    id: 'april-roxy-new-vmi',
    orderNumber: '1003',
    createdDate: '2026-04-12',
    status: 'DELIVERED',
    customerName: 'Hudson House',
    total: 250,
    salesRep: 'Roxy',
    licensedLocationId: 'NABIS-LOCATION-2',
  },
  {
    id: 'april-canceled',
    orderNumber: '1004',
    createdDate: '2026-04-13',
    status: 'CANCELED',
    customerName: 'Canceled Shop',
    total: 999,
    salesRep: 'Ben',
    licensedLocationId: 'LIC-4',
  },
];

const territoryStores: AnalyticsTerritoryStore[] = [
  {
    id: 'store-1',
    name: 'Albany Wellness',
    statusKey: 'customer',
    repNames: ['Ben'],
    licenseNumber: 'OCM-1',
    isPreferredPartner: false,
  },
  {
    id: 'store-2',
    name: 'Hudson House',
    statusKey: 'customer overdue',
    repNames: ['Roxy'],
    licenseNumber: 'OCM-2',
    isPreferredPartner: true,
  },
  {
    id: 'store-3',
    name: 'Lead With Samples',
    statusKey: 'lead',
    repNames: ['Roxy'],
    licenseNumber: 'LIC-3',
    isPreferredPartner: false,
    lastSampleDeliveryDate: '2026-03-20',
  },
];

describe('Nabis dashboard cached analytics', () => {
  it('summarizes selected-range revenue, monthly trend, and rep/month metrics from cached orders', () => {
    const summary = summarizeNabisDashboardAnalytics({
      orders,
      territoryStores,
      range: { start: '2026-03-01', end: '2026-04-30' },
    });

    expect(summary.totalRevenue).toBe(600);
    expect(summary.totalOrders).toBe(5);
    expect(summary.monthlyTrend).toEqual([
      { monthKey: '2026-03', name: 'Mar 2026', revenue: 100, orderCount: 1 },
      { monthKey: '2026-04', name: 'Apr 2026', revenue: 500, orderCount: 4 },
    ]);
    expect(summary.repStats).toEqual([
      { name: 'Roxy', revenue: 250, orderCount: 1 },
      { name: 'Ben', revenue: 225, orderCount: 2 },
      { name: 'Kali', revenue: 75, orderCount: 1 },
      { name: 'Mario', revenue: 50, orderCount: 1 },
    ]);

    expect(summary.repMonthlyMetrics.filter((row) => row.monthKey === '2026-04').map((row) => row.repName)).toEqual([
      'Ben',
      'Donovan',
      'Eric',
      'Bryce J',
      'Roxy',
      'Matt M',
      'Unassigned',
    ]);

    const benApril = summary.repMonthlyMetrics.find((row) => row.repName === 'Ben' && row.monthKey === '2026-04');
    expect(benApril).toMatchObject({
      salesInTerritory: 175,
      customerStoreCount: 1,
      newStoreCount: 0,
      vmiStoreCount: 0,
      nonVmiStoreCount: 1,
      nonVmiReorderCount: 1,
      reorderPercent: 100,
    });
    expect(summary.repMonthlyMetrics.find((row) => row.repName === 'Mario')).toBeUndefined();
    expect(summary.repMonthlyMetrics.find((row) => row.repName === 'Kali')).toBeUndefined();

    const unassignedApril = summary.repMonthlyMetrics.find((row) => row.repName === 'Unassigned' && row.monthKey === '2026-04');
    expect(unassignedApril).toMatchObject({
      salesInTerritory: 75,
      customerStoreCount: 0,
      nonVmiStoreCount: 0,
      nonVmiReorderCount: 0,
      reorderPercent: null,
    });

    const roxyApril = summary.repMonthlyMetrics.find((row) => row.repName === 'Roxy' && row.monthKey === '2026-04');
    expect(roxyApril).toMatchObject({
      salesInTerritory: 250,
      customerStoreCount: 1,
      newStoreCount: 1,
      vmiStoreCount: 1,
      newVmiStoreCount: 1,
      nonVmiStoreCount: 0,
      nonClosedSampledStoreCount: 1,
    });
    expect(roxyApril?.dataNotes).toContain('VMI counts use current territory status; historical VMI status changes are not cached.');
  });

  it('marks requested ranges before the proven cache start as partial coverage', () => {
    const coverage = buildCacheCoverage({
      requestedRange: { start: '2025-01-01', end: '2026-05-07' },
      earliestOrderCreatedAt: '2025-07-02T22:26:28.786Z',
      latestOrderCreatedAt: '2026-05-07T20:23:36.527Z',
      cachedOrderCount: 1579,
      cachedLineItemCount: 27701,
    });

    expect(coverage.status).toBe('partial-before-cache');
    expect(coverage.fullyCovered).toBe(false);
    expect(coverage.message).toContain('starts before the earliest cached Nabis order');
  });
});
