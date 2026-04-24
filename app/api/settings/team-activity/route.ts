import { Prisma } from '@prisma/client';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const INTERACTION_ACTIONS = ['interaction.click', 'interaction.keydown', 'navigation.view'] as const;

type TeamMemberSummary = {
  id: string;
  displayName: string;
  email: string | null;
  role: string | null;
  lastInteractionAt: string | null;
  interactionCount30d: number;
  clickCount30d: number;
  keydownCount30d: number;
  pageViewCount30d: number;
  activeDays30d: number;
  activeMinutes30d: number;
};

type RecentInteraction = {
  id: string;
  happenedAt: string;
  actor: string;
  action: 'click' | 'keydown' | 'navigation';
  label: string;
  detail: string | null;
  path: string | null;
};

type InteractionSummaryRow = {
  memberId: string;
  email: string | null;
  lastInteractionAt: Date | null;
  interactionCount30d: bigint | number;
  clickCount30d: bigint | number;
  keydownCount30d: bigint | number;
  pageViewCount30d: bigint | number;
  activeDays30d: bigint | number;
  activeMinutes30d: bigint | number;
};

function toMemberId(clerkUserId: string | null | undefined, email: string | null | undefined) {
  if (clerkUserId) return clerkUserId;
  if (email) return `email:${email.trim().toLowerCase()}`;
  return null;
}

function toCount(value: bigint | number | null | undefined) {
  if (typeof value === 'bigint') return Number(value);
  return typeof value === 'number' ? value : 0;
}

function parseMetadata(metadata: Prisma.JsonValue | null): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function readText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatInteraction(
  row: {
    id: string;
    actorClerkUserId: string | null;
    actorEmail: string | null;
    action: string;
    reason: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  },
  labelMap: Map<string, { displayName: string; email: string | null }>,
): RecentInteraction {
  const metadata = parseMetadata(row.metadata);
  const memberId = toMemberId(row.actorClerkUserId, row.actorEmail);
  const actor = memberId ? labelMap.get(memberId)?.displayName ?? row.actorEmail ?? memberId : 'Unknown user';
  const path = readText(metadata, 'path');
  const detail = readText(metadata, 'detail');
  const targetLabel = readText(metadata, 'targetLabel');
  const key = readText(metadata, 'key');

  if (row.action === 'interaction.click') {
    return {
      id: row.id,
      happenedAt: row.createdAt.toISOString(),
      actor,
      action: 'click',
      label: row.reason ?? (targetLabel ? `Clicked ${targetLabel}` : 'Clicked UI element'),
      detail,
      path,
    };
  }

  if (row.action === 'interaction.keydown') {
    return {
      id: row.id,
      happenedAt: row.createdAt.toISOString(),
      actor,
      action: 'keydown',
      label: row.reason ?? (key ? `Pressed ${key}` : 'Pressed key'),
      detail,
      path,
    };
  }

  return {
    id: row.id,
    happenedAt: row.createdAt.toISOString(),
    actor,
    action: 'navigation',
    label: row.reason ?? (path ? `Viewed ${path}` : 'Viewed page'),
    detail,
    path,
  };
}

export async function GET(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM']);
  if ('error' in ctx) return ctx.error;

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const url = new URL(request.url);
  const requestedMemberId = url.searchParams.get('memberId')?.trim() || null;

  const [memberships, sessions, summaryRows, recentRows] = await Promise.all([
    prisma.membership.findMany({
      where: {
        orgId: ctx.orgId,
        active: true,
      },
      select: {
        clerkUserId: true,
        role: true,
      },
    }),
    prisma.appSessionAudit.findMany({
      where: {
        orgId: ctx.orgId,
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        clerkUserId: true,
        email: true,
        displayName: true,
        lastSeenAt: true,
      },
    }),
    prisma.$queryRaw<InteractionSummaryRow[]>`
      SELECT
        COALESCE("actorClerkUserId", CONCAT('email:', LOWER("actorEmail"))) AS "memberId",
        MAX(LOWER("actorEmail")) AS "email",
        MAX("createdAt") AS "lastInteractionAt",
        COUNT(*)::int AS "interactionCount30d",
        COUNT(*) FILTER (WHERE action = 'interaction.click')::int AS "clickCount30d",
        COUNT(*) FILTER (WHERE action = 'interaction.keydown')::int AS "keydownCount30d",
        COUNT(*) FILTER (WHERE action = 'navigation.view')::int AS "pageViewCount30d",
        COUNT(DISTINCT DATE_TRUNC('day', "createdAt"))::int AS "activeDays30d",
        COUNT(DISTINCT DATE_TRUNC('minute', "createdAt"))::int AS "activeMinutes30d"
      FROM "AuditEvent"
      WHERE "orgId" = ${ctx.orgId}
        AND "createdAt" >= ${since}
        AND action IN (${Prisma.join(INTERACTION_ACTIONS)})
      GROUP BY 1
    `,
    prisma.auditEvent.findMany({
      where: {
        orgId: ctx.orgId,
        createdAt: { gte: since },
        action: { in: [...INTERACTION_ACTIONS] },
      },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: {
        id: true,
        actorClerkUserId: true,
        actorEmail: true,
        action: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  const roleMap = new Map(memberships.map((membership) => [membership.clerkUserId, membership.role]));
  const labelMap = new Map<string, { displayName: string; email: string | null }>();

  for (const session of sessions) {
    const memberId = toMemberId(session.clerkUserId, session.email);
    if (!memberId || labelMap.has(memberId)) continue;
    labelMap.set(memberId, {
      displayName: session.displayName?.trim() || session.email?.trim() || memberId,
      email: session.email?.trim().toLowerCase() || null,
    });
  }

  const summaryMap = new Map<string, TeamMemberSummary>();

  for (const membership of memberships) {
    const sessionLabel = labelMap.get(membership.clerkUserId);
    summaryMap.set(membership.clerkUserId, {
      id: membership.clerkUserId,
      displayName: sessionLabel?.displayName ?? membership.clerkUserId,
      email: sessionLabel?.email ?? null,
      role: membership.role,
      lastInteractionAt: null,
      interactionCount30d: 0,
      clickCount30d: 0,
      keydownCount30d: 0,
      pageViewCount30d: 0,
      activeDays30d: 0,
      activeMinutes30d: 0,
    });
  }

  for (const row of summaryRows) {
    const sessionLabel = labelMap.get(row.memberId);
    const existing = summaryMap.get(row.memberId);
    const summary: TeamMemberSummary = existing ?? {
      id: row.memberId,
      displayName: sessionLabel?.displayName ?? row.email ?? row.memberId,
      email: sessionLabel?.email ?? row.email,
      role: row.memberId.startsWith('email:') ? 'GUEST_VIEWER' : roleMap.get(row.memberId) ?? null,
      lastInteractionAt: null,
      interactionCount30d: 0,
      clickCount30d: 0,
      keydownCount30d: 0,
      pageViewCount30d: 0,
      activeDays30d: 0,
      activeMinutes30d: 0,
    };

    summary.lastInteractionAt = row.lastInteractionAt ? row.lastInteractionAt.toISOString() : null;
    summary.interactionCount30d = toCount(row.interactionCount30d);
    summary.clickCount30d = toCount(row.clickCount30d);
    summary.keydownCount30d = toCount(row.keydownCount30d);
    summary.pageViewCount30d = toCount(row.pageViewCount30d);
    summary.activeDays30d = toCount(row.activeDays30d);
    summary.activeMinutes30d = toCount(row.activeMinutes30d);
    summaryMap.set(summary.id, summary);
  }

  const teamMembers = [...summaryMap.values()].sort((a, b) => {
    const aTime = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
    const bTime = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
    return b.interactionCount30d - a.interactionCount30d || bTime - aTime || a.displayName.localeCompare(b.displayName);
  });

  if (requestedMemberId) {
    const member = summaryMap.get(requestedMemberId) ?? null;
    const requestedEmail = requestedMemberId.startsWith('email:') ? requestedMemberId.slice('email:'.length) : member?.email ?? null;
    const memberFilters: Array<{ actorClerkUserId?: string; actorEmail?: string }> = requestedMemberId.startsWith('email:')
      ? []
      : [{ actorClerkUserId: requestedMemberId }];
    if (requestedEmail) {
      memberFilters.push({ actorEmail: requestedEmail });
    }

    const recentMemberRows = await prisma.auditEvent.findMany({
      where: {
        orgId: ctx.orgId,
        createdAt: { gte: since },
        action: { in: [...INTERACTION_ACTIONS] },
        OR: memberFilters,
      },
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: {
        id: true,
        actorClerkUserId: true,
        actorEmail: true,
        action: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    });

    const topPages = new Map<string, number>();
    for (const row of recentMemberRows) {
      const metadata = parseMetadata(row.metadata);
      const path = readText(metadata, 'path');
      if (!path) continue;
      topPages.set(path, (topPages.get(path) ?? 0) + 1);
    }

    return Response.json({
      member,
      recentInteractions: recentMemberRows.map((row) => formatInteraction(row, labelMap)),
      topPages: [...topPages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([path, count]) => ({ path, count })),
    });
  }

  return Response.json({
    teamMembers,
    recentInteractions: recentRows.map((row) => formatInteraction(row, labelMap)),
    meta: {
      windowDays: 30,
      teamMemberCount: teamMembers.length,
    },
  });
}
