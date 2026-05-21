import type { CacheCoverage, NabisDashboardAnalytics } from '@/lib/dashboard/nabis-analytics';

export interface NabisDashboardMetadata {
  fetchedAt: string;
  dataSource: 'local-postgres';
  manualRefresh?: {
    status: 'background-started';
    startedAt: string;
  } | null;
  range: {
    startCreatedAt: string;
    endCreatedAt: string;
  };
  uniqueOrders: number;
  canceledOrders: number;
  internalTransferOrders: number;
  lineItems: number;
  totalCount: number;
  totalPages: number;
  pagesScanned: number;
  partialScan: boolean;
  cacheHit: boolean;
  lastOrderSyncAt: string | null;
  lastRetailerSyncAt: string | null;
  lastReconciliationAt: string | null;
  syncLagSeconds: number | null;
  staleWarning: string | null;
  cacheCoverage: CacheCoverage;
  territorySnapshot: {
    syncedAt: string | null;
    recordsRead: number;
    available: boolean;
  };
}

export interface SerializedNabisOrder {
  id: string;
  orderNumber: string;
  createdDate: string;
  status: string;
  customerName: string;
  total: number;
  salesRep: string;
  monthKey: string;
  isCanceled: boolean;
  licensedLocationId: string | null;
  matchedAccountId: string | null;
  matchedAccountName: string | null;
}

export interface ProcessedNabisOrder extends Omit<SerializedNabisOrder, 'createdDate'> {
  createdDate: Date;
}

export interface NabisDashboardResponse {
  orders: SerializedNabisOrder[];
  metadata: NabisDashboardMetadata;
  analytics: NabisDashboardAnalytics;
}

export interface DashboardDateRange {
  start: string;
  end: string;
}

export interface RepStat {
  name: string;
  revenue: number;
  orderCount: number;
}
