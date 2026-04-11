'use client';

export type VendorDayAccount = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  licensedLocationId: string | null;
  nabisRetailerId: string | null;
};

export type WorkerProfile = {
  id: string;
  displayName: string;
  employerName: string | null;
};

export type VendorDayArtifact = {
  id: string;
  type: string;
  storageUrl: string;
  originalName: string | null;
  syncStatus: string;
};

export type VendorDayExecution = {
  id: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  pendingArtifactSync: boolean;
  notionArchivePageId?: string | null;
  notionArchiveUrl?: string | null;
  pennyBundleStatus: string | null;
  trafficLevel: string | null;
  budtenderEngagementScore: number | null;
  checkInNotes: string | null;
  checkOutNotes: string | null;
  artifacts: VendorDayArtifact[];
};

export type VendorDayAssignment = {
  id: string;
  requestId: string;
  workerProfileId: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  eventPayAmount: string | number | null;
  travelPayAmount: string | number | null;
  travelMinutesOneWay: number | null;
  travelMilesOneWay: number | null;
  passOffReason: string | null;
  notionArchivePageId?: string | null;
  notionArchiveUrl?: string | null;
  execution?: VendorDayExecution | null;
  request?: {
    account: VendorDayAccount;
    pennyBundleRequested: boolean;
    requestedDurationHours: number;
  };
};

export type VendorDayOffer = {
  id: string;
  workerProfileId: string;
  status: string;
  expiresAt: string;
  rankScore: number;
  rankReason: string | null;
  workerProfile: WorkerProfile;
};

export type VendorDayRequest = {
  id: string;
  accountId: string;
  account: VendorDayAccount;
  source: string;
  status: string;
  requestedStart: string;
  requestedEnd: string;
  alternateStart: string | null;
  requestedDurationHours: number;
  pennyBundleRequested: boolean;
  override60DayWindow: boolean;
  overrideReason: string | null;
  requiresAdminApproval: boolean;
  approvedAt: string | null;
  priorityScore: number;
  notes: string | null;
  notionArchivePageId?: string | null;
  notionArchiveUrl?: string | null;
  offers: VendorDayOffer[];
  assignments: VendorDayAssignment[];
};

export type WorkspacePayload = {
  viewerWorkerProfileId: string | null;
  requests: VendorDayRequest[];
  assignments: VendorDayAssignment[];
  accounts: VendorDayAccount[];
  workers: WorkerProfile[];
};

export type OfflineQueueItem = {
  id: string;
  action: Record<string, unknown>;
};

export type PayrollOverview = {
  currentBatch: {
    id: string;
    startsOn: string;
    endsOn: string;
    status: string;
    lineItems: Array<{
      id: string;
      totalPayAmount: string | number;
      status: string;
      workerProfile: {
        id: string;
        displayName: string;
      };
      assignment: {
        id: string;
        request: {
          account: {
            name: string;
          };
        };
      };
    }>;
  } | null;
  runningBalances: Array<{
    workerProfileId: string;
    _sum: {
      totalPayAmount: string | number | null;
    };
  }>;
  disputedLines: Array<{
    id: string;
    totalPayAmount: string | number;
    disputedReason: string | null;
    workerProfile: {
      displayName: string;
    };
    assignment: {
      request: {
        account: {
          name: string;
        };
      };
    };
  }>;
};

export type VendorDayView = 'today' | 'offers' | 'uploads' | 'pay' | 'history' | 'queue' | 'requests' | 'field';

export type VendorDayProofState = {
  hasCheckInPhoto: boolean;
  hasCheckOutPhoto: boolean;
  hasPosProof: boolean;
  requiresPosProof: boolean;
  pendingArtifactSync: boolean;
};

export const DB_NAME = 'picc-vendor-days';
export const STORE_NAME = 'offline-actions';
export const BA_VIEWS: VendorDayView[] = ['today', 'offers', 'uploads', 'pay', 'history'];
export const OPS_VIEWS: VendorDayView[] = ['queue', 'requests', 'field', 'pay', 'history'];

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatCurrency(value: string | number | null | undefined) {
  if (value == null) return '$0.00';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '$0.00';
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function statusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('completed') || normalized.includes('checked_out') || normalized.includes('paid')) return 'success' as const;
  if (normalized.includes('exception') || normalized.includes('disputed') || normalized.includes('no_show') || normalized.includes('cancelled')) {
    return 'danger' as const;
  }
  if (normalized.includes('offer') || normalized.includes('approval') || normalized.includes('pending') || normalized.includes('open')) {
    return 'warning' as const;
  }
  return 'secondary' as const;
}

export function readableStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export function isHistoryAssignment(assignment: VendorDayAssignment) {
  return ['COMPLETED', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'PASSED_OFF'].includes(assignment.status);
}

export function isActiveAssignment(assignment: VendorDayAssignment) {
  return ['ASSIGNED', 'CHECKED_IN', 'EXCEPTION', 'DISPUTED'].includes(assignment.status);
}

export function requiredArtifactState(assignment: VendorDayAssignment): VendorDayProofState {
  const artifacts = assignment.execution?.artifacts ?? [];
  const hasCheckInPhoto = artifacts.some((artifact) => artifact.type === 'CHECK_IN_PHOTO');
  const hasCheckOutPhoto = artifacts.some((artifact) => artifact.type === 'CHECK_OUT_PHOTO');
  const hasPosProof = artifacts.some((artifact) => artifact.type === 'POS_REPORT' || artifact.type === 'SCREENSHOT');
  const requiresPosProof = Boolean(assignment.request?.pennyBundleRequested);
  return {
    hasCheckInPhoto,
    hasCheckOutPhoto,
    hasPosProof,
    requiresPosProof,
    pendingArtifactSync: Boolean(assignment.execution?.pendingArtifactSync),
  };
}

export function viewOptionsForRole(role: string) {
  if (role === 'BRAND_AMBASSADOR') {
    return [
      { value: 'today', label: 'Today' },
      { value: 'offers', label: 'Offers' },
      { value: 'uploads', label: 'Uploads' },
      { value: 'pay', label: 'Pay' },
      { value: 'history', label: 'History' },
    ];
  }

  return [
    { value: 'queue', label: 'Queue' },
    { value: 'requests', label: 'Requests' },
    { value: 'field', label: 'Field' },
    { value: 'pay', label: 'Pay' },
    { value: 'history', label: 'History' },
  ];
}

export function normalizeView(role: string, requested: string | null | undefined): VendorDayView {
  const allowed = role === 'BRAND_AMBASSADOR' ? BA_VIEWS : OPS_VIEWS;
  if (requested && allowed.includes(requested as VendorDayView)) {
    return requested as VendorDayView;
  }
  return role === 'BRAND_AMBASSADOR' ? 'today' : 'queue';
}
