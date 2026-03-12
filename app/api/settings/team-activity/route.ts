import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type MemberSummary = {
  id: string;
  displayName: string;
  email: string | null;
  lastLoginAt: string | null;
  loginCount30d: number;
  activityCount30d: number;
  checkInCount30d: number;
  vendorDayCount30d: number;
  totalActions30d: number;
};

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM']);
  if ('error' in ctx) return ctx.error;

  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [sessions, activityLogs, vendorDayEvents, checkIns] = await Promise.all([
    prisma.appSessionAudit.findMany({
      where: {
        orgId: ctx.orgId,
        lastSeenAt: { gte: since },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        clerkUserId: true,
        email: true,
        displayName: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    }),
    prisma.activityLog.findMany({
      where: {
        orgId: ctx.orgId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        actorClerkUserId: true,
        title: true,
        description: true,
        createdAt: true,
        account: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.vendorDayEvent.findMany({
      where: {
        orgId: ctx.orgId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        createdBy: true,
        repName: true,
        eventDate: true,
        createdAt: true,
        account: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.checkIn.findMany({
      where: {
        orgId: ctx.orgId,
        createdAt: { gte: since },
        createdByEmail: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        createdByEmail: true,
        noteText: true,
        createdAt: true,
      },
    }),
  ]);

  const memberMap = new Map<string, MemberSummary>();
  const emailToMemberId = new Map<string, string>();

  const getOrCreateMember = (id: string, displayName: string, email: string | null) => {
    const existing = memberMap.get(id);
    if (existing) {
      if (!existing.email && email) {
        existing.email = email;
      }
      if ((!existing.displayName || existing.displayName === existing.id) && displayName) {
        existing.displayName = displayName;
      }
      return existing;
    }

    const next: MemberSummary = {
      id,
      displayName,
      email,
      lastLoginAt: null,
      loginCount30d: 0,
      activityCount30d: 0,
      checkInCount30d: 0,
      vendorDayCount30d: 0,
      totalActions30d: 0,
    };
    memberMap.set(id, next);
    if (email) {
      emailToMemberId.set(email.toLowerCase(), id);
    }
    return next;
  };

  for (const session of sessions) {
    const displayName = session.displayName?.trim() || session.email?.trim() || session.clerkUserId;
    const email = session.email?.trim().toLowerCase() || null;
    const summary = getOrCreateMember(session.clerkUserId, displayName, email);
    summary.loginCount30d += 1;
    summary.lastLoginAt = !summary.lastLoginAt || new Date(session.lastSeenAt).getTime() > new Date(summary.lastLoginAt).getTime()
      ? session.lastSeenAt.toISOString()
      : summary.lastLoginAt;
  }

  for (const row of activityLogs) {
    const summary = getOrCreateMember(row.actorClerkUserId, row.actorClerkUserId, null);
    summary.activityCount30d += 1;
    summary.totalActions30d += 1;
  }

  for (const row of vendorDayEvents) {
    const userId = row.createdBy?.trim();
    if (!userId) continue;
    const summary = getOrCreateMember(userId, userId, null);
    summary.vendorDayCount30d += 1;
    summary.totalActions30d += 1;
  }

  for (const row of checkIns) {
    const email = row.createdByEmail?.trim().toLowerCase();
    if (!email) continue;
    const memberId = emailToMemberId.get(email) ?? `email:${email}`;
    const summary = getOrCreateMember(memberId, email, email);
    summary.checkInCount30d += 1;
    summary.totalActions30d += 1;
  }

  const recentEvents = [
    ...sessions.map((session) => ({
      id: `login-${session.clerkUserId}-${session.firstSeenAt.toISOString()}`,
      happenedAt: session.firstSeenAt.toISOString(),
      actor: session.displayName?.trim() || session.email?.trim() || session.clerkUserId,
      type: 'login',
      title: 'Signed into the app',
      detail: session.email?.trim() || null,
    })),
    ...activityLogs.map((row) => ({
      id: `activity-${row.actorClerkUserId}-${row.createdAt.toISOString()}-${row.title}`,
      happenedAt: row.createdAt.toISOString(),
      actor: memberMap.get(row.actorClerkUserId)?.displayName || row.actorClerkUserId,
      type: 'update',
      title: row.title,
      detail: row.account?.name ? `${row.account.name}${row.description ? ` · ${row.description}` : ''}` : row.description || null,
    })),
    ...vendorDayEvents.map((row) => ({
      id: `vendor-day-${row.createdBy}-${row.createdAt.toISOString()}-${row.account?.name ?? 'account'}`,
      happenedAt: row.createdAt.toISOString(),
      actor: row.createdBy ? memberMap.get(row.createdBy)?.displayName || row.createdBy : 'Unknown',
      type: 'vendor-day',
      title: 'Vendor day scheduled',
      detail: `${row.account?.name ?? 'Unknown store'}${row.repName ? ` · ${row.repName}` : ''} · ${row.eventDate.toLocaleString()}`,
    })),
    ...checkIns.map((row) => {
      const email = row.createdByEmail?.trim().toLowerCase() || '';
      const memberId = emailToMemberId.get(email) ?? `email:${email}`;
      return {
        id: `check-in-${email}-${row.createdAt.toISOString()}`,
        happenedAt: row.createdAt.toISOString(),
        actor: memberMap.get(memberId)?.displayName || email,
        type: 'check-in',
        title: 'Check-in submitted',
        detail: row.noteText?.trim() || null,
      };
    }),
  ]
    .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())
    .slice(0, 30);

  const teamMembers = [...memberMap.values()].sort((a, b) => {
    const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
    const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
    return bTime - aTime || b.totalActions30d - a.totalActions30d;
  });

  return Response.json({
    teamMembers,
    recentEvents,
    meta: {
      windowDays: 30,
      teamMemberCount: teamMembers.length,
    },
  });
}
