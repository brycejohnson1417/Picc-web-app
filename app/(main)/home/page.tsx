import Link from 'next/link';
import { Role } from '@prisma/client';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { getCalendarSyncHealth } from '@/lib/server/calendar-sync-health';
import { getNabisSyncFreshness } from '@/lib/server/nabis-sync';

function monthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function calendarStatusLabel(mode: 'healthy' | 'stale' | 'manual-only') {
  if (mode === 'healthy') return 'Healthy';
  if (mode === 'stale') return 'Stale';
  return 'Manual only';
}

type QuickCard = {
  href: string;
  title: string;
  body: string;
};

function actionForRole(role: Role) {
  if (role === Role.BRAND_AMBASSADOR) {
    return {
      primary: { href: '/vendor-days?view=today', label: 'Open Today' },
      secondary: { href: '/vendor-days?view=offers', label: 'View Offers' },
    };
  }

  if (role === Role.ADMIN || role === Role.OPS_TEAM || role === Role.FINANCE) {
    return {
      primary: { href: '/vendor-days?view=queue', label: 'Open Queue' },
      secondary: { href: '/dashboard', label: 'Open Dashboard' },
    };
  }

  return {
    primary: { href: '/vendor-days?view=queue', label: 'Open Queue' },
    secondary: { href: '/accounts', label: 'Review Accounts' },
  };
}

function cardsForRole(role: Role): QuickCard[] {
  if (role === Role.BRAND_AMBASSADOR) {
    return [
      { href: '/vendor-days?view=offers', title: 'Offers', body: 'Review open offers and accept or decline without hunting for settings.' },
      { href: '/vendor-days?view=today', title: 'Today', body: 'See today’s assignments, store context, and what is coming next.' },
      { href: '/vendor-days?view=today', title: 'Check In / Out', body: 'Open the focused assignment detail and run arrival, proof, and checkout from one screen.' },
      { href: '/vendor-days?view=uploads', title: 'Uploads', body: 'Add setup photos, POS proof, and recap files in one place.' },
      { href: '/vendor-days?view=pay', title: 'Pay', body: 'Check your running balance and completed event pay status.' },
      { href: '/vendor-days?view=history', title: 'History', body: 'Review completed vendor days, recaps, and prior field activity.' },
    ];
  }

  if (role === Role.ADMIN || role === Role.OPS_TEAM || role === Role.FINANCE) {
    return [
      { href: '/dashboard', title: 'Dashboard', body: 'Monitor synced Nabis order activity and freshness from local Postgres data.' },
      { href: '/vendor-days?view=queue', title: 'Vendor Days', body: 'Review the queue, archive, and execution records in one place.' },
      { href: '/accounts', title: 'Accounts', body: 'Inspect CRM-linked stores, sync coverage, and downstream account context.' },
      { href: '/reports', title: 'Reports', body: 'Review ROI, pay, utilization, and settlement summaries without leaving the app.' },
    ];
  }

  return [
    { href: '/vendor-days?view=queue', title: 'Approvals', body: 'Review vendor-day requests, approvals, and dispatch decisions from the queue.' },
    { href: '/accounts', title: 'Accounts', body: 'Work through dispensary context, notes, and relationship follow-up.' },
    { href: '/route', title: 'Route', body: 'See territory routing and the next stops that matter most today.' },
    { href: '/dashboard', title: 'Dashboard', body: 'Check recent order velocity, account activity, and overall territory signal.' },
  ];
}

export default async function HomePage() {
  const { orgId, userId } = await requireWorkspaceContext();
  const [membership, accountCount, vendorDayCount, monthlyOrderCount, freshness, liveAssignments] = await Promise.all([
    prisma.membership.findUnique({
      where: {
        orgId_clerkUserId: {
          orgId,
          clerkUserId: userId,
        },
      },
      select: {
        role: true,
      },
    }),
    prisma.account.count({ where: { orgId } }),
    prisma.vendorDayEvent.count({
      where: {
        orgId,
        status: {
          not: 'COMPLETED',
        },
      },
    }),
    prisma.nabisOrder.count({
      where: {
        orgId,
        orderCreatedDate: {
          gte: monthStartUtc(),
        },
      },
    }),
    getNabisSyncFreshness(orgId),
    prisma.vendorDayAssignment.findMany({
      where: {
        orgId,
        status: {
          in: ['ASSIGNED', 'CHECKED_IN', 'CHECKED_OUT', 'EXCEPTION', 'DISPUTED'],
        },
      },
      include: {
        workerProfile: {
          select: {
            displayName: true,
          },
        },
        request: {
          include: {
            account: {
              select: {
                name: true,
                city: true,
                state: true,
              },
            },
          },
        },
        execution: {
          select: {
            checkInAt: true,
            pennyBundleStatus: true,
          },
        },
      },
      orderBy: [{ scheduledStart: 'asc' }],
      take: 12,
    }),
  ]);

  const role = membership?.role ?? Role.SALES_REP;
  const showCalendarHealth = role === Role.ADMIN || role === Role.OPS_TEAM || role === Role.FINANCE;
  const calendarHealth = showCalendarHealth ? await getCalendarSyncHealth(orgId) : null;
  const quickCards = cardsForRole(role);
  const roleAction = actionForRole(role);
  const isAmbassador = role === Role.BRAND_AMBASSADOR;
  const heroMetrics = isAmbassador
    ? [
        { label: 'Vendor Days', value: vendorDayCount },
        { label: 'Live Assignments', value: liveAssignments.length },
        { label: 'Orders This Month', value: monthlyOrderCount },
      ]
    : [
        { label: 'Accounts', value: accountCount },
        { label: 'Open Vendor Days', value: vendorDayCount },
        { label: 'Orders This Month', value: monthlyOrderCount },
      ];

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)] px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-[var(--app-shell-max)] flex-col gap-5">
        <section className="overflow-hidden rounded-[28px] border border-[#d6dbe4] bg-[linear-gradient(135deg,#16202b_0%,#1d5eea_58%,#4f86f3_100%)] p-5 text-white shadow-[0_24px_60px_rgba(24,33,45,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Internal Platform</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight">
            {isAmbassador ? 'Start with the day-of flow.' : 'Run the internal platform from one place.'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            {isAmbassador
              ? 'Offers, today, check-in, checkout, uploads, pay, and history are surfaced before anything else so BAs can work the day without hunting through settings.'
              : 'The app reads Nabis data from local sync tables first, keeps the CRM keyed on Licensed Location ID, and surfaces the highest-signal actions without burying them in settings screens.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={roleAction.primary.href}
              className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#18212d] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-[#f5f7fb]"
            >
              {roleAction.primary.label}
            </Link>
            <Link
              href={roleAction.secondary.href}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
            >
              {roleAction.secondary.label}
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {heroMetrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[24px] border border-[#d6dbe4] bg-white p-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7583]">Priority Surfaces</p>
                <h2 className="mt-1 text-xl font-semibold text-[#18212d]">
                  {isAmbassador ? 'Field execution comes first.' : 'Start with the screens you actually use.'}
                </h2>
              </div>
            </div>
            <div className={isAmbassador ? 'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'mt-4 grid grid-cols-1 gap-3'}>
              {quickCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="rounded-[20px] border border-[#dce2eb] bg-[#f8fafc] p-4 transition hover:border-[#9db8f7] hover:bg-[#f2f7ff]"
                >
                  <p className="text-base font-semibold text-[#18212d]">{card.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[#5c6674]">{card.body}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#d6dbe4] bg-white p-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7583]">Sync Health</p>
            <h2 className="mt-1 text-xl font-semibold text-[#18212d]">Nabis and CRM freshness</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="text-sm font-medium text-[#18212d]">Retailer sync</p>
                <p className="mt-1 text-sm text-[#5c6674]">{formatTimestamp(freshness.lastRetailerSyncAt)}</p>
              </div>
              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="text-sm font-medium text-[#18212d]">Order sync</p>
                <p className="mt-1 text-sm text-[#5c6674]">{formatTimestamp(freshness.lastOrderSyncAt)}</p>
              </div>
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="text-sm font-medium text-[#18212d]">Reconciliation</p>
              <p className="mt-1 text-sm text-[#5c6674]">{formatTimestamp(freshness.lastReconciliationAt)}</p>
            </div>
          </div>
          {calendarHealth ? (
            <div className="mt-4 rounded-2xl border border-[#dbe3ef] bg-[#f7fbff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7583]">Calendar Sync</p>
                  <h3 className="mt-1 text-base font-semibold text-[#18212d]">Worker availability sync health</h3>
                </div>
                <span
                  className={[
                    'rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
                    calendarHealth.mode === 'healthy'
                      ? 'border-[#a7dfc5] bg-[#edf9f3] text-[#1e7c49]'
                      : calendarHealth.mode === 'stale'
                        ? 'border-[#f0d38a] bg-[#fff8e6] text-[#9a6b00]'
                        : 'border-[#f3b4b4] bg-[#fff0f0] text-[#b23838]',
                  ].join(' ')}
                >
                  {calendarStatusLabel(calendarHealth.mode)}
                </span>
              </div>
              <div className="mt-3 space-y-2 text-sm text-[#5c6674]">
                <p>{calendarHealth.staleWarning ?? calendarHealth.manualOnlyReason ?? 'Calendar sync is current.'}</p>
                <p>Active workers: {calendarHealth.activeWorkerCount}</p>
                <p>Tracked sources: {calendarHealth.sourceCount}</p>
                <p>Last successful sync: {formatTimestamp(calendarHealth.lastSuccessfulSyncAt)}</p>
              </div>
            </div>
          ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[#d6dbe4] bg-white p-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7583]">Live Status Board</p>
              <h2 className="mt-1 text-xl font-semibold text-[#18212d]">Who is out in the field right now</h2>
            </div>
            <Link href={isAmbassador ? '/vendor-days?view=today' : '/vendor-days?view=queue'} className="text-sm font-medium text-[#1d5eea]">
              Open vendor days
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {liveAssignments.length === 0 ? (
              <div className="rounded-2xl border border-[#dce2eb] bg-[#f8fafc] p-4 text-sm text-[#5c6674]">
                No live assignments yet.
              </div>
            ) : null}
            {liveAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-2xl border border-[#dce2eb] bg-[#f8fafc] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[#18212d]">{assignment.request.account.name}</p>
                  <span className="rounded-full border border-[#d7dbe4] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#304153]">
                    {assignment.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#5c6674]">
                  {assignment.workerProfile.displayName} · {assignment.request.account.city ?? '—'}, {assignment.request.account.state ?? '—'}
                </p>
                <p className="mt-1 text-sm text-[#5c6674]">
                  {assignment.execution?.checkInAt ? `Checked in ${new Date(assignment.execution.checkInAt).toLocaleTimeString()}` : 'Not checked in yet'}
                </p>
                <p className="mt-1 text-xs text-[#66707d]">
                  Penny Bundle: {assignment.execution?.pennyBundleStatus ?? (assignment.request.pennyBundleRequested ? 'Requested' : 'Not offered')}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
