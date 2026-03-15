export type RouteMode = 'car' | 'bike' | 'transit';

export type TerritoryBoundaryCoordinates = [number, number][];

export interface TerritoryBoundary {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  isVisibleByDefault: boolean;
  coordinates: TerritoryBoundaryCoordinates;
  createdByEmail?: string | null;
  updatedByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TerritoryStorePin {
  id: string;
  notionPageId: string;
  name: string;
  status: string;
  statusKey: string;
  statusColor: string;
  pinKind: 'lead' | 'customer' | 'other';
  repNames: string[];
  repEmails: string[];
  lat: number;
  lng: number;
  locationLabel: string | null;
  locationAddress: string | null;
  locationSource:
    | 'notion-place'
    | 'google-address-cache'
    | 'google-address-live'
    | 'google-city-cache'
    | 'google-city-live'
    | 'synthetic'
    | 'unavailable';
  locationPrecision: 'exact' | 'address' | 'city' | 'synthetic' | 'unavailable';
  isApproximate: boolean;
  lastEditedTime: string;
  licenseNumber?: string | null;
  city?: string | null;
  state?: string | null;
  daysOverdue?: number | null;
  phoneNumber?: string | null;
  email?: string | null;
  followUpDate?: string | null;
  followUpNeeded?: boolean | null;
  followUpReason?: string | null;
  notes?: string | null;
  lastCheckIn?: string | null;
  geometry?: {
    type: 'Point';
    coordinates: [number, number];
  };
  metrics?: {
    interactionsScore: number;
    purchasesScore: number;
    followUpUrgencyScore: number;
  };
}

export interface TerritoryStoreContact {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
  status: 'ACTIVE' | 'INACTIVE';
  linkedWork: string;
}

export interface TerritoryStoreDetailResponse {
  store: TerritoryStorePin;
  contacts: TerritoryStoreContact[];
  checkIns: TerritoryStoreCheckIn[];
  vendorDays: TerritoryVendorDaySummary;
  crm: {
    contact: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    primaryContactName: string | null;
    primaryContactBuyer: string | null;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    rep: string | null;
    accountManager: string | null;
    piccCreditStatus: string | null;
    accountStatus: string | null;
    lastOrderAmount: number | null;
    lastContacted: string | null;
    lastDeliveryDate: string | null;
    lastSampleOrderDate: string | null;
    lastOrderDate: string | null;
    referralSource: string | null;
    customerSince: string | null;
    pennyBundlePromoStatus: string | null;
    pppStatus: string | null;
    headsetConnectionStatus: string | null;
    productTracking: string | null;
    displayTracking: string | null;
  };
  analytics: {
    monthly: Array<{
      month: string;
      orderCount: number;
      orderTotal: number;
      revenue: number;
    }>;
  };
}

export interface TerritoryStoreCheckIn {
  id: string;
  source: 'notion-comment' | 'local-check-in';
  happenedAt: string;
  mode: 'written' | 'voice' | 'unknown';
  notePreview: string | null;
  url?: string | null;
  createdByLabel?: string | null;
  createdByEmail?: string | null;
}

export interface TerritoryVendorDaySummary {
  total: number;
  upcomingCount: number;
  recent: Array<{
    id: string;
    eventDate: string;
    status: string;
    repName: string | null;
    ambassadorName: string | null;
    notes: string | null;
  }>;
}

export interface TerritoryFilterCount {
  value: string;
  count: number;
}

export interface TerritoryStoresResponse {
  stores: TerritoryStorePin[];
  filters: {
    statuses: TerritoryFilterCount[];
    reps: TerritoryFilterCount[];
    locationAvailability: TerritoryFilterCount[];
  };
  meta: {
    dataSource: 'notion-live-cache' | 'notion-live-cache-stale';
    sourceEngine?: 'postgis';
    lastEditedMax: string | null;
    recordsRead: number;
    unresolvedLocationCount: number;
    geocodedThisRequest: number;
    syncedAt: string | null;
    stale: boolean;
    syncing: boolean;
    syncError: string | null;
  };
}

export interface TerritoryBoundaryListResponse {
  boundaries: TerritoryBoundary[];
}

export interface TerritoryRouteStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface TerritoryOptimizedLeg {
  fromStopId: string;
  toStopId: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface TerritoryOptimizedRouteResponse {
  mode: RouteMode;
  orderedStopIds: string[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  legs: TerritoryOptimizedLeg[];
  estimationModel?: 'google-routes' | 'transit-heuristic' | 'fallback-order';
  modeLabel?: string;
  warning?: string;
  capExceeded?: boolean;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  'open inbound': '#ec4899',
  'lead - hot': '#f97316',
  'lead - warm': '#eab308',
  'lead - cold': '#3b82f6',
  'send proposal': '#8b5cf6',
  'in progress': '#64748b',
  'bad customer': '#ef4444',
  'customer overdue': '#b91c1c',
  customer: '#16a34a',
};

export function normalizeStatus(value: string | null | undefined) {
  if (!value) return 'unknown';
  return value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function colorForStatus(value: string | null | undefined) {
  return STATUS_COLORS[normalizeStatus(value)] ?? '#0f172a';
}

export function pinKindForStatus(value: string | null | undefined): TerritoryStorePin['pinKind'] {
  const key = normalizeStatus(value);
  if (key.includes('customer')) {
    return 'customer';
  }
  if (key.includes('lead') || key === 'open inbound' || key === 'send proposal' || key === 'in progress') {
    return 'lead';
  }
  return 'other';
}
