import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { Role } from '@prisma/client';
import { FollowUpActionBoard, type HomeFollowUpItem } from '@/components/home/follow-up-action-board';
import { HotLeadsBoard, type HomeHotLeadItem } from '@/components/home/hot-leads-board';
import { PreferredPartnerRepChart } from '@/components/home/preferred-partner-rep-chart';
import { WorkspaceHero, WorkspacePage, WorkspaceSection } from '@/components/layout/workspace-page';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { AUTH_BYPASS_MODE } from '@/lib/config/runtime';
import { prisma } from '@/lib/db/prisma';
import { getCalendarSyncHealth } from '@/lib/server/calendar-sync-health';
import { getNabisSyncFreshness } from '@/lib/server/nabis-sync';
import { loadTerritoryStores } from '@/lib/server/notion-territory';
import { preferredPartnerRepBreakdown } from '@/lib/territory/preferred-partner';

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

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || '';
}

function normalizeStoreKey(value: string | null | undefined) {
  return value?.replace(/-/g, '').trim().toLowerCase() || '';
}

type HomeAction = {
  title: string;
  description: string;
  href: string;
  label: string;
};

type HomeSupportLink = {
  href: string;
  label: string;
};

function buildSupportLinks(role: Role): HomeSupportLink[] {
  if (role === Role.ADMIN || role === Role.OPS_TEAM || role === Role.FINANCE) {
    return [
      { href: '/dashboard', label: 'Open Dashboard' },
      { href: '/settings', label: 'Open Settings' },
    ];
  }

  return [
    { href: '/accounts', label: 'Work Accounts' },
    { href: '/route', label: 'Open Route' },
  ];
}

export default async function HomePage() {
  const { orgId, userId } = await requireWorkspaceContext();
  const [membership, freshness, monthlyOrderCount, viewer] = await Promise.all([
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
    getNabisSyncFreshness(orgId),
    prisma.nabisOrder.count({
      where: {
        orgId,
        orderCreatedDate: {
          gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)),
        },
      },
    }),
    AUTH_BYPASS_MODE ? Promise.resolve(null) : currentUser(),
  ]);

  const role = membership?.role ?? Role.SALES_REP;
  const showCalendarHealth = role === Role.ADMIN || role === Role.OPS_TEAM || role === Role.FINANCE;
  const viewerEmail = normalizeEmail(
    viewer?.primaryEmailAddress?.emailAddress ?? viewer?.emailAddresses?.[0]?.emailAddress ?? '',
  );
  const viewerHasAdminOverride = role === Role.ADMIN && viewerEmail === 'bryce@piccplatform.com';

  const [calendarHealth] = await Promise.all([
    showCalendarHealth ? getCalendarSyncHealth(orgId) : Promise.resolve(null),
  ]);

  const supportLinks = buildSupportLinks(role);

  const primaryAction: HomeAction = role === Role.ADMIN || role === Role.OPS_TEAM || role === Role.FINANCE
      ? {
          title: 'Open the dashboard',
          description: 'Start with Nabis sync health, account coverage, and sales signals.',
          href: '/dashboard',
          label: 'Open Dashboard',
        }
      : {
          title: 'Work active accounts',
          description: 'Start with assigned accounts, route planning, and the follow-ups that need attention.',
          href: '/accounts',
          label: 'Open Accounts',
        };

  const freshnessTiles = [
    {
      title: 'Retailer sync',
      value: formatTimestamp(freshness.lastRetailerSyncAt),
      description: 'Latest Nabis retailer snapshot stored locally.',
    },
    {
      title: 'Order sync',
      value: formatTimestamp(freshness.lastOrderSyncAt),
      description: 'Recent order data available from cached sync tables.',
    },
  ];

  if (calendarHealth) {
    freshnessTiles.push({
      title: 'Calendar sync',
      value: calendarStatusLabel(calendarHealth.mode),
      description: calendarHealth.staleWarning ?? calendarHealth.manualOnlyReason ?? 'Availability sync is current.',
    });
  }

  const territoryResponse = await loadTerritoryStores({
    preferredPartnerFilter: 'all',
  }).catch(() => null);

  const preferredPartnerSummary = territoryResponse
    ? preferredPartnerRepBreakdown(territoryResponse.stores)
    : null;

  const followUpItems: HomeFollowUpItem[] = [];
  const hotLeadItems: HomeHotLeadItem[] = [];
  let followUpRepFilterOptions: Array<{ value: string; label: string }> = [];
  let hotLeadRepFilterOptions: Array<{ value: string; label: string }> = [];
  let defaultFollowUpFilter = 'all';

  if (territoryResponse) {
    const authoredStores = viewerEmail
      ? await Promise.all([
          prisma.checkIn.findMany({
            where: {
              orgId,
              createdByEmail: {
                equals: viewerEmail,
                mode: 'insensitive',
              },
            },
            select: {
              storeId: true,
            },
          }),
          prisma.territoryCheckInMirror.findMany({
            where: {
              orgId,
              createdByEmail: {
                equals: viewerEmail,
                mode: 'insensitive',
              },
            },
            select: {
              storeId: true,
              notionPageId: true,
            },
          }),
        ])
      : [[], []] as const;

    const authoredStoreKeys = new Set<string>();
    const hotLeadRepCountByName = new Map<string, number>();
    for (const row of authoredStores[0]) {
      authoredStoreKeys.add(normalizeStoreKey(row.storeId));
    }
    for (const row of authoredStores[1]) {
      authoredStoreKeys.add(normalizeStoreKey(row.storeId));
      authoredStoreKeys.add(normalizeStoreKey(row.notionPageId));
    }

    const repCountByName = new Map<string, number>();
    for (const store of territoryResponse.stores) {
      const repNames = store.repNames.length > 0 ? store.repNames : ['Unassigned'];

      if (store.statusKey === 'lead - hot') {
        for (const repName of repNames) {
          hotLeadRepCountByName.set(repName, (hotLeadRepCountByName.get(repName) ?? 0) + 1);
        }

        hotLeadItems.push({
          id: store.id,
          name: store.name,
          locationAddress: store.locationAddress ?? store.locationLabel ?? null,
          repNames,
          lastSampleDate: store.lastSampleDeliveryDate ?? store.lastSampleOrderDate ?? null,
        });
      }

      if (!store.followUpNeeded) {
        continue;
      }

      const repEmails = store.repEmails.map((value) => normalizeEmail(value)).filter(Boolean);
      const assignedToViewer = viewerEmail ? repEmails.includes(viewerEmail) : false;
      const authoredByViewer =
        authoredStoreKeys.has(normalizeStoreKey(store.id)) ||
        authoredStoreKeys.has(normalizeStoreKey(store.notionPageId));
      const mine = assignedToViewer || authoredByViewer;

      for (const repName of repNames) {
        repCountByName.set(repName, (repCountByName.get(repName) ?? 0) + 1);
      }

      followUpItems.push({
        id: store.id,
        name: store.name,
        locationAddress: store.locationAddress ?? store.locationLabel ?? null,
        repNames,
        status: store.status,
        followUpDate: store.followUpDate ?? null,
        followUpReason: store.followUpReason ?? null,
        lastCheckIn: store.lastCheckIn ?? null,
        mine,
        authoredByViewer,
      });
    }

    const mineCount = followUpItems.filter((item) => item.mine).length;
    defaultFollowUpFilter = mineCount > 0 ? 'mine' : 'all';
    followUpRepFilterOptions = [
      { value: 'mine', label: `My Follow-Ups (${mineCount})` },
      { value: 'all', label: `All Reps (${followUpItems.length})` },
      ...[...repCountByName.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([value, count]) => ({
          value,
          label: `${value} (${count})`,
        })),
    ];
    hotLeadRepFilterOptions = [
      { value: 'all', label: `All Reps (${hotLeadItems.length})` },
      ...[...hotLeadRepCountByName.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([value, count]) => ({
          value,
          label: `${value} (${count})`,
        })),
    ];
  }

  const heroMetrics = [
    { label: 'Orders This Month', value: monthlyOrderCount },
    { label: 'Follow-Ups', value: followUpItems.length },
    { label: 'Hot Leads', value: hotLeadItems.length },
  ];

  return (
    <WorkspacePage>
      <WorkspaceHero
        eyebrow="Internal Platform"
        title="One place to run the internal platform."
        description="The app reads local sync data first, keeps CRM identity tied to Licensed Location ID, and keeps account work, route planning, and sync health visible."
        actions={
          <>
            <Link
              href={primaryAction.href}
              className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#18212d] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:bg-[#f5f7fb]"
            >
              {primaryAction.label}
            </Link>
            <Link
              href={supportLinks[0].href}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
            >
              {supportLinks[0].label}
            </Link>
          </>
        }
        metrics={
          <>
            {heroMetrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
              </div>
            ))}
          </>
        }
      />

      <WorkspaceSection eyebrow="Freshness" title="What is synced right now" description="The screen should feel current without forcing a full refresh every time you navigate back.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {freshnessTiles.map((tile) => (
            <div key={tile.title} className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="text-sm font-medium text-[#18212d]">{tile.title}</p>
              <p className="mt-1 text-lg font-semibold text-[#18212d]">{tile.value}</p>
              <p className="mt-1 text-sm text-[#5c6674]">{tile.description}</p>
            </div>
          ))}
        </div>
      </WorkspaceSection>

      {preferredPartnerSummary ? (
        <WorkspaceSection
          eyebrow="Preferred Partners"
          title="Current preferred partners by sales rep"
          description="Counts come from the synced territory dataset backed by the Notion Dispensary Master List CRM. Preferred Partner requires PPP Status = Approved & Connected and Headset Connection = Connected to PICC Headset."
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-[22px] border border-[#dce2eb] bg-[linear-gradient(180deg,#18212d_0%,#243141_100%)] p-5 text-white shadow-[0_16px_32px_rgba(24,33,45,0.14)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Total Preferred Partners</p>
              <p className="mt-3 text-5xl font-semibold leading-none">{preferredPartnerSummary.totalPreferredPartners}</p>
              <p className="mt-3 text-sm text-white/78">
                Live count across all synced accounts in territory.
              </p>
            </div>
            <div className="rounded-[22px] border border-[#dce2eb] bg-[#fbfcfe] p-4">
              <PreferredPartnerRepChart data={preferredPartnerSummary.reps} />
            </div>
          </div>
        </WorkspaceSection>
      ) : null}

      {followUpItems.length > 0 ? (
        <WorkspaceSection
          eyebrow="Next Action"
          title="Overdue and current follow-ups"
          description="Use this board to work follow-ups by owner, by rep, and by urgency instead of relying on a generic queue summary."
        >
          <FollowUpActionBoard
            items={followUpItems}
            repFilterOptions={followUpRepFilterOptions}
            defaultFilter={defaultFollowUpFilter}
            viewerHasAdminOverride={viewerHasAdminOverride}
          />
        </WorkspaceSection>
      ) : null}

      {hotLeadItems.length > 0 ? (
        <WorkspaceSection
          eyebrow="Hot Leads"
          title="Hot leads by rep"
          description="This section keeps the hottest accounts visible on the home page, sorted by sample delivery activity and linked straight into account detail."
        >
          <HotLeadsBoard items={hotLeadItems} repFilterOptions={hotLeadRepFilterOptions} />
        </WorkspaceSection>
      ) : null}
    </WorkspacePage>
  );
}
