'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarConnectionProvider, CalendarConnectionStatus, NotificationCategory, WorkerSkillTier } from '@prisma/client';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { WorkspacePanel, WorkspacePanelHeader } from '@/components/layout/workspace-page';

type EmployerRecord = {
  id: string;
  name: string;
  isServiceCompany: boolean;
};

type WorkerRecord = {
  id: string;
  clerkUserId: string | null;
  email: string | null;
  displayName: string;
  phone: string | null;
  photoUrl: string | null;
  homeAddress: string | null;
  homeLat: number | null;
  homeLng: number | null;
  maxTravelMinutes: number;
  travelRadiusMiles: number | null;
  hasVehicle: boolean;
  vehicleType: string | null;
  employerId: string | null;
  employerName: string | null;
  tier: WorkerSkillTier;
  canAcceptOffers: boolean;
  notes: string | null;
  availabilityRules: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    timezone: string;
    active: boolean;
  }>;
  availabilityBlocks: Array<{
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
  calendarConnections: Array<{
    provider: CalendarConnectionProvider;
    status: CalendarConnectionStatus;
    calendarEmail: string | null;
    lastSuccessfulSyncAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
  }>;
  gearItems: Array<{
    name: string;
    quantity: number;
    notes: string | null;
    needsRestock: boolean;
  }>;
  certifications: Array<{
    code: string;
    label: string;
  }>;
  brandTrainings: Array<{
    brandName: string;
    level: string | null;
  }>;
  skillTags: Array<{
    tag: string;
    label: string | null;
  }>;
};

type NotificationPreferenceRecord = {
  category: NotificationCategory;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartMinute: number;
  quietHoursEndMinute: number;
  timezone: string;
};

type SupplyResponse = {
  viewerWorkerProfileId: string | null;
  employers: EmployerRecord[];
  workers: WorkerRecord[];
  notificationPreferences: NotificationPreferenceRecord[];
};

type DraftState = {
  displayName: string;
  phone: string;
  photoUrl: string;
  homeAddress: string;
  homeLat: string;
  homeLng: string;
  maxTravelMinutes: string;
  travelRadiusMiles: string;
  hasVehicle: boolean;
  vehicleType: string;
  employerId: string;
  employerName: string;
  tier: WorkerSkillTier;
  canAcceptOffers: boolean;
  notes: string;
  gearCsv: string;
  certificationCsv: string;
  brandCsv: string;
  skillCsv: string;
  availabilityRules: Array<{
    dayOfWeek: number;
    start: string;
    end: string;
    timezone: string;
    active: boolean;
  }>;
  availabilityBlocks: Array<{
    startsAt: string;
    endsAt: string;
    reason: string;
  }>;
  notificationPreferences: NotificationPreferenceRecord[];
  googleCalendarEmail: string;
  googleCalendarStatus: CalendarConnectionStatus;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toTimeString(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function fromTimeString(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function csvToRows(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function workerToDraft(worker: WorkerRecord | undefined, preferences: NotificationPreferenceRecord[]): DraftState {
  const googleConnection = worker?.calendarConnections.find((connection) => connection.provider === CalendarConnectionProvider.GOOGLE);
  return {
    displayName: worker?.displayName ?? '',
    phone: worker?.phone ?? '',
    photoUrl: worker?.photoUrl ?? '',
    homeAddress: worker?.homeAddress ?? '',
    homeLat: worker?.homeLat?.toString() ?? '',
    homeLng: worker?.homeLng?.toString() ?? '',
    maxTravelMinutes: worker?.maxTravelMinutes?.toString() ?? '60',
    travelRadiusMiles: worker?.travelRadiusMiles?.toString() ?? '',
    hasVehicle: worker?.hasVehicle ?? false,
    vehicleType: worker?.vehicleType ?? '',
    employerId: worker?.employerId ?? '',
    employerName: worker?.employerName ?? '',
    tier: worker?.tier ?? WorkerSkillTier.STANDARD,
    canAcceptOffers: worker?.canAcceptOffers ?? true,
    notes: worker?.notes ?? '',
    gearCsv: worker?.gearItems.map((item) => item.name).join(', ') ?? '',
    certificationCsv: worker?.certifications.map((item) => item.code).join(', ') ?? '',
    brandCsv: worker?.brandTrainings.map((item) => item.brandName).join(', ') ?? '',
    skillCsv: worker?.skillTags.map((item) => item.tag).join(', ') ?? '',
    availabilityRules:
      worker?.availabilityRules.length
        ? worker.availabilityRules.map((rule) => ({
            dayOfWeek: rule.dayOfWeek,
            start: toTimeString(rule.startMinute),
            end: toTimeString(rule.endMinute),
            timezone: rule.timezone,
            active: rule.active,
          }))
        : [{ dayOfWeek: 4, start: '12:00', end: '20:00', timezone: 'America/New_York', active: true }],
    availabilityBlocks: (worker?.availabilityBlocks ?? []).map((block) => ({
      startsAt: block.startsAt.slice(0, 16),
      endsAt: block.endsAt.slice(0, 16),
      reason: block.reason ?? '',
    })),
    notificationPreferences: preferences,
    googleCalendarEmail: googleConnection?.calendarEmail ?? worker?.email ?? '',
    googleCalendarStatus: googleConnection?.status ?? CalendarConnectionStatus.MANUAL_ONLY,
  };
}

export function WorkerSupplyPanel({ embedded = false }: { embedded?: boolean }) {
  const access = useAppAccess();
  const [payload, setPayload] = useState<SupplyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [draft, setDraft] = useState<DraftState | null>(null);

  const canManageAllWorkers = access.role === 'ADMIN' || access.role === 'OPS_TEAM';

  const loadSupply = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/settings/worker-supply', { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error ?? 'Failed to load worker supply');
    }
    setPayload(json);
    const nextWorkerId = selectedWorkerId || json.viewerWorkerProfileId || json.workers[0]?.id || '';
    setSelectedWorkerId(nextWorkerId);
    const selectedWorker = json.workers.find((worker: WorkerRecord) => worker.id === nextWorkerId) ?? json.workers[0];
    setDraft(workerToDraft(selectedWorker, json.notificationPreferences ?? []));
    setLoading(false);
  }, [selectedWorkerId]);

  useEffect(() => {
    void loadSupply().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Failed to load worker supply');
      setLoading(false);
    });
  }, [loadSupply]);

  const selectedWorker = useMemo(
    () => payload?.workers.find((worker) => worker.id === selectedWorkerId) ?? payload?.workers[0],
    [payload, selectedWorkerId],
  );

  useEffect(() => {
    if (!payload) return;
    const nextWorker = payload.workers.find((worker) => worker.id === selectedWorkerId) ?? payload.workers[0];
    if (!nextWorker) return;
    setDraft(workerToDraft(nextWorker, payload.notificationPreferences ?? []));
  }, [payload, selectedWorkerId]);

  if (loading) {
    return <div className={embedded ? 'rounded-[24px] border border-[#d6dbe4] bg-white px-4 py-6 text-sm text-[#666b75] shadow-[0_16px_40px_rgba(24,33,45,0.08)]' : 'border-t border-[#c7c8ce] bg-white px-4 py-6 text-sm text-[#666b75]'}>Loading worker supply settings…</div>;
  }

  if (!payload || !selectedWorker || !draft) {
    return <div className={embedded ? 'rounded-[24px] border border-[#d6dbe4] bg-white px-4 py-6 text-sm text-[#666b75] shadow-[0_16px_40px_rgba(24,33,45,0.08)]' : 'border-t border-[#c7c8ce] bg-white px-4 py-6 text-sm text-[#666b75]'}>No worker profile found yet.</div>;
  }

  async function saveProfile() {
    const currentWorker = selectedWorker!;
    const currentDraft = draft!;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings/worker-supply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          workerProfileId: currentWorker.id,
          displayName: currentDraft.displayName,
          phone: currentDraft.phone || null,
          photoUrl: currentDraft.photoUrl || null,
          homeAddress: currentDraft.homeAddress || null,
          homeLat: currentDraft.homeLat ? Number(currentDraft.homeLat) : null,
          homeLng: currentDraft.homeLng ? Number(currentDraft.homeLng) : null,
          maxTravelMinutes: Number(currentDraft.maxTravelMinutes || 60),
          travelRadiusMiles: currentDraft.travelRadiusMiles ? Number(currentDraft.travelRadiusMiles) : null,
          hasVehicle: currentDraft.hasVehicle,
          vehicleType: currentDraft.vehicleType || null,
          employerId: currentDraft.employerId || null,
          employerName: currentDraft.employerName || null,
          tier: currentDraft.tier,
          canAcceptOffers: currentDraft.canAcceptOffers,
          notes: currentDraft.notes || null,
          gearItems: csvToRows(currentDraft.gearCsv).map((name) => ({ name })),
          certifications: csvToRows(currentDraft.certificationCsv).map((code) => ({ code })),
          brandTrainings: csvToRows(currentDraft.brandCsv).map((brandName) => ({ brandName })),
          skillTags: csvToRows(currentDraft.skillCsv).map((tag) => ({ tag })),
          availabilityRules: currentDraft.availabilityRules.map((rule) => ({
            dayOfWeek: rule.dayOfWeek,
            startMinute: fromTimeString(rule.start),
            endMinute: fromTimeString(rule.end),
            timezone: rule.timezone,
            active: rule.active,
          })),
          availabilityBlocks: currentDraft.availabilityBlocks
            .filter((block) => block.startsAt && block.endsAt)
            .map((block) => ({
              startsAt: new Date(block.startsAt).toISOString(),
              endsAt: new Date(block.endsAt).toISOString(),
              reason: block.reason || null,
              source: 'manual',
            })),
          notificationPreferences: currentDraft.notificationPreferences,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? 'Failed to save worker supply');
      }

      const connectionResponse = await fetch('/api/settings/worker-supply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_calendar_connection',
          workerProfileId: currentWorker.id,
          provider: 'GOOGLE',
          calendarEmail: currentDraft.googleCalendarEmail || null,
          status: currentDraft.googleCalendarStatus,
          lastAttemptAt: new Date().toISOString(),
          lastSuccessfulSyncAt:
            currentDraft.googleCalendarStatus === CalendarConnectionStatus.ACTIVE ? new Date().toISOString() : null,
        }),
      });
      if (!connectionResponse.ok) {
        const json = await connectionResponse.json().catch(() => ({}));
        throw new Error(json.error ?? 'Failed to save calendar connection');
      }

      await loadSupply();
      setMessage('Worker supply settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save worker supply');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={embedded ? '' : 'space-y-4 border-t border-[#c7c8ce] bg-[#eef0f4] px-4 py-5'}>
      {embedded ? (
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            eyebrow="Supply system"
            title="Worker profile, availability, gear, and notification controls"
            description="Keep Brand Ambassador supply data current so dispatch can use proximity, availability, training, and readiness instead of guessing."
          />
          {message ? <div className="rounded-2xl border border-[#efd4c9] bg-[#fff3ee] px-4 py-3 text-[14px] text-[#a23b22]">{message}</div> : null}
          {canManageAllWorkers ? (
            <Card className="border-[#d6dae2]">
              <CardContent className="p-4">
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">Selected Worker</label>
                <select
                  className="h-11 w-full rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px] text-[#1d1f23]"
                  value={selectedWorkerId}
                  onChange={(event) => setSelectedWorkerId(event.target.value)}
                >
                  {payload.workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.displayName} {worker.email ? `· ${worker.email}` : ''}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          ) : null}
        </WorkspacePanel>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c93412]">Supply System</p>
            <h2 className="mt-1 text-[22px] font-semibold text-[#1d1f23]">Worker profile, availability, gear, and notification controls</h2>
            <p className="mt-1 text-[14px] text-[#666b75]">
              Keep Brand Ambassador supply data current so dispatch can use proximity, availability, training, and readiness instead of guessing.
            </p>
          </div>

          {message ? <div className="rounded-2xl border border-[#efd4c9] bg-[#fff3ee] px-4 py-3 text-[14px] text-[#a23b22]">{message}</div> : null}

          {canManageAllWorkers ? (
            <Card className="border-[#d6dae2]">
              <CardContent className="p-4">
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">Selected Worker</label>
                <select
                  className="h-11 w-full rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px] text-[#1d1f23]"
                  value={selectedWorkerId}
                  onChange={(event) => setSelectedWorkerId(event.target.value)}
                >
                  {payload.workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.displayName} {worker.email ? `· ${worker.email}` : ''}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-[#d6dae2]">
          <CardHeader>
            <CardTitle>Worker Profile</CardTitle>
            <CardDescription>Core dispatch identity, travel fit, and employer tagging.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="Display name" />
            <Input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Phone" />
            <Input value={draft.photoUrl} onChange={(event) => setDraft({ ...draft, photoUrl: event.target.value })} placeholder="Photo URL" />
            <Input value={draft.homeAddress} onChange={(event) => setDraft({ ...draft, homeAddress: event.target.value })} placeholder="Home address" />
            <div className="grid grid-cols-2 gap-3">
              <Input value={draft.homeLat} onChange={(event) => setDraft({ ...draft, homeLat: event.target.value })} placeholder="Home latitude" />
              <Input value={draft.homeLng} onChange={(event) => setDraft({ ...draft, homeLng: event.target.value })} placeholder="Home longitude" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input value={draft.maxTravelMinutes} onChange={(event) => setDraft({ ...draft, maxTravelMinutes: event.target.value })} placeholder="Max travel minutes" />
              <Input value={draft.travelRadiusMiles} onChange={(event) => setDraft({ ...draft, travelRadiusMiles: event.target.value })} placeholder="Travel radius miles" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                className="h-11 rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px] text-[#1d1f23]"
                value={draft.tier}
                onChange={(event) => setDraft({ ...draft, tier: event.target.value as WorkerSkillTier })}
              >
                <option value="TRAINEE">Trainee</option>
                <option value="STANDARD">Standard</option>
                <option value="ALL_STAR">All-Star</option>
              </select>
              <select
                className="h-11 rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px] text-[#1d1f23]"
                value={draft.employerId}
                onChange={(event) => setDraft({ ...draft, employerId: event.target.value })}
              >
                <option value="">Select employer</option>
                {payload.employers.map((employer) => (
                  <option key={employer.id} value={employer.id}>
                    {employer.name} {employer.isServiceCompany ? '· Service company' : ''}
                  </option>
                ))}
              </select>
            </div>
            <Input value={draft.employerName} onChange={(event) => setDraft({ ...draft, employerName: event.target.value })} placeholder="Employer name override / create new" />
            <label className="flex items-center gap-2 rounded-xl border border-[#d6dae2] bg-[#fafbfc] px-3 py-2 text-[14px] text-[#1d1f23]">
              <input type="checkbox" checked={draft.hasVehicle} onChange={(event) => setDraft({ ...draft, hasVehicle: event.target.checked })} />
              Has vehicle
            </label>
            <Input value={draft.vehicleType} onChange={(event) => setDraft({ ...draft, vehicleType: event.target.value })} placeholder="Vehicle type" />
            <label className="flex items-center gap-2 rounded-xl border border-[#d6dae2] bg-[#fafbfc] px-3 py-2 text-[14px] text-[#1d1f23]">
              <input type="checkbox" checked={draft.canAcceptOffers} onChange={(event) => setDraft({ ...draft, canAcceptOffers: event.target.checked })} />
              Can accept offers
            </label>
            <Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Notes for ops and dispatch" />
          </CardContent>
        </Card>

        <Card className="border-[#d6dae2]">
          <CardHeader>
            <CardTitle>Supply Details</CardTitle>
            <CardDescription>Comma-separated quick-edit fields for gear, certifications, training, and tags.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea value={draft.gearCsv} onChange={(event) => setDraft({ ...draft, gearCsv: event.target.value })} placeholder="Gear items, e.g. table, tablecloth, display hand" />
            <Textarea value={draft.certificationCsv} onChange={(event) => setDraft({ ...draft, certificationCsv: event.target.value })} placeholder="Certifications, e.g. PENNY_BUNDLE, OCM_TRAINING" />
            <Textarea value={draft.brandCsv} onChange={(event) => setDraft({ ...draft, brandCsv: event.target.value })} placeholder="Brands trained on" />
            <Textarea value={draft.skillCsv} onChange={(event) => setDraft({ ...draft, skillCsv: event.target.value })} placeholder="Skill tags, e.g. NYC, BILINGUAL, DISPLAY_SETUP" />
            <div className="flex flex-wrap gap-2">
              {csvToRows(draft.certificationCsv).map((item) => (
                <Badge key={item} variant="outline">{item}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-[#d6dae2]">
          <CardHeader>
            <CardTitle>Weekly Availability</CardTitle>
            <CardDescription>Manual recurring windows used when calendar sync is stale or unavailable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {draft.availabilityRules.map((rule, index) => (
              <div key={`${rule.dayOfWeek}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <select
                  className="h-10 rounded-xl border border-[#c9d0dc] bg-white px-3 text-[14px]"
                  value={rule.dayOfWeek}
                  onChange={(event) => {
                    const next = [...draft.availabilityRules];
                    next[index] = { ...rule, dayOfWeek: Number(event.target.value) };
                    setDraft({ ...draft, availabilityRules: next });
                  }}
                >
                  {dayLabels.map((label, dayIndex) => (
                    <option key={label} value={dayIndex}>
                      {label}
                    </option>
                  ))}
                </select>
                <Input
                  type="time"
                  value={rule.start}
                  onChange={(event) => {
                    const next = [...draft.availabilityRules];
                    next[index] = { ...rule, start: event.target.value };
                    setDraft({ ...draft, availabilityRules: next });
                  }}
                />
                <Input
                  type="time"
                  value={rule.end}
                  onChange={(event) => {
                    const next = [...draft.availabilityRules];
                    next[index] = { ...rule, end: event.target.value };
                    setDraft({ ...draft, availabilityRules: next });
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      availabilityRules: draft.availabilityRules.filter((_, rowIndex) => rowIndex !== index),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setDraft({
                  ...draft,
                  availabilityRules: [...draft.availabilityRules, { dayOfWeek: 5, start: '12:00', end: '20:00', timezone: 'America/New_York', active: true }],
                })
              }
            >
              Add Availability Window
            </Button>
          </CardContent>
        </Card>

        <Card className="border-[#d6dae2]">
          <CardHeader>
            <CardTitle>Calendar Sync And Blackouts</CardTitle>
            <CardDescription>Track Google Calendar sync health and one-off blackout periods.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={draft.googleCalendarEmail} onChange={(event) => setDraft({ ...draft, googleCalendarEmail: event.target.value })} placeholder="Google Calendar email" />
            <select
              className="h-11 w-full rounded-xl border border-[#c9d0dc] bg-white px-3 text-[15px]"
              value={draft.googleCalendarStatus}
              onChange={(event) => setDraft({ ...draft, googleCalendarStatus: event.target.value as CalendarConnectionStatus })}
            >
              <option value="ACTIVE">Active</option>
              <option value="STALE">Stale</option>
              <option value="ERROR">Error</option>
              <option value="REVOKED">Revoked</option>
              <option value="MANUAL_ONLY">Manual only</option>
            </select>
            {selectedWorker.calendarConnections.map((connection) => (
              <div key={connection.provider} className="rounded-xl border border-[#d9dee7] bg-[#fafbfc] px-3 py-2 text-[13px] text-[#4f5661]">
                <p className="font-semibold text-[#1d1f23]">{connection.provider} · {connection.status.replaceAll('_', ' ')}</p>
                <p>Last successful sync: {connection.lastSuccessfulSyncAt ? new Date(connection.lastSuccessfulSyncAt).toLocaleString() : '—'}</p>
                {connection.lastError ? <p className="text-[#a23b22]">{connection.lastError}</p> : null}
              </div>
            ))}
            {draft.availabilityBlocks.map((block, index) => (
              <div key={`${block.startsAt}-${index}`} className="grid gap-2 rounded-xl border border-[#d9dee7] bg-[#fafbfc] p-3">
                <Input type="datetime-local" value={block.startsAt} onChange={(event) => {
                  const next = [...draft.availabilityBlocks];
                  next[index] = { ...block, startsAt: event.target.value };
                  setDraft({ ...draft, availabilityBlocks: next });
                }} />
                <Input type="datetime-local" value={block.endsAt} onChange={(event) => {
                  const next = [...draft.availabilityBlocks];
                  next[index] = { ...block, endsAt: event.target.value };
                  setDraft({ ...draft, availabilityBlocks: next });
                }} />
                <Input value={block.reason} onChange={(event) => {
                  const next = [...draft.availabilityBlocks];
                  next[index] = { ...block, reason: event.target.value };
                  setDraft({ ...draft, availabilityBlocks: next });
                }} placeholder="Reason" />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setDraft({
                  ...draft,
                  availabilityBlocks: [...draft.availabilityBlocks, { startsAt: '', endsAt: '', reason: '' }],
                })
              }
            >
              Add Blackout Block
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#d6dae2]">
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Per-category email controls with quiet-hours defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.notificationPreferences.map((preference, index) => (
            <div key={preference.category} className="rounded-xl border border-[#d9dee7] bg-white px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-[#1d1f23]">{preference.category.replaceAll('_', ' ')}</p>
                  <p className="text-[12px] text-[#66707d]">{preference.timezone} · quiet hours {toTimeString(preference.quietHoursStartMinute)}–{toTimeString(preference.quietHoursEndMinute)}</p>
                </div>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 text-[13px] text-[#1d1f23]">
                    <input
                      type="checkbox"
                      checked={preference.emailEnabled}
                      onChange={(event) => {
                        const next = [...draft.notificationPreferences];
                        next[index] = { ...preference, emailEnabled: event.target.checked };
                        setDraft({ ...draft, notificationPreferences: next });
                      }}
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-[#1d1f23]">
                    <input
                      type="checkbox"
                      checked={preference.inAppEnabled}
                      onChange={(event) => {
                        const next = [...draft.notificationPreferences];
                        next[index] = { ...preference, inAppEnabled: event.target.checked };
                        setDraft({ ...draft, notificationPreferences: next });
                      }}
                    />
                    In-app
                  </label>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="pb-6">
        <Button type="button" className="h-11 w-full bg-[#cd3814] text-white hover:bg-[#b62f10]" disabled={saving} onClick={() => void saveProfile()}>
          {saving ? 'Saving worker supply…' : 'Save Worker Supply Settings'}
        </Button>
      </div>
    </div>
  );
}
