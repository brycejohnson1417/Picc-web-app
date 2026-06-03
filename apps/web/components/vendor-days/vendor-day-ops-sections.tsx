'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import {
  formatCurrency,
  formatDateTime,
  formatShortDate,
  readableStatus,
  requiredArtifactState,
  statusVariant,
  type PayrollOverview,
  type VendorDayAccount,
  type VendorDayAssignment,
  type VendorDayRequest,
  type WorkerProfile,
} from './vendor-day-types';
import { SectionEmpty } from './vendor-day-primitives';

export function VendorDayRequestForm({
  accounts,
  workers,
  canDispatch,
  selectedAccountId,
  requestedStart,
  alternateStart,
  requestedDurationHours,
  pennyBundleRequested,
  preferredWorkerProfileId,
  override60DayWindow,
  overrideReason,
  notes,
  submitting,
  onSelectedAccountIdChange,
  onRequestedStartChange,
  onAlternateStartChange,
  onRequestedDurationHoursChange,
  onPennyBundleRequestedChange,
  onPreferredWorkerProfileIdChange,
  onOverride60DayWindowChange,
  onOverrideReasonChange,
  onNotesChange,
  onSubmit,
}: {
  accounts: VendorDayAccount[];
  workers: WorkerProfile[];
  canDispatch: boolean;
  selectedAccountId: string;
  requestedStart: string;
  alternateStart: string;
  requestedDurationHours: string;
  pennyBundleRequested: boolean;
  preferredWorkerProfileId: string;
  override60DayWindow: boolean;
  overrideReason: string;
  notes: string;
  submitting: boolean;
  onSelectedAccountIdChange: (value: string) => void;
  onRequestedStartChange: (value: string) => void;
  onAlternateStartChange: (value: string) => void;
  onRequestedDurationHoursChange: (value: string) => void;
  onPennyBundleRequestedChange: (value: boolean) => void;
  onPreferredWorkerProfileIdChange: (value: string) => void;
  onOverride60DayWindowChange: (value: boolean) => void;
  onOverrideReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Card className="border-[#d8d9de]">
      <CardHeader>
        <CardTitle>Create vendor-day request</CardTitle>
        <CardDescription>Use a one-time cooldown override when needed. Four-hour vendor days stay blocked until admin approval.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Store</label>
            <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" value={selectedAccountId} onChange={(event) => onSelectedAccountIdChange(event.target.value)}>
              <option value="">Select a store</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} {account.city ? `· ${account.city}, ${account.state ?? ''}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Preferred start</label>
            <Input type="datetime-local" value={requestedStart} onChange={(event) => onRequestedStartChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Alternate start</label>
            <Input type="datetime-local" value={alternateStart} onChange={(event) => onAlternateStartChange(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Duration</label>
            <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" value={requestedDurationHours} onChange={(event) => onRequestedDurationHoursChange(event.target.value)}>
              <option value="3">3 hours</option>
              <option value="4">4 hours (admin approval required)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Penny Bundle</label>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3">
              <input type="checkbox" checked={pennyBundleRequested} onChange={(event) => onPennyBundleRequestedChange(event.target.checked)} />
              Request Penny Bundle support
            </label>
          </div>
          {canDispatch ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Preferred BA</label>
              <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" value={preferredWorkerProfileId} onChange={(event) => onPreferredWorkerProfileIdChange(event.target.value)}>
                <option value="">Best-fit worker</option>
                {workers.map((worker) => (
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
                  <input type="checkbox" checked={override60DayWindow} onChange={(event) => onOverride60DayWindowChange(event.target.checked)} />
                  Override 60-Day Window
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Override reason</label>
                <Input value={overrideReason} onChange={(event) => onOverrideReasonChange(event.target.value)} placeholder="Required when cooldown override is used" />
              </div>
            </>
          ) : null}
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <Textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="What should the BA or rep know?" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Request'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function VendorDayQueueSection({
  requests,
  workers,
  canApproveDuration,
  canDispatch,
  canMarkNoShow,
  onApproveDurationOverride,
  onApproveRequest,
  onDispatch,
  onMarkNoShow,
}: {
  requests: VendorDayRequest[];
  workers: WorkerProfile[];
  canApproveDuration: boolean;
  canDispatch: boolean;
  canMarkNoShow: boolean;
  onApproveDurationOverride: (requestId: string) => void;
  onApproveRequest: (requestId: string) => void;
  onDispatch: (requestId: string) => void;
  onMarkNoShow: (requestId: string) => void;
}) {
  return (
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
                  {request.notionArchiveUrl ? (
                    <p className="mt-2">
                      <Link href={request.notionArchiveUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#3659b0] hover:underline">
                        Open Notion vendor-day archive
                      </Link>
                    </p>
                  ) : null}
                  {request.status === 'AWAITING_REP_APPROVAL' ? <p className="mt-2 text-sm text-[#4a5260]">Rep approval is required before dispatch can open concurrent BA offers.</p> : null}
                  {activeAssignment ? (
                    <p className="mt-2 text-sm text-[#4a5260]">
                      Assigned to <strong>{workers.find((worker) => worker.id === activeAssignment.workerProfileId)?.displayName ?? 'Unassigned'}</strong>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApproveDuration && request.requiresAdminApproval && !request.approvedAt ? (
                    <Button variant="secondary" onClick={() => onApproveDurationOverride(request.id)}>
                      Approve 4 Hours
                    </Button>
                  ) : null}
                  {canDispatch && request.status === 'AWAITING_REP_APPROVAL' ? (
                    <Button variant="secondary" onClick={() => onApproveRequest(request.id)}>
                      Approve Request
                    </Button>
                  ) : null}
                  {canDispatch && ['READY_FOR_DISPATCH', 'PASSED_OFF', 'EXCEPTION'].includes(request.status) ? (
                    <Button onClick={() => onDispatch(request.id)}>Open Concurrent Offers</Button>
                  ) : null}
                  {canMarkNoShow && request.status === 'ASSIGNED' ? (
                    <Button variant="outline" onClick={() => onMarkNoShow(request.id)}>
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
  );
}

export function VendorDayFieldBoard({
  liveAssignments,
}: {
  liveAssignments: VendorDayAssignment[];
}) {
  return (
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
              {assignment.notionArchiveUrl ? (
                <p className="mt-2">
                  <Link href={assignment.notionArchiveUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#3659b0] hover:underline">
                    Open Notion archive
                  </Link>
                </p>
              ) : null}
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
  );
}

export function VendorDayOpsPaySection({
  title,
  description,
  payroll,
  payrollLoading,
}: {
  title: string;
  description: string;
  payroll: PayrollOverview | null;
  payrollLoading: boolean;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
      <Card className="border-[#d8d9de]">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-[#e3e7ef] bg-[#f8fafc] p-4 text-sm text-[#5d6672]">
            {payrollLoading ? 'Loading payroll data…' : payroll?.currentBatch ? `Current batch closes ${formatShortDate(payroll.currentBatch.endsOn)}.` : 'No payroll batch yet.'}
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
  );
}

export function VendorDayOpsHistorySection({
  historyAssignments,
  onSelectAssignment,
}: {
  historyAssignments: VendorDayAssignment[];
  onSelectAssignment?: (assignmentId: string) => void;
}) {
  if (historyAssignments.length === 0) {
    return <SectionEmpty title="No history yet" body="Completed and closed vendor days will stay here for review, reporting, and downstream settlement." />;
  }

  return (
    <Card className="border-[#d8d9de]">
      <CardHeader>
        <CardTitle>Assignment archive</CardTitle>
        <CardDescription>Recent event history with proof and status context.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {historyAssignments.map((assignment) => {
          const proofState = requiredArtifactState(assignment);
          return (
            <button
              key={assignment.id}
              type="button"
              onClick={() => onSelectAssignment?.(assignment.id)}
              className="rounded-[22px] border border-[#e0e4eb] bg-[#fbfcfe] p-4 text-left transition hover:border-[#c9d5e8]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
              </div>
              <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
              {assignment.notionArchiveUrl ? (
                <p className="mt-2">
                  <Link href={assignment.notionArchiveUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#3659b0] hover:underline">
                    Open Notion archive
                  </Link>
                </p>
              ) : null}
              <p className="mt-2 text-sm text-[#5d6672]">{formatCurrency(Number(assignment.eventPayAmount ?? 0) + Number(assignment.travelPayAmount ?? 0))}</p>
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
  );
}
