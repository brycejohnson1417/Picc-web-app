'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';

type VendorDayAccount = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  licensedLocationId: string | null;
  nabisRetailerId: string | null;
};

type WorkerProfile = {
  id: string;
  displayName: string;
  employerName: string | null;
};

type VendorDayArtifact = {
  id: string;
  type: string;
  storageUrl: string;
  originalName: string | null;
  syncStatus: string;
};

type VendorDayExecution = {
  id: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  pendingArtifactSync: boolean;
  pennyBundleStatus: string | null;
  trafficLevel: string | null;
  budtenderEngagementScore: number | null;
  checkInNotes: string | null;
  checkOutNotes: string | null;
  artifacts: VendorDayArtifact[];
};

type VendorDayAssignment = {
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
  execution?: VendorDayExecution | null;
  request?: {
    account: VendorDayAccount;
    pennyBundleRequested: boolean;
    requestedDurationHours: number;
  };
};

type VendorDayOffer = {
  id: string;
  workerProfileId: string;
  status: string;
  expiresAt: string;
  rankScore: number;
  rankReason: string | null;
  workerProfile: WorkerProfile;
};

type VendorDayRequest = {
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
  offers: VendorDayOffer[];
  assignments: VendorDayAssignment[];
};

type WorkspacePayload = {
  viewerWorkerProfileId: string | null;
  requests: VendorDayRequest[];
  assignments: VendorDayAssignment[];
  accounts: VendorDayAccount[];
  workers: WorkerProfile[];
};

type OfflineQueueItem = {
  id: string;
  action: Record<string, unknown>;
};

type PayrollOverview = {
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

type VendorDayView = 'today' | 'offers' | 'uploads' | 'pay' | 'history' | 'queue' | 'requests' | 'field';

const DB_NAME = 'picc-vendor-days';
const STORE_NAME = 'offline-actions';
const BA_VIEWS: VendorDayView[] = ['today', 'offers', 'uploads', 'pay', 'history'];
const OPS_VIEWS: VendorDayView[] = ['queue', 'requests', 'field', 'pay', 'history'];

async function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function queueOfflineAction(item: OfflineQueueItem) {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to queue offline action'));
  });
  db.close();
}

async function readOfflineActions() {
  const db = await openQueueDb();
  const rows = await new Promise<OfflineQueueItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as OfflineQueueItem[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('Failed to read offline actions'));
  });
  db.close();
  return rows;
}

async function deleteOfflineAction(id: string) {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete offline action'));
  });
  db.close();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCurrency(value: string | number | null | undefined) {
  if (value == null) return '$0.00';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '$0.00';
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function statusVariant(status: string) {
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

function readableStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function isHistoryAssignment(assignment: VendorDayAssignment) {
  return ['COMPLETED', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'PASSED_OFF'].includes(assignment.status);
}

function isActiveAssignment(assignment: VendorDayAssignment) {
  return ['ASSIGNED', 'CHECKED_IN', 'EXCEPTION', 'DISPUTED'].includes(assignment.status);
}

function requiredArtifactState(assignment: VendorDayAssignment) {
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

function viewOptionsForRole(role: string) {
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

function normalizeView(role: string, requested: string | null | undefined): VendorDayView {
  const allowed = role === 'BRAND_AMBASSADOR' ? BA_VIEWS : OPS_VIEWS;
  if (requested && allowed.includes(requested as VendorDayView)) {
    return requested as VendorDayView;
  }
  return role === 'BRAND_AMBASSADOR' ? 'today' : 'queue';
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function getLocationSnapshot() {
  if (!navigator.geolocation) {
    return { locationUnavailable: true };
  }

  return new Promise<{
    geoLat?: number;
    geoLng?: number;
    accuracyMeters?: number;
    locationUnavailable?: boolean;
  }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          geoLat: position.coords.latitude,
          geoLng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      () => resolve({ locationUnavailable: true }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function SectionEmpty({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#d8deea] bg-[#f8fafc] p-6 text-sm text-[#5d6672]">
      <p className="font-semibold text-[#17202c]">{title}</p>
      <p className="mt-2 leading-6">{body}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warm';
}) {
  return (
    <Card className={tone === 'warm' ? 'border-[#eadfd8] bg-[#fffaf6]' : 'border-[#dce3eb] bg-white/95'}>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8593]">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-[#18212d]">{value}</p>
      </CardContent>
    </Card>
  );
}

export function VendorDayWorkspace({ initialView }: { initialView?: string }) {
  const access = useAppAccess();
  const pathname = usePathname();
  const router = useRouter();
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [payroll, setPayroll] = useState<PayrollOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [requestedStart, setRequestedStart] = useState('');
  const [alternateStart, setAlternateStart] = useState('');
  const [requestedDurationHours, setRequestedDurationHours] = useState('3');
  const [pennyBundleRequested, setPennyBundleRequested] = useState(true);
  const [preferredWorkerProfileId, setPreferredWorkerProfileId] = useState('');
  const [override60DayWindow, setOverride60DayWindow] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [notes, setNotes] = useState('');
  const [passOffReasonById, setPassOffReasonById] = useState<Record<string, string>>({});
  const [checkInNotesById, setCheckInNotesById] = useState<Record<string, string>>({});
  const [checkOutNotesById, setCheckOutNotesById] = useState<Record<string, string>>({});
  const [pennyBundleStatusById, setPennyBundleStatusById] = useState<Record<string, string>>({});
  const [trafficById, setTrafficById] = useState<Record<string, string>>({});
  const [engagementById, setEngagementById] = useState<Record<string, string>>({});
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<VendorDayView>(() => normalizeView(access.role, initialView));
  const [didInitializeDefaultView, setDidInitializeDefaultView] = useState(false);

  const canCreateRequests = access.role !== 'GUEST_VIEWER' && access.role !== 'FINANCE';
  const canDispatch = ['ADMIN', 'OPS_TEAM', 'SALES_REP'].includes(access.role);
  const canApproveDuration = access.role === 'ADMIN';
  const isBrandAmbassador = access.role === 'BRAND_AMBASSADOR';

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/vendor-days', { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error ?? 'Failed to load vendor-day workspace');
    }
    setPayload(json);
    setLoading(false);
  }, []);

  const loadPayroll = useCallback(async () => {
    if (!['ADMIN', 'OPS_TEAM', 'FINANCE', 'BRAND_AMBASSADOR'].includes(access.role)) {
      return;
    }
    setPayrollLoading(true);
    try {
      const response = await fetch('/api/payroll', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? 'Failed to load pay data');
      }
      setPayroll(json);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load pay data');
    } finally {
      setPayrollLoading(false);
    }
  }, [access.role]);

  const flushOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) {
      return;
    }
    const actions = await readOfflineActions();
    setOfflineCount(actions.length);
    for (const item of actions) {
      const response = await fetch('/api/vendor-days', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.action),
      });
      if (response.ok) {
        await deleteOfflineAction(item.id);
      }
    }
    const remaining = await readOfflineActions();
    setOfflineCount(remaining.length);
  }, []);

  useEffect(() => {
    void loadWorkspace().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Failed to load vendor-day workspace');
      setLoading(false);
    });
    void readOfflineActions().then((actions) => setOfflineCount(actions.length));
    setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const onOnline = () => {
      setIsOnline(true);
      void flushOfflineQueue().then(() => void loadWorkspace());
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushOfflineQueue, loadWorkspace]);

  useEffect(() => {
    if (activeView === 'pay') {
      void loadPayroll();
    }
  }, [activeView, loadPayroll]);

  useEffect(() => {
    setActiveView(normalizeView(access.role, initialView));
    setDidInitializeDefaultView(false);
  }, [access.role, initialView]);

  const requests = useMemo(() => payload?.requests ?? [], [payload?.requests]);
  const assignments = useMemo(() => payload?.assignments ?? [], [payload?.assignments]);

  const openOffers = useMemo(() => {
    if (!payload?.viewerWorkerProfileId) return [];
    return requests.flatMap((request) =>
      request.offers
        .filter((offer) => offer.workerProfileId === payload.viewerWorkerProfileId && offer.status === 'OPEN')
        .map((offer) => ({ request, offer })),
    );
  }, [payload?.viewerWorkerProfileId, requests]);

  const liveAssignments = useMemo(() => assignments.filter((assignment) => isActiveAssignment(assignment)), [assignments]);
  const todayAssignments = useMemo(() => assignments.filter((assignment) => !isHistoryAssignment(assignment)).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)), [assignments]);
  const historyAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => isHistoryAssignment(assignment))
        .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart)),
    [assignments],
  );

  useEffect(() => {
    if (didInitializeDefaultView) return;
    const defaultView = isBrandAmbassador ? (openOffers.length > 0 ? 'offers' : 'today') : 'queue';
    setActiveView(normalizeView(access.role, initialView ?? defaultView));
    setDidInitializeDefaultView(true);
  }, [access.role, didInitializeDefaultView, initialView, isBrandAmbassador, openOffers.length]);

  useEffect(() => {
    if (assignments.length === 0) {
      setSelectedAssignmentId(null);
      return;
    }
    const existing = assignments.find((assignment) => assignment.id === selectedAssignmentId);
    if (existing) return;
    const nextSelection = todayAssignments[0]?.id ?? historyAssignments[0]?.id ?? assignments[0]?.id ?? null;
    setSelectedAssignmentId(nextSelection);
  }, [assignments, historyAssignments, selectedAssignmentId, todayAssignments]);

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? todayAssignments[0] ?? historyAssignments[0] ?? null,
    [assignments, historyAssignments, selectedAssignmentId, todayAssignments],
  );

  const payTotal = useMemo(() => {
    return assignments.reduce((sum, assignment) => {
      const eventPay = Number(assignment.eventPayAmount ?? 0);
      const travelPay = Number(assignment.travelPayAmount ?? 0);
      return sum + eventPay + travelPay;
    }, 0);
  }, [assignments]);

  const currentWorkerBalance = useMemo(() => {
    if (!payload?.viewerWorkerProfileId || !payroll) return payTotal;
    const balance = payroll.runningBalances.find((item) => item.workerProfileId === payload.viewerWorkerProfileId)?._sum.totalPayAmount;
    return balance == null ? payTotal : Number(balance);
  }, [payload?.viewerWorkerProfileId, payroll, payTotal]);

  const fieldExceptions = useMemo(
    () => requests.filter((request) => ['EXCEPTION', 'NO_SHOW', 'DISPUTED', 'PASSED_OFF'].includes(request.status)),
    [requests],
  );

  const handleViewChange = useCallback(
    (nextView: string) => {
      const normalized = normalizeView(access.role, nextView);
      setActiveView(normalized);
      router.replace(`${pathname}?view=${normalized}`, { scroll: false });
    },
    [access.role, pathname, router],
  );

  async function invokePatch(action: Record<string, unknown>, allowOffline = false) {
    if (allowOffline && !navigator.onLine) {
      await queueOfflineAction({ id: crypto.randomUUID(), action });
      const queued = await readOfflineActions();
      setOfflineCount(queued.length);
      setMessage('Saved offline. This action will sync automatically when connectivity returns.');
      return;
    }

    const response = await fetch('/api/vendor-days', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error ?? 'Action failed');
    }
    await loadWorkspace();
    if (activeView === 'pay') {
      await loadPayroll();
    }
  }

  async function handleCreateRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedAccountId || !requestedStart) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/vendor-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          requestedStart: new Date(requestedStart).toISOString(),
          alternateStart: alternateStart ? new Date(alternateStart).toISOString() : null,
          requestedDurationHours: Number(requestedDurationHours),
          pennyBundleRequested,
          preferredWorkerProfileId: preferredWorkerProfileId || null,
          override60DayWindow,
          overrideReason: override60DayWindow ? overrideReason : null,
          notes,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? 'Failed to create vendor-day request');
      }
      setSelectedAccountId('');
      setRequestedStart('');
      setAlternateStart('');
      setRequestedDurationHours('3');
      setPennyBundleRequested(true);
      setPreferredWorkerProfileId('');
      setOverride60DayWindow(false);
      setOverrideReason('');
      setNotes('');
      setMessage('Vendor-day request created.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create vendor-day request');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArtifactUpload(assignmentId: string, files: FileList | null, type: 'CHECK_IN_PHOTO' | 'CHECK_OUT_PHOTO' | 'POS_REPORT') {
    if (!files?.length) return;
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        await invokePatch(
          {
            action: 'add_artifact',
            assignmentId,
            type,
            storageUrl: dataUrl,
            originalName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            syncStatus: navigator.onLine ? 'synced' : 'queued',
          },
          true,
        );
      }
      setMessage(navigator.onLine ? 'Artifact uploaded.' : 'Artifact queued for sync.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload artifact');
    }
  }

  async function handleCheckIn(assignmentId: string) {
    try {
      const location = await getLocationSnapshot();
      await invokePatch(
        {
          action: 'check_in',
          assignmentId,
          ...location,
          notes: checkInNotesById[assignmentId] ?? '',
        },
        true,
      );
      setMessage(isOnline ? 'Checked in.' : 'Check-in queued for sync.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to check in');
    }
  }

  async function handleCheckOut(assignment: VendorDayAssignment) {
    try {
      const location = await getLocationSnapshot();
      await invokePatch(
        {
          action: 'check_out',
          assignmentId: assignment.id,
          ...location,
          pendingArtifactSync: !navigator.onLine,
          pennyBundleStatus: pennyBundleStatusById[assignment.id] ?? assignment.execution?.pennyBundleStatus ?? (assignment.request?.pennyBundleRequested ? 'Accepted' : 'Not Offered'),
          trafficLevel: trafficById[assignment.id] ?? assignment.execution?.trafficLevel ?? 'Medium',
          budtenderEngagementScore: Number(engagementById[assignment.id] ?? assignment.execution?.budtenderEngagementScore ?? 3),
          checkOutNotes: checkOutNotesById[assignment.id] ?? '',
        },
        true,
      );
      setMessage(isOnline ? 'Checked out.' : 'Checkout queued for sync.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to check out');
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading vendor days…</div>;
  }

  const selectedArtifacts = selectedAssignment?.execution?.artifacts ?? [];
  const selectedArtifactState = selectedAssignment ? requiredArtifactState(selectedAssignment) : null;
  const viewOptions = viewOptionsForRole(access.role);

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)] px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-[var(--app-shell-max)] flex-col gap-5">
        <section className="overflow-hidden rounded-[30px] border border-[#d5dbe5] bg-[linear-gradient(135deg,#16202b_0%,#1d5eea_58%,#4f86f3_100%)] p-5 text-white shadow-[0_24px_60px_rgba(24,33,45,0.18)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {isBrandAmbassador ? 'Brand Ambassador Workflow' : 'Vendor Day Control'}
              </p>
              <h1 className="mt-2 text-[30px] font-semibold leading-tight">
                {isBrandAmbassador ? 'Run the event cleanly from one focused field workflow.' : 'Manage dispatch, field execution, proof, and pay from one operating surface.'}
              </h1>
              <p className="mt-2 text-sm text-white/82">
                {isBrandAmbassador
                  ? 'Offers, today, proof, check-in, check-out, pay, and history stay in one place so the flow feels like a field app instead of an ops dashboard.'
                  : 'Requests, approvals, concurrent offers, field status, settlement, and archive sync stay visible without dropping into separate tools.'}
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3">
              <MetricCard label={isBrandAmbassador ? 'Open Offers' : 'Open Requests'} value={isBrandAmbassador ? openOffers.length : requests.length} tone="warm" />
              <MetricCard label={isBrandAmbassador ? 'Running Pay' : 'Live Assignments'} value={isBrandAmbassador ? formatCurrency(currentWorkerBalance) : liveAssignments.length} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/18 bg-white/12 text-white">
              {requests.length} requests
            </Badge>
            <Badge variant="outline" className="border-white/18 bg-white/12 text-white">
              {assignments.length} assignments
            </Badge>
            <Badge variant={isOnline ? 'success' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
            {offlineCount > 0 ? <Badge variant="warning">{offlineCount} queued for sync</Badge> : null}
            {fieldExceptions.length > 0 ? <Badge variant="danger">{fieldExceptions.length} need review</Badge> : null}
          </div>

          <div className="mt-5 rounded-[24px] border border-white/15 bg-white/10 p-2 backdrop-blur-sm">
            <SegmentedControl value={activeView} options={viewOptions} onChange={handleViewChange} className="grid-cols-5 bg-white/20" />
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-[#f1d3c8] bg-[#fff4ef] px-4 py-3 text-sm text-[#9a3412]">{message}</div>
        ) : null}

        {isBrandAmbassador ? (
          <>
            {activeView === 'offers' ? (
              openOffers.length > 0 ? (
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Offers waiting on you</CardTitle>
                    <CardDescription>Offers are live right now. The first ambassador to accept locks the event.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {openOffers.map(({ request, offer }) => (
                      <div key={offer.id} className="rounded-[24px] border border-[#e0e3ea] bg-[#fbfcfe] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-[#15181d]">{request.account.name}</h3>
                              <Badge variant="warning">Offer open</Badge>
                            </div>
                            <p className="mt-1 text-sm text-[#5e6671]">
                              {formatDateTime(request.requestedStart)} · {request.requestedDurationHours} hours · {request.account.city ?? '—'}
                              {request.account.state ? `, ${request.account.state}` : ''}
                            </p>
                            <p className="mt-2 text-sm text-[#47505d]">{offer.rankReason ?? 'Matched by proximity, availability, and workload fit.'}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge variant="outline">Expires {formatShortDate(offer.expiresAt)}</Badge>
                              <Badge variant="outline">Score {Math.round(offer.rankScore)}</Badge>
                              {request.pennyBundleRequested ? <Badge variant="warning">Penny Bundle requested</Badge> : null}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() =>
                                void invokePatch({ action: 'respond_offer', offerId: offer.id, decision: 'accept' }).catch((error: unknown) =>
                                  setMessage(error instanceof Error ? error.message : 'Failed to accept offer'),
                                )
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                void invokePatch({ action: 'respond_offer', offerId: offer.id, decision: 'decline' }).catch((error: unknown) =>
                                  setMessage(error instanceof Error ? error.message : 'Failed to decline offer'),
                                )
                              }
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <SectionEmpty title="No open offers" body="When a store request is dispatched to you, it will appear here first with the exact timing, store details, and Penny Bundle requirements." />
              )
            ) : null}

            {activeView === 'today' ? (
              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Today and next up</CardTitle>
                    <CardDescription>Pick an assignment to view the detail, proof checklist, and day-of actions.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {todayAssignments.length === 0 ? (
                      <SectionEmpty title="No active assignments" body="Accepted vendor days, checked-in events, and anything waiting on proof or pass-off will show up here." />
                    ) : null}
                    {todayAssignments.map((assignment) => {
                      const proofState = requiredArtifactState(assignment);
                      const isSelected = assignment.id === selectedAssignment?.id;
                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          onClick={() => setSelectedAssignmentId(assignment.id)}
                          className={[
                            'w-full rounded-[22px] border p-4 text-left transition',
                            isSelected ? 'border-[#c9451f] bg-[#fff6f2] shadow-[0_10px_30px_rgba(201,69,31,0.12)]' : 'border-[#e0e4eb] bg-[#fbfcfe] hover:border-[#c8d4e8]',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                                <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
                              </div>
                              <p className="mt-1 text-sm text-[#5d6672]">
                                {formatShortDate(assignment.scheduledStart)} · {assignment.request?.requestedDurationHours ?? 3} hours ·{' '}
                                {assignment.request?.account.city ?? '—'}
                              </p>
                            </div>
                            <div className="text-right text-sm text-[#5d6672]">
                              <p>{formatCurrency(Number(assignment.eventPayAmount ?? 0) + Number(assignment.travelPayAmount ?? 0))}</p>
                              {assignment.travelMinutesOneWay ? <p>{assignment.travelMinutesOneWay} min away</p> : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>{proofState.hasCheckInPhoto ? 'Setup photo ready' : 'Setup photo needed'}</Badge>
                            <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>{proofState.hasCheckOutPhoto ? 'End photo ready' : 'End photo needed'}</Badge>
                            {proofState.requiresPosProof ? (
                              <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>{proofState.hasPosProof ? 'POS proof ready' : 'POS proof required'}</Badge>
                            ) : null}
                            {proofState.pendingArtifactSync ? <Badge variant="warning">Pending sync</Badge> : null}
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Assignment detail</CardTitle>
                    <CardDescription>The day-of execution flow stays here: arrival, proof, checkout, notes, and pass-off if needed.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!selectedAssignment ? (
                      <SectionEmpty title="Select an assignment" body="Choose an event from the left to open the exact check-in, upload, and checkout workflow for that store." />
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-[24px] border border-[#dfe4eb] bg-[#fbfcfe] p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold text-[#18212d]">{selectedAssignment.request?.account.name ?? 'Vendor day assignment'}</h3>
                            <Badge variant={statusVariant(selectedAssignment.status)}>{readableStatus(selectedAssignment.status)}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-[#5d6672]">
                            {formatDateTime(selectedAssignment.scheduledStart)} to {formatDateTime(selectedAssignment.scheduledEnd)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline">
                              Event pay {formatCurrency(selectedAssignment.eventPayAmount)}
                            </Badge>
                            <Badge variant="outline">
                              Travel pay {formatCurrency(selectedAssignment.travelPayAmount)}
                            </Badge>
                            {selectedAssignment.request?.pennyBundleRequested ? <Badge variant="warning">Penny Bundle required</Badge> : <Badge variant="secondary">No Penny Bundle</Badge>}
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                          <div className="space-y-4">
                            <Card className="border-[#dfe4eb] shadow-none">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Proof checklist</CardTitle>
                                <CardDescription>Completion requires the right artifacts. Offline uploads will queue automatically.</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {selectedArtifactState ? (
                                  <>
                                    <div className="flex items-center justify-between rounded-xl border border-[#e4e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
                                      <span>Setup photo</span>
                                      <Badge variant={selectedArtifactState.hasCheckInPhoto ? 'success' : 'secondary'}>
                                        {selectedArtifactState.hasCheckInPhoto ? 'Ready' : 'Needed'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl border border-[#e4e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
                                      <span>End photo</span>
                                      <Badge variant={selectedArtifactState.hasCheckOutPhoto ? 'success' : 'secondary'}>
                                        {selectedArtifactState.hasCheckOutPhoto ? 'Ready' : 'Needed'}
                                      </Badge>
                                    </div>
                                    {selectedArtifactState.requiresPosProof ? (
                                      <div className="flex items-center justify-between rounded-xl border border-[#e4e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
                                        <span>POS proof</span>
                                        <Badge variant={selectedArtifactState.hasPosProof ? 'success' : 'warning'}>
                                          {selectedArtifactState.hasPosProof ? 'Ready' : 'Required'}
                                        </Badge>
                                      </div>
                                    ) : null}
                                    {selectedArtifactState.pendingArtifactSync ? (
                                      <div className="rounded-xl border border-[#f5d589] bg-[#fff8e6] px-3 py-2 text-sm text-[#9a6b00]">
                                        Some artifacts are still queued locally and will sync when connectivity returns.
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </CardContent>
                            </Card>

                            <Card className="border-[#dfe4eb] shadow-none">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Check in</CardTitle>
                                <CardDescription>Location is best-effort only. Use arrival notes if GPS is weak.</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <Textarea
                                  value={checkInNotesById[selectedAssignment.id] ?? selectedAssignment.execution?.checkInNotes ?? ''}
                                  onChange={(event) => setCheckInNotesById((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))}
                                  placeholder="Arrival notes, setup issues, store context"
                                />
                                <Button className="w-full" variant="secondary" onClick={() => void handleCheckIn(selectedAssignment.id)}>
                                  {selectedAssignment.execution?.checkInAt ? 'Update Check-In' : 'Check In'}
                                </Button>
                                <p className="text-xs text-[#66707d]">
                                  {selectedAssignment.execution?.checkInAt ? `Last check-in ${formatShortDate(selectedAssignment.execution.checkInAt)}` : 'No check-in recorded yet.'}
                                </p>
                              </CardContent>
                            </Card>
                          </div>

                          <div className="space-y-4">
                            <Card className="border-[#dfe4eb] shadow-none">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Upload center</CardTitle>
                                <CardDescription>Use exported POS reports when possible. Screenshots and photos are allowed and flagged for review.</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <label className="block text-sm font-medium text-[#36404d]">
                                  Setup photo
                                  <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => void handleArtifactUpload(selectedAssignment.id, event.target.files, 'CHECK_IN_PHOTO')} />
                                </label>
                                <label className="block text-sm font-medium text-[#36404d]">
                                  POS report or screenshot
                                  <Input
                                    type="file"
                                    accept=".csv,.xls,.xlsx,.pdf,image/*"
                                    className="mt-1 h-auto py-2"
                                    onChange={(event) => void handleArtifactUpload(selectedAssignment.id, event.target.files, 'POS_REPORT')}
                                  />
                                </label>
                                <label className="block text-sm font-medium text-[#36404d]">
                                  End photo
                                  <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => void handleArtifactUpload(selectedAssignment.id, event.target.files, 'CHECK_OUT_PHOTO')} />
                                </label>
                                {selectedArtifacts.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {selectedArtifacts.map((artifact) => (
                                      <Badge key={artifact.id} variant={artifact.syncStatus === 'queued' ? 'warning' : 'secondary'}>
                                        {artifact.originalName ?? artifact.type}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-[#66707d]">No proof uploaded yet.</p>
                                )}
                              </CardContent>
                            </Card>

                            <Card className="border-[#dfe4eb] shadow-none">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Check out</CardTitle>
                                <CardDescription>Traffic, engagement, Penny Bundle result, and notes all stay attached to this event record.</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <select
                                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                                  value={pennyBundleStatusById[selectedAssignment.id] ?? selectedAssignment.execution?.pennyBundleStatus ?? (selectedAssignment.request?.pennyBundleRequested ? 'Accepted' : 'Not Offered')}
                                  onChange={(event) => setPennyBundleStatusById((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))}
                                >
                                  <option>Not Offered</option>
                                  <option>Offered</option>
                                  <option>Accepted</option>
                                  <option>Pending Credit</option>
                                  <option>Completed</option>
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                  <select
                                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                                    value={trafficById[selectedAssignment.id] ?? selectedAssignment.execution?.trafficLevel ?? 'Medium'}
                                    onChange={(event) => setTrafficById((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))}
                                  >
                                    <option>Low</option>
                                    <option>Medium</option>
                                    <option>High</option>
                                  </select>
                                  <select
                                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                                    value={engagementById[selectedAssignment.id] ?? String(selectedAssignment.execution?.budtenderEngagementScore ?? 3)}
                                    onChange={(event) => setEngagementById((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))}
                                  >
                                    <option value="1">Engagement 1</option>
                                    <option value="2">Engagement 2</option>
                                    <option value="3">Engagement 3</option>
                                    <option value="4">Engagement 4</option>
                                    <option value="5">Engagement 5</option>
                                  </select>
                                </div>
                                <Textarea
                                  value={checkOutNotesById[selectedAssignment.id] ?? selectedAssignment.execution?.checkOutNotes ?? ''}
                                  onChange={(event) => setCheckOutNotesById((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))}
                                  placeholder="Customer highlights, objections, missing displays, and restock callouts"
                                />
                                <Button className="w-full" variant="outline" onClick={() => void handleCheckOut(selectedAssignment)}>
                                  {selectedAssignment.execution?.checkOutAt ? 'Update Check-Out' : 'Check Out'}
                                </Button>
                                <p className="text-xs text-[#66707d]">
                                  {selectedAssignment.execution?.checkOutAt ? `Last checkout ${formatShortDate(selectedAssignment.execution.checkOutAt)}` : 'No checkout recorded yet.'}
                                </p>
                              </CardContent>
                            </Card>

                            <Card className="border-[#eadfd8] bg-[#fff8f4] shadow-none">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base text-[#7c2d12]">Need a replacement?</CardTitle>
                                <CardDescription className="text-[#8c3e1f]">Pass-off is available before the cutoff window. After that, ops has to handle it manually.</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <Input
                                  value={passOffReasonById[selectedAssignment.id] ?? ''}
                                  onChange={(event) => setPassOffReasonById((current) => ({ ...current, [selectedAssignment.id]: event.target.value }))}
                                  placeholder="Why do you need a replacement?"
                                />
                                <Button
                                  variant="outline"
                                  className="w-full"
                                  onClick={() =>
                                    void invokePatch({
                                      action: 'pass_off',
                                      assignmentId: selectedAssignment.id,
                                      reason: passOffReasonById[selectedAssignment.id] ?? 'BA requested reassignment',
                                    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to pass off assignment'))
                                  }
                                >
                                  Pass Off
                                </Button>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {activeView === 'uploads' ? (
              selectedAssignment ? (
                <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                  <Card className="border-[#d8d9de]">
                    <CardHeader>
                      <CardTitle>Focused event</CardTitle>
                      <CardDescription>Choose the event that still needs proof or sync attention.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[...todayAssignments, ...historyAssignments.slice(0, 6)].map((assignment) => {
                        const proofState = requiredArtifactState(assignment);
                        const selected = selectedAssignment.id === assignment.id;
                        return (
                          <button
                            key={assignment.id}
                            type="button"
                            onClick={() => setSelectedAssignmentId(assignment.id)}
                            className={[
                              'w-full rounded-[20px] border p-3 text-left',
                              selected ? 'border-[#c9451f] bg-[#fff6f2]' : 'border-[#e0e4eb] bg-[#fbfcfe]',
                            ].join(' ')}
                          >
                            <p className="font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                            <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>Setup</Badge>
                              <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>End</Badge>
                              {proofState.requiresPosProof ? <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>POS</Badge> : null}
                            </div>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="border-[#d8d9de]">
                    <CardHeader>
                      <CardTitle>Upload center</CardTitle>
                      <CardDescription>Everything for proof, sync visibility, and manual review is attached here.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-[22px] border border-[#dfe4eb] bg-[#fbfcfe] p-4">
                        <p className="text-lg font-semibold text-[#18212d]">{selectedAssignment.request?.account.name ?? 'Vendor day assignment'}</p>
                        <p className="mt-1 text-sm text-[#5d6672]">{formatDateTime(selectedAssignment.scheduledStart)}</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="block text-sm font-medium text-[#36404d]">
                          Setup photo
                          <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => void handleArtifactUpload(selectedAssignment.id, event.target.files, 'CHECK_IN_PHOTO')} />
                        </label>
                        <label className="block text-sm font-medium text-[#36404d]">
                          POS report or screenshot
                          <Input
                            type="file"
                            accept=".csv,.xls,.xlsx,.pdf,image/*"
                            className="mt-1 h-auto py-2"
                            onChange={(event) => void handleArtifactUpload(selectedAssignment.id, event.target.files, 'POS_REPORT')}
                          />
                        </label>
                        <label className="block text-sm font-medium text-[#36404d]">
                          End photo
                          <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => void handleArtifactUpload(selectedAssignment.id, event.target.files, 'CHECK_OUT_PHOTO')} />
                        </label>
                      </div>
                      {selectedArtifacts.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedArtifacts.map((artifact) => (
                            <div key={artifact.id} className="rounded-xl border border-[#e3e8f0] bg-[#f8fafc] px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-[#1b2430]">{artifact.originalName ?? artifact.type}</p>
                                <Badge variant={artifact.syncStatus === 'queued' ? 'warning' : 'secondary'}>{artifact.syncStatus}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-[#66707d]">{artifact.type.replaceAll('_', ' ')}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <SectionEmpty title="No artifacts yet" body="Uploads appear here immediately. If the device is offline they stay queued until the connection returns." />
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <SectionEmpty title="Nothing to upload" body="Once you have a live or recent assignment, this screen becomes the fastest place to manage proof and sync status." />
              )
            ) : null}

            {activeView === 'pay' ? (
              <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Pay snapshot</CardTitle>
                    <CardDescription>Your running balance and the current pay-period batch pull from payroll records, not client-side estimates.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MetricCard label="Running balance" value={formatCurrency(currentWorkerBalance)} tone="warm" />
                    <MetricCard label="Assignment estimate" value={formatCurrency(payTotal)} />
                    <div className="rounded-2xl border border-[#e3e7ef] bg-[#f8fafc] p-4 text-sm text-[#5d6672]">
                      {payrollLoading ? 'Loading payroll data…' : payroll?.currentBatch ? `Current batch closes ${formatShortDate(payroll.currentBatch.endsOn)}.` : 'No payroll batch yet.'}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Current batch lines</CardTitle>
                    <CardDescription>Travel pay is broken out when one-way drive time crosses the configured threshold.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {payrollLoading ? <p className="text-sm text-[#66707d]">Loading pay lines…</p> : null}
                    {!payrollLoading && (!payroll?.currentBatch || payroll.currentBatch.lineItems.length === 0) ? (
                      <SectionEmpty title="No payroll lines yet" body="Completed or checked-out vendor days will appear here as soon as the payroll sync runs." />
                    ) : null}
                    {payroll?.currentBatch?.lineItems
                      .filter((line) => !payload?.viewerWorkerProfileId || line.workerProfile.id === payload.viewerWorkerProfileId)
                      .map((line) => (
                        <div key={line.id} className="rounded-xl border border-[#e3e8f0] bg-[#f8fafc] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-[#18212d]">{line.assignment.request.account.name}</p>
                              <p className="text-sm text-[#5d6672]">{line.workerProfile.displayName}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-[#18212d]">{formatCurrency(line.totalPayAmount)}</p>
                              <Badge variant={statusVariant(line.status)}>{readableStatus(line.status)}</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {activeView === 'history' ? (
              historyAssignments.length > 0 ? (
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Event history</CardTitle>
                    <CardDescription>Closed, completed, no-show, and passed-off events stay here with proof and payout context.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {historyAssignments.map((assignment) => {
                      const proofState = requiredArtifactState(assignment);
                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          onClick={() => {
                            setSelectedAssignmentId(assignment.id);
                            handleViewChange('uploads');
                          }}
                          className="rounded-[22px] border border-[#e0e4eb] bg-[#fbfcfe] p-4 text-left transition hover:border-[#c9d5e8]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                              <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
                              <p className="mt-2 text-sm font-medium text-[#18212d]">
                                {formatCurrency(Number(assignment.eventPayAmount ?? 0) + Number(assignment.travelPayAmount ?? 0))}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>Setup</Badge>
                            <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>End</Badge>
                            {proofState.requiresPosProof ? <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>POS</Badge> : null}
                            {proofState.pendingArtifactSync ? <Badge variant="warning">Pending sync</Badge> : null}
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : (
                <SectionEmpty title="No history yet" body="Completed vendor days will roll into this screen automatically so ambassadors can verify proof and payout later." />
              )
            ) : null}
          </>
        ) : (
          <>
            {activeView === 'requests' && canCreateRequests ? (
              <Card className="border-[#d8d9de]">
                <CardHeader>
                  <CardTitle>Create vendor-day request</CardTitle>
                  <CardDescription>Use a one-time cooldown override when needed. Four-hour vendor days stay blocked until admin approval.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateRequest}>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Store</label>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                        value={selectedAccountId}
                        onChange={(event) => setSelectedAccountId(event.target.value)}
                      >
                        <option value="">Select a store</option>
                        {payload?.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} {account.city ? `· ${account.city}, ${account.state ?? ''}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Preferred start</label>
                      <Input type="datetime-local" value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Alternate start</label>
                      <Input type="datetime-local" value={alternateStart} onChange={(event) => setAlternateStart(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Duration</label>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                        value={requestedDurationHours}
                        onChange={(event) => setRequestedDurationHours(event.target.value)}
                      >
                        <option value="3">3 hours</option>
                        <option value="4">4 hours (admin approval required)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Penny Bundle</label>
                      <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3">
                        <input type="checkbox" checked={pennyBundleRequested} onChange={(event) => setPennyBundleRequested(event.target.checked)} />
                        Request Penny Bundle support
                      </label>
                    </div>
                    {canDispatch ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Preferred BA</label>
                        <select
                          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
                          value={preferredWorkerProfileId}
                          onChange={(event) => setPreferredWorkerProfileId(event.target.value)}
                        >
                          <option value="">Best-fit worker</option>
                          {payload?.workers.map((worker) => (
                            <option key={worker.id} value={worker.id}>
                              {worker.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {canDispatch ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Cooldown Override</label>
                          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3">
                            <input type="checkbox" checked={override60DayWindow} onChange={(event) => setOverride60DayWindow(event.target.checked)} />
                            Override 60-Day Window
                          </label>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">Override reason</label>
                          <Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Required when cooldown override is used" />
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Notes</label>
                      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should the BA or rep know?" />
                    </div>
                    <div className="md:col-span-2">
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Creating…' : 'Create Request'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {activeView === 'queue' ? (
              <Card className="border-[#d8d9de]">
                <CardHeader>
                  <CardTitle>Dispatch queue</CardTitle>
                  <CardDescription>Rep approvals, one-time overrides, concurrent offers, 4-hour approvals, pass-off, no-show, and exception states.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {requests.length === 0 ? <SectionEmpty title="No vendor-day requests" body="Requests created by reps, ambassadors, ops, and store self-service will land here as the dispatch queue." /> : null}
                  {requests.map((request) => {
                    const activeAssignment = request.assignments[0];
                    return (
                      <div key={request.id} className="rounded-[24px] border border-[#dfe3ea] bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-[#17181c]">{request.account.name}</h3>
                              <Badge variant={statusVariant(request.status)}>{readableStatus(request.status)}</Badge>
                              {request.override60DayWindow ? <Badge variant="warning">Override 60-Day Window</Badge> : null}
                              {request.requiresAdminApproval ? <Badge variant="warning">4-hour approval required</Badge> : null}
                            </div>
                            <p className="mt-1 text-sm text-[#5d6470]">
                              {formatDateTime(request.requestedStart)} · {request.requestedDurationHours} hours · score {request.priorityScore}
                            </p>
                            {request.notes ? <p className="mt-2 text-sm text-[#4a5260]">{request.notes}</p> : null}
                            {request.status === 'AWAITING_REP_APPROVAL' ? (
                              <p className="mt-2 text-sm text-[#4a5260]">Rep approval is required before dispatch can open concurrent BA offers.</p>
                            ) : null}
                            {activeAssignment ? (
                              <p className="mt-2 text-sm text-[#4a5260]">
                                Assigned to <strong>{payload?.workers.find((worker) => worker.id === activeAssignment.workerProfileId)?.displayName ?? 'Unassigned'}</strong>
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {canApproveDuration && request.requiresAdminApproval && !request.approvedAt ? (
                              <Button
                                variant="secondary"
                                onClick={() => void invokePatch({ action: 'approve_duration_override', requestId: request.id }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to approve duration override'))}
                              >
                                Approve 4 Hours
                              </Button>
                            ) : null}
                            {canDispatch && request.status === 'AWAITING_REP_APPROVAL' ? (
                              <Button
                                variant="secondary"
                                onClick={() => void invokePatch({ action: 'approve_rep_request', requestId: request.id }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to approve request'))}
                              >
                                Approve Request
                              </Button>
                            ) : null}
                            {canDispatch && ['READY_FOR_DISPATCH', 'PASSED_OFF', 'EXCEPTION'].includes(request.status) ? (
                              <Button
                                onClick={() => void invokePatch({ action: 'dispatch', requestId: request.id }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to dispatch request'))}
                              >
                                Open Concurrent Offers
                              </Button>
                            ) : null}
                            {['ADMIN', 'OPS_TEAM'].includes(access.role) && request.status === 'ASSIGNED' ? (
                              <Button
                                variant="outline"
                                onClick={() => void invokePatch({ action: 'mark_no_show', requestId: request.id }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to mark no-show'))}
                              >
                                Mark No-Show
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {request.offers.length > 0 ? (
                          <div className="mt-4 grid gap-2 md:grid-cols-2">
                            {request.offers.map((offer) => (
                              <div key={offer.id} className="rounded-xl border border-[#e6e9ef] bg-[#fafbfd] px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-[#1e2430]">{offer.workerProfile.displayName}</span>
                                  <Badge variant={statusVariant(offer.status)}>{offer.status}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-[#66707d]">{offer.rankReason ?? 'Ranked by availability fit.'}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}

            {activeView === 'field' ? (
              <Card className="border-[#d8d9de]">
                <CardHeader>
                  <CardTitle>Field board</CardTitle>
                  <CardDescription>See which ambassadors are active, where proof is still missing, and what is blocked in the field.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {liveAssignments.length === 0 ? <SectionEmpty title="No live assignments" body="Checked-in, assigned, exception, and disputed events will surface here for active monitoring." /> : null}
                  {liveAssignments.map((assignment) => {
                    const proofState = requiredArtifactState(assignment);
                    return (
                      <div key={assignment.id} className="rounded-[22px] border border-[#e0e4eb] bg-[#fbfcfe] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                          <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
                        <p className="mt-1 text-sm text-[#5d6672]">{assignment.request?.account.city ?? '—'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>Setup</Badge>
                          <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>End</Badge>
                          {proofState.requiresPosProof ? <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>POS</Badge> : null}
                          {proofState.pendingArtifactSync ? <Badge variant="warning">Pending sync</Badge> : null}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}

            {activeView === 'pay' ? (
              <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Payroll overview</CardTitle>
                    <CardDescription>Current pay-period totals, disputed lines, and batch status.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MetricCard label="Assignments tracked" value={assignments.length} />
                    <MetricCard label="Running balance" value={formatCurrency(currentWorkerBalance)} tone="warm" />
                    <div className="rounded-2xl border border-[#e3e7ef] bg-[#f8fafc] p-4 text-sm text-[#5d6672]">
                      {payrollLoading ? 'Loading payroll batch…' : payroll?.currentBatch ? `Current batch status: ${readableStatus(payroll.currentBatch.status)}.` : 'No payroll batch found.'}
                    </div>
                    {payroll?.disputedLines?.length ? (
                      <div className="rounded-2xl border border-[#f3b4b4] bg-[#fff3f3] p-4">
                        <p className="text-sm font-semibold text-[#9b1c1c]">Disputed lines</p>
                        <div className="mt-3 space-y-2 text-sm text-[#7c2d12]">
                          {payroll.disputedLines.map((line) => (
                            <p key={line.id}>
                              {line.workerProfile.displayName} · {line.assignment.request.account.name} · {formatCurrency(line.totalPayAmount)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Current batch lines</CardTitle>
                    <CardDescription>Settlement lines update from completed or checked-out assignments.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {payrollLoading ? <p className="text-sm text-[#66707d]">Loading pay lines…</p> : null}
                    {!payrollLoading && (!payroll?.currentBatch || payroll.currentBatch.lineItems.length === 0) ? (
                      <SectionEmpty title="No batch lines yet" body="Payroll lines appear here once completed vendor days sync into the current batch." />
                    ) : null}
                    {payroll?.currentBatch?.lineItems.map((line) => (
                      <div key={line.id} className="rounded-xl border border-[#e3e8f0] bg-[#f8fafc] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[#18212d]">{line.assignment.request.account.name}</p>
                            <p className="text-sm text-[#5d6672]">{line.workerProfile.displayName}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-[#18212d]">{formatCurrency(line.totalPayAmount)}</p>
                            <Badge variant={statusVariant(line.status)}>{readableStatus(line.status)}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {activeView === 'history' ? (
              historyAssignments.length > 0 ? (
                <Card className="border-[#d8d9de]">
                  <CardHeader>
                    <CardTitle>Assignment archive</CardTitle>
                    <CardDescription>Recent event history with proof and status context.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {historyAssignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-[22px] border border-[#e0e4eb] bg-[#fbfcfe] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                          <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
                        <p className="mt-2 text-sm text-[#5d6672]">
                          {formatCurrency(Number(assignment.eventPayAmount ?? 0) + Number(assignment.travelPayAmount ?? 0))}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <SectionEmpty title="No archived assignments yet" body="Completed and closed vendor days will stay here for review, reporting, and downstream settlement." />
              )
            ) : null}
          </>
        )}

        {!isBrandAmbassador ? (
          <div className="rounded-[24px] border border-[#d8dfe8] bg-white px-4 py-3 text-sm text-[#5d6672] shadow-[0_16px_40px_rgba(24,33,45,0.08)]">
            Need the ambassador execution view? Switch into the <strong>Brand Ambassador</strong> role in the header, then open{' '}
            <Link href="/vendor-days?view=today" className="font-semibold text-[#1d5eea]">
              Today
            </Link>
            .
          </div>
        ) : null}
      </div>
    </div>
  );
}
