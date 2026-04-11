export interface NabisDashboardMetadata {
  fetchedAt: string;
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
