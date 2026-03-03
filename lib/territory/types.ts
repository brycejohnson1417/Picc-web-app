export type RouteMode = 'car' | 'bike' | 'transit';

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
  locationSource: 'notion-place' | 'nominatim-cache' | 'nominatim-live';
  lastEditedTime: string;
  licenseNumber?: string | null;
  city?: string | null;
  state?: string | null;
  daysOverdue?: number | null;
  phoneNumber?: string | null;
  email?: string | null;
  followUpDate?: string | null;
  notes?: string | null;
  lastCheckIn?: string | null;
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
  };
  meta: {
    dataSource: 'notion-live-cache' | 'notion-live-cache-stale';
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
  estimationModel?: 'osrm' | 'transit-heuristic';
  modeLabel?: string;
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
