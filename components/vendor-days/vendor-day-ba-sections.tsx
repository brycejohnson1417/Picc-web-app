'use client';

import type { ReactNode } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import {
  type VendorDayArtifact,
  formatCurrency,
  formatDateTime,
  formatShortDate,
  readableStatus,
  requiredArtifactState,
  statusVariant,
  type PayrollOverview,
  type VendorDayAssignment,
  type VendorDayOffer,
} from './vendor-day-types';
import { MetricCard, SectionEmpty } from './vendor-day-primitives';

export function VendorDayOffersSection({
  openOffers,
  onAcceptOffer,
  onDeclineOffer,
}: {
  openOffers: Array<{ request: { account: { name: string; city: string | null; state: string | null }; requestedStart: string; requestedDurationHours: number; pennyBundleRequested: boolean }; offer: VendorDayOffer }>;
  onAcceptOffer: (offerId: string) => void;
  onDeclineOffer: (offerId: string) => void;
}) {
  return openOffers.length > 0 ? (
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
                <Button onClick={() => onAcceptOffer(offer.id)}>Accept</Button>
                <Button variant="outline" onClick={() => onDeclineOffer(offer.id)}>
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
  );
}

export function VendorDayTodaySection({
  todayAssignments,
  selectedAssignment,
  onSelectAssignment,
  renderAssignmentSummary,
}: {
  todayAssignments: VendorDayAssignment[];
  selectedAssignment: VendorDayAssignment | null;
  onSelectAssignment: (assignmentId: string) => void;
  renderAssignmentSummary: (assignment: VendorDayAssignment) => ReactNode;
}) {
  return (
    <Card className="border-[#d8d9de]">
      <CardHeader>
        <CardTitle>Today and next up</CardTitle>
        <CardDescription>Pick an assignment to open the detail panel, proof checklist, and day-of actions.</CardDescription>
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
              onClick={() => onSelectAssignment(assignment.id)}
              className={[
                'w-full rounded-[22px] border p-4 text-left transition',
                isSelected ? 'border-[#c9451f] bg-[#fff6f2] shadow-[0_10px_30px_rgba(201,69,31,0.12)]' : 'border-[#e0e4eb] bg-[#fbfcfe] hover:border-[#c8d4e8]',
              ].join(' ')}
            >
              {renderAssignmentSummary(assignment)}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>{proofState.hasCheckInPhoto ? 'Setup photo ready' : 'Setup photo needed'}</Badge>
                <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>{proofState.hasCheckOutPhoto ? 'End photo ready' : 'End photo needed'}</Badge>
                {proofState.requiresPosProof ? <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>{proofState.hasPosProof ? 'POS proof ready' : 'POS proof required'}</Badge> : null}
                {proofState.pendingArtifactSync ? <Badge variant="warning">Pending sync</Badge> : null}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function VendorDayAssignmentDetailSection({
  assignment,
  selectedArtifacts,
  checkInNotes,
  checkOutNotes,
  pennyBundleStatus,
  trafficLevel,
  engagementScore,
  passOffReason,
  onCheckInNotesChange,
  onCheckOutNotesChange,
  onPennyBundleStatusChange,
  onTrafficLevelChange,
  onEngagementScoreChange,
  onPassOffReasonChange,
  onCheckIn,
  onCheckOut,
  onPassOff,
  onArtifactUpload,
}: {
  assignment: VendorDayAssignment | null;
  selectedArtifacts: VendorDayArtifact[];
  checkInNotes: string;
  checkOutNotes: string;
  pennyBundleStatus: string;
  trafficLevel: string;
  engagementScore: string;
  passOffReason: string;
  onCheckInNotesChange: (value: string) => void;
  onCheckOutNotesChange: (value: string) => void;
  onPennyBundleStatusChange: (value: string) => void;
  onTrafficLevelChange: (value: string) => void;
  onEngagementScoreChange: (value: string) => void;
  onPassOffReasonChange: (value: string) => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onPassOff: () => void;
  onArtifactUpload: (type: 'CHECK_IN_PHOTO' | 'CHECK_OUT_PHOTO' | 'POS_REPORT', files: FileList | null) => void;
}) {
  if (!assignment) {
    return (
      <Card className="border-[#d8d9de]">
        <CardHeader>
          <CardTitle>Assignment detail</CardTitle>
          <CardDescription>The day-of execution flow stays here: arrival, proof, checkout, notes, and pass-off if needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <SectionEmpty title="Select an assignment" body="Choose an event from the left to open the exact check-in, upload, and checkout workflow for that store." />
        </CardContent>
      </Card>
    );
  }

  const proofState = requiredArtifactState(assignment);

  return (
    <Card className="border-[#d8d9de]">
      <CardHeader>
        <CardTitle>Assignment detail</CardTitle>
        <CardDescription>The day-of execution flow stays here: arrival, proof, checkout, notes, and pass-off if needed.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <div className="rounded-[24px] border border-[#dfe4eb] bg-[#fbfcfe] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</h3>
              <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
            </div>
            <p className="mt-2 text-sm text-[#5d6672]">
              {formatDateTime(assignment.scheduledStart)} to {formatDateTime(assignment.scheduledEnd)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">Event pay {formatCurrency(assignment.eventPayAmount)}</Badge>
              <Badge variant="outline">Travel pay {formatCurrency(assignment.travelPayAmount)}</Badge>
              {assignment.request?.pennyBundleRequested ? <Badge variant="warning">Penny Bundle required</Badge> : <Badge variant="secondary">No Penny Bundle</Badge>}
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
                  <div className="flex items-center justify-between rounded-xl border border-[#e4e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
                    <span>Setup photo</span>
                    <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>{proofState.hasCheckInPhoto ? 'Ready' : 'Needed'}</Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[#e4e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
                    <span>End photo</span>
                    <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>{proofState.hasCheckOutPhoto ? 'Ready' : 'Needed'}</Badge>
                  </div>
                  {proofState.requiresPosProof ? (
                    <div className="flex items-center justify-between rounded-xl border border-[#e4e8f0] bg-[#f8fafc] px-3 py-2 text-sm">
                      <span>POS proof</span>
                      <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>{proofState.hasPosProof ? 'Ready' : 'Required'}</Badge>
                    </div>
                  ) : null}
                  {proofState.pendingArtifactSync ? (
                    <div className="rounded-xl border border-[#f5d589] bg-[#fff8e6] px-3 py-2 text-sm text-[#9a6b00]">
                      Some artifacts are still queued locally and will sync when connectivity returns.
                    </div>
                  ) : null}
                  {selectedArtifacts.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedArtifacts.map((artifact) => (
                        <Badge key={artifact.id} variant={artifact.syncStatus === 'queued' ? 'warning' : 'secondary'}>
                          {artifact.originalName ?? artifact.type}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-[#dfe4eb] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Check in</CardTitle>
                  <CardDescription>Location is best-effort only. Use arrival notes if GPS is weak.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea value={checkInNotes} onChange={(event) => onCheckInNotesChange(event.target.value)} placeholder="Arrival notes, setup issues, store context" />
                  <Button className="w-full" variant="secondary" onClick={onCheckIn}>
                    {assignment.execution?.checkInAt ? 'Update Check-In' : 'Check In'}
                  </Button>
                  <p className="text-xs text-[#66707d]">
                    {assignment.execution?.checkInAt ? `Last check-in ${formatShortDate(assignment.execution.checkInAt)}` : 'No check-in recorded yet.'}
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
                    <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => onArtifactUpload('CHECK_IN_PHOTO', event.target.files)} />
                  </label>
                  <label className="block text-sm font-medium text-[#36404d]">
                    POS report or screenshot
                    <Input type="file" accept=".csv,.xls,.xlsx,.pdf,image/*" className="mt-1 h-auto py-2" onChange={(event) => onArtifactUpload('POS_REPORT', event.target.files)} />
                  </label>
                  <label className="block text-sm font-medium text-[#36404d]">
                    End photo
                    <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => onArtifactUpload('CHECK_OUT_PHOTO', event.target.files)} />
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
                  <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" value={pennyBundleStatus} onChange={(event) => onPennyBundleStatusChange(event.target.value)}>
                    <option>Not Offered</option>
                    <option>Offered</option>
                    <option>Accepted</option>
                    <option>Pending Credit</option>
                    <option>Completed</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" value={trafficLevel} onChange={(event) => onTrafficLevelChange(event.target.value)}>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                    <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" value={engagementScore} onChange={(event) => onEngagementScoreChange(event.target.value)}>
                      <option value="1">Engagement 1</option>
                      <option value="2">Engagement 2</option>
                      <option value="3">Engagement 3</option>
                      <option value="4">Engagement 4</option>
                      <option value="5">Engagement 5</option>
                    </select>
                  </div>
                  <Textarea value={checkOutNotes} onChange={(event) => onCheckOutNotesChange(event.target.value)} placeholder="Customer highlights, objections, missing displays, and restock callouts" />
                  <Button className="w-full" variant="outline" onClick={onCheckOut}>
                    {assignment.execution?.checkOutAt ? 'Update Check-Out' : 'Check Out'}
                  </Button>
                  <p className="text-xs text-[#66707d]">
                    {assignment.execution?.checkOutAt ? `Last checkout ${formatShortDate(assignment.execution.checkOutAt)}` : 'No checkout recorded yet.'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-[#eadfd8] bg-[#fff8f4] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-[#7c2d12]">Need a replacement?</CardTitle>
                  <CardDescription className="text-[#8c3e1f]">Pass-off is available before the cutoff window. After that, ops has to handle it manually.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input value={passOffReason} onChange={(event) => onPassOffReasonChange(event.target.value)} placeholder="Why do you need a replacement?" />
                  <Button variant="outline" className="w-full" onClick={onPassOff}>
                    Pass Off
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function VendorDayUploadsSection({
  assignment,
  onArtifactUpload,
}: {
  assignment: VendorDayAssignment | null;
  onArtifactUpload: (type: 'CHECK_IN_PHOTO' | 'CHECK_OUT_PHOTO' | 'POS_REPORT', files: FileList | null) => void;
}) {
  if (!assignment) {
    return <SectionEmpty title="Nothing to upload" body="Once you have a live or recent assignment, this screen becomes the fastest place to manage proof and sync status." />;
  }

  const proofState = requiredArtifactState(assignment);
  const selectedArtifacts = assignment.execution?.artifacts ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="border-[#d8d9de]">
        <CardHeader>
          <CardTitle>Focused event</CardTitle>
          <CardDescription>Choose the event that still needs proof or sync attention.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="w-full rounded-[20px] border border-[#c9451f] bg-[#fff6f2] p-3 text-left">
            <p className="font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
            <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={proofState.hasCheckInPhoto ? 'success' : 'secondary'}>Setup</Badge>
              <Badge variant={proofState.hasCheckOutPhoto ? 'success' : 'secondary'}>End</Badge>
              {proofState.requiresPosProof ? <Badge variant={proofState.hasPosProof ? 'success' : 'warning'}>POS</Badge> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#d8d9de]">
        <CardHeader>
          <CardTitle>Upload center</CardTitle>
          <CardDescription>Everything for proof, sync visibility, and manual review is attached here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[22px] border border-[#dfe4eb] bg-[#fbfcfe] p-4">
            <p className="text-lg font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
            <p className="mt-1 text-sm text-[#5d6672]">{formatDateTime(assignment.scheduledStart)}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium text-[#36404d]">
              Setup photo
              <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => onArtifactUpload('CHECK_IN_PHOTO', event.target.files)} />
            </label>
            <label className="block text-sm font-medium text-[#36404d]">
              POS report or screenshot
              <Input type="file" accept=".csv,.xls,.xlsx,.pdf,image/*" className="mt-1 h-auto py-2" onChange={(event) => onArtifactUpload('POS_REPORT', event.target.files)} />
            </label>
            <label className="block text-sm font-medium text-[#36404d]">
              End photo
              <Input type="file" accept="image/*" className="mt-1 h-auto py-2" onChange={(event) => onArtifactUpload('CHECK_OUT_PHOTO', event.target.files)} />
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
  );
}

export function VendorDayPaySection({
  title,
  description,
  assignmentsTracked,
  runningBalance,
  payTotal,
  payroll,
  payrollLoading,
  filterWorkerProfileId,
}: {
  title: string;
  description: string;
  assignmentsTracked: number;
  runningBalance: string;
  payTotal: string;
  payroll: PayrollOverview | null;
  payrollLoading: boolean;
  filterWorkerProfileId?: string | null;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="border-[#d8d9de]">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MetricCard label="Assignments tracked" value={assignmentsTracked} />
          <MetricCard label="Running balance" value={runningBalance} tone="warm" />
          <MetricCard label="Assignment estimate" value={payTotal} />
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
          {payroll?.currentBatch?.lineItems
            .filter((line) => !filterWorkerProfileId || line.workerProfile.id === filterWorkerProfileId)
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
  );
}

export function VendorDayHistorySection({
  historyAssignments,
  onSelectAssignment,
  sectionTitle = 'Event history',
  sectionDescription = 'Closed, completed, no-show, and passed-off events stay here with proof and payout context.',
}: {
  historyAssignments: VendorDayAssignment[];
  onSelectAssignment?: (assignmentId: string) => void;
  sectionTitle?: string;
  sectionDescription?: string;
}) {
  if (historyAssignments.length === 0) {
    return <SectionEmpty title="No history yet" body="Completed vendor days will roll into this screen automatically so ambassadors can verify proof and payout later." />;
  }

  return (
    <Card className="border-[#d8d9de]">
      <CardHeader>
        <CardTitle>{sectionTitle}</CardTitle>
        <CardDescription>{sectionDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {historyAssignments.map((assignment) => {
          const proofState = requiredArtifactState(assignment);
          return (
            <button
              key={assignment.id}
              type="button"
              onClick={() => onSelectAssignment?.(assignment.id)}
              className="rounded-[22px] border border-[#e0e4eb] bg-[#fbfcfe] p-4 text-left transition hover:border-[#c9d5e8]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-[#18212d]">{assignment.request?.account.name ?? 'Vendor day assignment'}</p>
                  <p className="mt-1 text-sm text-[#5d6672]">{formatShortDate(assignment.scheduledStart)}</p>
                </div>
                <div className="text-right">
                  <Badge variant={statusVariant(assignment.status)}>{readableStatus(assignment.status)}</Badge>
                  <p className="mt-2 text-sm font-medium text-[#18212d]">{formatCurrency(Number(assignment.eventPayAmount ?? 0) + Number(assignment.travelPayAmount ?? 0))}</p>
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
  );
}
