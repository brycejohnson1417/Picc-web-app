'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { WorkspacePage } from '@/components/layout/workspace-page';
import {
  VendorDayAssignmentDetailSection,
  VendorDayOffersSection,
  VendorDayPaySection,
  VendorDayTodaySection,
  VendorDayUploadsSection,
  VendorDayHistorySection,
} from './vendor-day-ba-sections';
import {
  VendorDayFieldBoard,
  VendorDayOpsHistorySection,
  VendorDayOpsPaySection,
  VendorDayQueueSection,
  VendorDayRequestForm,
} from './vendor-day-ops-sections';
import { VendorDayWorkspaceHeader } from './vendor-day-workspace-header';
import {
  DB_NAME,
  STORE_NAME,
  formatCurrency,
  formatShortDate,
  isActiveAssignment,
  isHistoryAssignment,
  normalizeView,
  type OfflineQueueItem,
  type PayrollOverview,
  type VendorDayAssignment,
  type VendorDayView,
  type WorkspacePayload,
  viewOptionsForRole,
} from './vendor-day-types';

function readSessionJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionJson<T>(key: string, payload: T) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

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
  const canMarkNoShow = ['ADMIN', 'OPS_TEAM'].includes(access.role);
  const isBrandAmbassador = access.role === 'BRAND_AMBASSADOR';
  const workspaceCacheKey = `picc:vendor-days:workspace:${access.role}`;
  const payrollCacheKey = `picc:vendor-days:payroll:${access.role}:${payload?.viewerWorkerProfileId ?? 'workspace'}`;

  const loadWorkspace = useCallback(async () => {
    const response = await fetch('/api/vendor-days');
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error ?? 'Failed to load vendor-day workspace');
    }
    setPayload(json);
    writeSessionJson(workspaceCacheKey, json);
    setLoading(false);
  }, [workspaceCacheKey]);

  const loadPayroll = useCallback(async () => {
    if (!['ADMIN', 'OPS_TEAM', 'FINANCE', 'BRAND_AMBASSADOR'].includes(access.role)) {
      return;
    }
    setPayrollLoading(true);
    try {
      const response = await fetch('/api/payroll');
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? 'Failed to load pay data');
      }
      setPayroll(json);
      writeSessionJson(payrollCacheKey, json);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load pay data');
    } finally {
      setPayrollLoading(false);
    }
  }, [access.role, payrollCacheKey]);

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
    const cachedWorkspace = readSessionJson<WorkspacePayload>(workspaceCacheKey);
    if (cachedWorkspace) {
      setPayload(cachedWorkspace);
      setLoading(false);
    }

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
  }, [flushOfflineQueue, loadWorkspace, workspaceCacheKey]);

  useEffect(() => {
    if (activeView === 'pay') {
      const cachedPayroll = readSessionJson<PayrollOverview>(payrollCacheKey);
      if (cachedPayroll) {
        setPayroll(cachedPayroll);
      }
      void loadPayroll();
    }
  }, [activeView, loadPayroll, payrollCacheKey]);

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

  const selectedArtifacts = selectedAssignment?.execution?.artifacts ?? [];
  const selectedCheckInNotes = selectedAssignment ? checkInNotesById[selectedAssignment.id] ?? selectedAssignment.execution?.checkInNotes ?? '' : '';
  const selectedCheckOutNotes = selectedAssignment ? checkOutNotesById[selectedAssignment.id] ?? selectedAssignment.execution?.checkOutNotes ?? '' : '';
  const selectedPennyBundleStatus = selectedAssignment
    ? pennyBundleStatusById[selectedAssignment.id] ?? selectedAssignment.execution?.pennyBundleStatus ?? (selectedAssignment.request?.pennyBundleRequested ? 'Accepted' : 'Not Offered')
    : 'Not Offered';
  const selectedTrafficLevel = selectedAssignment ? trafficById[selectedAssignment.id] ?? selectedAssignment.execution?.trafficLevel ?? 'Medium' : 'Medium';
  const selectedEngagementScore = selectedAssignment ? engagementById[selectedAssignment.id] ?? String(selectedAssignment.execution?.budtenderEngagementScore ?? 3) : '3';
  const selectedPassOffReason = selectedAssignment ? passOffReasonById[selectedAssignment.id] ?? selectedAssignment.passOffReason ?? '' : '';

  const payTotal = useMemo(
    () =>
      assignments.reduce((sum, assignment) => {
        const eventPay = Number(assignment.eventPayAmount ?? 0);
        const travelPay = Number(assignment.travelPayAmount ?? 0);
        return sum + eventPay + travelPay;
      }, 0),
    [assignments],
  );

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

  async function handleCreateRequest(event: FormEvent) {
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

  const viewOptions = viewOptionsForRole(access.role);

  const renderAssignmentSummary = (assignment: VendorDayAssignment) => (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-base font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
        <p className="mt-1 text-sm text-[#5d6672]">
          {formatShortDate(assignment.scheduledStart)} · {assignment.request?.requestedDurationHours ?? 3} hours · {assignment.request?.account.city ?? '—'}
        </p>
      </div>
      <div className="text-right text-sm text-[#5d6672]">
        <p>{formatCurrency(Number(assignment.eventPayAmount ?? 0) + Number(assignment.travelPayAmount ?? 0))}</p>
        {assignment.travelMinutesOneWay ? <p>{assignment.travelMinutesOneWay} min away</p> : null}
      </div>
    </div>
  );

  return (
    <WorkspacePage className="py-4">
      <VendorDayWorkspaceHeader
        eyebrow={isBrandAmbassador ? 'Brand Ambassador Workflow' : 'Vendor Day Control'}
        title={isBrandAmbassador ? 'Run the event cleanly from one focused field workflow.' : 'Manage dispatch, field execution, proof, and pay from one operating surface.'}
        description={
          isBrandAmbassador
            ? 'Offers, today, proof, check-in, check-out, pay, and history stay in one place so the flow feels like a field app instead of an ops dashboard.'
            : 'Requests, approvals, concurrent offers, field status, settlement, and archive sync stay visible without dropping into separate tools.'
        }
        openLabel={isBrandAmbassador ? 'Open Offers' : 'Open Requests'}
        openValue={isBrandAmbassador ? openOffers.length : requests.length}
        liveLabel={isBrandAmbassador ? 'Running Pay' : 'Live Assignments'}
        liveValue={isBrandAmbassador ? formatCurrency(currentWorkerBalance) : liveAssignments.length}
        requestCount={requests.length}
        assignmentCount={assignments.length}
        isOnline={isOnline}
        offlineCount={offlineCount}
        fieldExceptionCount={fieldExceptions.length}
        viewOptions={viewOptions}
        activeView={activeView}
        onViewChange={handleViewChange}
      />

      {message ? <div className="rounded-2xl border border-[#f1d3c8] bg-[#fff4ef] px-4 py-3 text-sm text-[#9a3412]">{message}</div> : null}

      {isBrandAmbassador ? (
        <>
          {activeView === 'offers' ? (
            <VendorDayOffersSection
              openOffers={openOffers}
              onAcceptOffer={(offerId) => void invokePatch({ action: 'respond_offer', offerId, decision: 'accept' }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to accept offer'))}
              onDeclineOffer={(offerId) => void invokePatch({ action: 'respond_offer', offerId, decision: 'decline' }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to decline offer'))}
            />
          ) : null}

          {activeView === 'today' ? (
            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <VendorDayTodaySection todayAssignments={todayAssignments} selectedAssignment={selectedAssignment} onSelectAssignment={setSelectedAssignmentId} renderAssignmentSummary={renderAssignmentSummary} />
              <VendorDayAssignmentDetailSection
                assignment={selectedAssignment}
                selectedArtifacts={selectedArtifacts}
                checkInNotes={selectedCheckInNotes}
                checkOutNotes={selectedCheckOutNotes}
                pennyBundleStatus={selectedPennyBundleStatus}
                trafficLevel={selectedTrafficLevel}
                engagementScore={selectedEngagementScore}
                passOffReason={selectedPassOffReason}
                onCheckInNotesChange={(value) => {
                  if (!selectedAssignment) return;
                  setCheckInNotesById((current) => ({ ...current, [selectedAssignment.id]: value }));
                }}
                onCheckOutNotesChange={(value) => {
                  if (!selectedAssignment) return;
                  setCheckOutNotesById((current) => ({ ...current, [selectedAssignment.id]: value }));
                }}
                onPennyBundleStatusChange={(value) => {
                  if (!selectedAssignment) return;
                  setPennyBundleStatusById((current) => ({ ...current, [selectedAssignment.id]: value }));
                }}
                onTrafficLevelChange={(value) => {
                  if (!selectedAssignment) return;
                  setTrafficById((current) => ({ ...current, [selectedAssignment.id]: value }));
                }}
                onEngagementScoreChange={(value) => {
                  if (!selectedAssignment) return;
                  setEngagementById((current) => ({ ...current, [selectedAssignment.id]: value }));
                }}
                onPassOffReasonChange={(value) => {
                  if (!selectedAssignment) return;
                  setPassOffReasonById((current) => ({ ...current, [selectedAssignment.id]: value }));
                }}
                onCheckIn={() => {
                  if (!selectedAssignment) return;
                  void handleCheckIn(selectedAssignment.id);
                }}
                onCheckOut={() => {
                  if (!selectedAssignment) return;
                  void handleCheckOut(selectedAssignment);
                }}
                onPassOff={() => {
                  if (!selectedAssignment) return;
                  void invokePatch({
                    action: 'pass_off',
                    assignmentId: selectedAssignment.id,
                    reason: selectedPassOffReason || 'BA requested reassignment',
                  }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to pass off assignment'));
                }}
                onArtifactUpload={(type, files) => {
                  if (!selectedAssignment) return;
                  void handleArtifactUpload(selectedAssignment.id, files, type);
                }}
              />
            </div>
          ) : null}

          {activeView === 'uploads' ? <VendorDayUploadsSection assignment={selectedAssignment} onArtifactUpload={(type, files) => (selectedAssignment ? void handleArtifactUpload(selectedAssignment.id, files, type) : undefined)} /> : null}

          {activeView === 'pay' ? (
            <VendorDayPaySection
              title="Payroll snapshot"
              description="Your running balance and the current pay-period batch pull from payroll records, not client-side estimates."
              assignmentsTracked={assignments.length}
              runningBalance={formatCurrency(currentWorkerBalance)}
              payTotal={formatCurrency(payTotal)}
              payroll={payroll}
              payrollLoading={payrollLoading}
              filterWorkerProfileId={payload?.viewerWorkerProfileId}
            />
          ) : null}

          {activeView === 'history' ? (
            <VendorDayHistorySection
              historyAssignments={historyAssignments}
              onSelectAssignment={(assignmentId) => {
                setSelectedAssignmentId(assignmentId);
                handleViewChange('uploads');
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          {activeView === 'requests' && canCreateRequests ? (
            <VendorDayRequestForm
              accounts={payload?.accounts ?? []}
              workers={payload?.workers ?? []}
              canDispatch={canDispatch}
              selectedAccountId={selectedAccountId}
              requestedStart={requestedStart}
              alternateStart={alternateStart}
              requestedDurationHours={requestedDurationHours}
              pennyBundleRequested={pennyBundleRequested}
              preferredWorkerProfileId={preferredWorkerProfileId}
              override60DayWindow={override60DayWindow}
              overrideReason={overrideReason}
              notes={notes}
              submitting={submitting}
              onSelectedAccountIdChange={setSelectedAccountId}
              onRequestedStartChange={setRequestedStart}
              onAlternateStartChange={setAlternateStart}
              onRequestedDurationHoursChange={setRequestedDurationHours}
              onPennyBundleRequestedChange={setPennyBundleRequested}
              onPreferredWorkerProfileIdChange={setPreferredWorkerProfileId}
              onOverride60DayWindowChange={setOverride60DayWindow}
              onOverrideReasonChange={setOverrideReason}
              onNotesChange={setNotes}
              onSubmit={(event) => void handleCreateRequest(event)}
            />
          ) : null}

          {activeView === 'queue' ? (
            <VendorDayQueueSection
              requests={requests}
              workers={payload?.workers ?? []}
              canApproveDuration={canApproveDuration}
              canDispatch={canDispatch}
              canMarkNoShow={canMarkNoShow}
              onApproveDurationOverride={(requestId) => void invokePatch({ action: 'approve_duration_override', requestId }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to approve duration override'))}
              onApproveRequest={(requestId) => void invokePatch({ action: 'approve_rep_request', requestId }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to approve request'))}
              onDispatch={(requestId) => void invokePatch({ action: 'dispatch', requestId }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to dispatch request'))}
              onMarkNoShow={(requestId) => void invokePatch({ action: 'mark_no_show', requestId }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Failed to mark no-show'))}
            />
          ) : null}

          {activeView === 'field' ? <VendorDayFieldBoard liveAssignments={liveAssignments} /> : null}

          {activeView === 'pay' ? (
            <VendorDayOpsPaySection title="Payroll overview" description="Current pay-period totals, disputed lines, and batch status." payroll={payroll} payrollLoading={payrollLoading} />
          ) : null}

          {activeView === 'history' ? (
            <VendorDayOpsHistorySection
              historyAssignments={historyAssignments}
              onSelectAssignment={(assignmentId) => {
                setSelectedAssignmentId(assignmentId);
                handleViewChange('uploads');
              }}
            />
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
    </WorkspacePage>
  );
}
