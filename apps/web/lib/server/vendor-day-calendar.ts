import 'server-only';

import { unstable_cache } from 'next/cache';
import { Role, VendorDayAssignmentStatus, VendorDayRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { loadNotionVendorDayEvents } from '@/lib/server/notion-vendor-days';

export type VendorDayCalendarEntry = {
  id: string;
  eventDate: string;
  repName: string | null;
  ambassadorName: string | null;
  account: {
    id: string | null;
    name: string;
  } | null;
  status: string;
  source: 'local_assignment' | 'local_request' | 'notion_archive';
};

function startOfWindow(now: Date) {
  const start = new Date(now);
  start.setMonth(start.getMonth() - 2);
  return start;
}

function endOfWindow(now: Date) {
  const end = new Date(now);
  end.setMonth(end.getMonth() + 4);
  return end;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function dedupeKey(input: { date: string; accountName: string }) {
  return `${input.date.slice(0, 10)}::${normalizeName(input.accountName)}`;
}

const loadCachedNotionVendorDayEvents = unstable_cache(
  async () => loadNotionVendorDayEvents(),
  ['vendor-day-calendar-notion-archive'],
  { revalidate: 300 },
);

export async function listVendorDayCalendarEntries(input: {
  orgId: string;
  viewerUserId?: string | null;
  viewerRole: Role;
  viewerEmail?: string | null;
}) {
  const now = new Date();
  const windowStart = startOfWindow(now);
  const windowEnd = endOfWindow(now);

  const viewerWorker = input.viewerUserId
    ? await prisma.workerProfile.findFirst({
        where: {
          orgId: input.orgId,
          OR: [{ clerkUserId: input.viewerUserId }, ...(input.viewerEmail ? [{ email: input.viewerEmail }] : [])],
        },
        select: { id: true },
      })
    : null;

  const assignmentWhere = {
    orgId: input.orgId,
    scheduledStart: {
      gte: windowStart,
      lte: windowEnd,
    },
    ...(input.viewerRole === Role.BRAND_AMBASSADOR && viewerWorker?.id
      ? { workerProfileId: viewerWorker.id }
      : {}),
  };

  const requestWhere = {
    orgId: input.orgId,
    requestedStart: {
      gte: windowStart,
      lte: windowEnd,
    },
    status: {
      in: [
        VendorDayRequestStatus.REQUESTED,
        VendorDayRequestStatus.AWAITING_REP_APPROVAL,
        VendorDayRequestStatus.READY_FOR_DISPATCH,
        VendorDayRequestStatus.OFFER_PENDING,
        VendorDayRequestStatus.ASSIGNED,
        VendorDayRequestStatus.PASSED_OFF,
        VendorDayRequestStatus.EXCEPTION,
        VendorDayRequestStatus.DISPUTED,
      ],
    },
  };

  const [assignments, requests, notionRows] = await Promise.all([
    prisma.vendorDayAssignment.findMany({
      where: assignmentWhere,
      select: {
        id: true,
        scheduledStart: true,
        status: true,
        request: {
          select: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        workerProfile: {
          select: {
            displayName: true,
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.vendorDayRequest.findMany({
      where: requestWhere,
      select: {
        id: true,
        requestedStart: true,
        status: true,
        assignments: {
          select: { id: true },
          where: {
            status: {
              notIn: [VendorDayAssignmentStatus.CANCELLED],
            },
          },
          take: 1,
        },
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { requestedStart: 'asc' },
    }),
    loadCachedNotionVendorDayEvents().catch(() => []),
  ]);

  const localAssignmentEntries: VendorDayCalendarEntry[] = assignments.map((assignment) => ({
    id: assignment.id,
    eventDate: assignment.scheduledStart.toISOString(),
    repName: null,
    ambassadorName: assignment.workerProfile?.displayName ?? null,
    account: assignment.request?.account
      ? {
          id: assignment.request.account.id,
          name: assignment.request.account.name,
        }
      : null,
    status: assignment.status,
    source: 'local_assignment',
  }));

  const localRequestEntries: VendorDayCalendarEntry[] = requests
    .filter((request) => request.assignments.length === 0)
    .map((request) => ({
      id: request.id,
      eventDate: request.requestedStart.toISOString(),
      repName: null,
      ambassadorName: null,
      account: request.account
        ? {
            id: request.account.id,
            name: request.account.name,
          }
        : null,
      status: request.status,
      source: 'local_request',
    }));

  const localKeys = new Set(
    [...localAssignmentEntries, ...localRequestEntries]
      .filter((entry) => entry.account?.name)
      .map((entry) => dedupeKey({ date: entry.eventDate, accountName: entry.account?.name ?? '' })),
  );

  const notionEntries: VendorDayCalendarEntry[] = notionRows
    .filter((row) => {
      const eventTime = new Date(row.eventDate).getTime();
      return Number.isFinite(eventTime) && eventTime >= windowStart.getTime() && eventTime <= windowEnd.getTime();
    })
    .filter((row) => !localKeys.has(dedupeKey({ date: row.eventDate, accountName: row.accountName })))
    .map((row) => ({
      id: row.id,
      eventDate: row.eventDate,
      repName: row.repName,
      ambassadorName: row.ambassadorName,
      account: {
        id: null,
        name: row.accountName,
      },
      status: 'ARCHIVED',
      source: 'notion_archive',
    }));

  return [...localAssignmentEntries, ...localRequestEntries, ...notionEntries].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}
