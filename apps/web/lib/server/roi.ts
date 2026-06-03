import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { appendAuditEvent } from '@/lib/server/audit-log';

type Actor = {
  userId?: string | null;
  email?: string | null;
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function ensureVendorDayRoiSnapshot(input: {
  orgId: string;
  assignmentId: string;
  actor?: Actor;
  windowDays?: number;
}) {
  const assignment = await prisma.vendorDayAssignment.findFirst({
    where: { id: input.assignmentId, orgId: input.orgId },
    include: {
      request: true,
      workerProfile: {
        include: {
          employer: true,
        },
      },
      execution: true,
    },
  });
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  const windowDays = input.windowDays ?? 30;
  const anchorDate = assignment.execution?.checkOutAt ?? assignment.scheduledEnd;
  const preStart = addDays(anchorDate, -windowDays);
  const preEnd = anchorDate;
  const postEnd = addDays(anchorDate, windowDays);

  const [preOrders, postOrders, firstReorder, credits] = await Promise.all([
    prisma.nabisOrder.aggregate({
      where: {
        orgId: input.orgId,
        accountId: assignment.request.accountId,
        orderCreatedDate: {
          gte: preStart,
          lt: preEnd,
        },
      },
      _sum: { orderTotal: true },
      _count: { _all: true },
    }),
    prisma.nabisOrder.aggregate({
      where: {
        orgId: input.orgId,
        accountId: assignment.request.accountId,
        orderCreatedDate: {
          gte: preEnd,
          lte: postEnd,
        },
      },
      _sum: { orderTotal: true },
      _count: { _all: true },
    }),
    prisma.nabisOrder.findFirst({
      where: {
        orgId: input.orgId,
        accountId: assignment.request.accountId,
        orderCreatedDate: {
          gt: preEnd,
          lte: postEnd,
        },
      },
      orderBy: { orderCreatedDate: 'asc' },
      select: { orderCreatedDate: true },
    }),
    prisma.pennyBundleCreditSubmission.aggregate({
      where: {
        orgId: input.orgId,
        accountId: assignment.request.accountId,
        createdAt: {
          gte: preEnd,
          lte: postEnd,
        },
      },
      _sum: { creditAmount: true },
    }),
  ]);

  const preRevenue = Number(preOrders._sum.orderTotal ?? 0);
  const postRevenue = Number(postOrders._sum.orderTotal ?? 0);
  const preOrderCount = preOrders._count._all;
  const postOrderCount = postOrders._count._all;
  const revenueLift = Number((postRevenue - preRevenue).toFixed(2));
  const orderCountLift = postOrderCount - preOrderCount;
  const laborCost = Number(assignment.eventPayAmount ?? 0);
  const travelCost = Number(assignment.travelPayAmount ?? 0);
  const serviceCompanyCost =
    assignment.workerProfile.employer?.isServiceCompany && assignment.workerProfile.employer.flatEventRateDollars
      ? Number(assignment.workerProfile.employer.flatEventRateDollars)
      : 0;
  const totalCost = laborCost + travelCost + serviceCompanyCost;
  const roiMultiple = totalCost > 0 ? Number((revenueLift / totalCost).toFixed(4)) : null;

  const snapshot = await prisma.vendorDayRoiSnapshot.upsert({
    where: { assignmentId: assignment.id },
    update: {
      accountId: assignment.request.accountId,
      workerProfileId: assignment.workerProfileId,
      employerId: assignment.workerProfile.employerId,
      windowDays,
      preOrderCount,
      postOrderCount,
      preRevenue,
      postRevenue,
      revenueLift,
      orderCountLift,
      firstReorderLagDays: firstReorder?.orderCreatedDate
        ? Math.max(0, Math.round((firstReorder.orderCreatedDate.getTime() - preEnd.getTime()) / (24 * 60 * 60 * 1000)))
        : null,
      pennyBundleCreditExposure: Number(credits._sum.creditAmount ?? 0),
      laborCost,
      travelCost,
      serviceCompanyCost,
      roiMultiple,
    },
    create: {
      orgId: input.orgId,
      assignmentId: assignment.id,
      accountId: assignment.request.accountId,
      workerProfileId: assignment.workerProfileId,
      employerId: assignment.workerProfile.employerId,
      windowDays,
      preOrderCount,
      postOrderCount,
      preRevenue,
      postRevenue,
      revenueLift,
      orderCountLift,
      firstReorderLagDays: firstReorder?.orderCreatedDate
        ? Math.max(0, Math.round((firstReorder.orderCreatedDate.getTime() - preEnd.getTime()) / (24 * 60 * 60 * 1000)))
        : null,
      pennyBundleCreditExposure: Number(credits._sum.creditAmount ?? 0),
      laborCost,
      travelCost,
      serviceCompanyCost,
      roiMultiple,
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'vendor_day.roi_snapshot.synced',
    entityType: 'VendorDayRoiSnapshot',
    entityId: snapshot.id,
    metadata: {
      assignmentId: assignment.id,
      revenueLift,
      roiMultiple,
    },
  });

  return snapshot;
}

export async function syncVendorDayRoiSnapshots(orgId: string, actor?: Actor) {
  const assignments = await prisma.vendorDayAssignment.findMany({
    where: {
      orgId,
      status: {
        in: ['CHECKED_OUT', 'COMPLETED'],
      },
    },
    select: { id: true },
  });

  const snapshots = [];
  for (const assignment of assignments) {
    snapshots.push(await ensureVendorDayRoiSnapshot({ orgId, assignmentId: assignment.id, actor }));
  }
  return snapshots;
}

export async function getVendorDayReportSummary(input: {
  orgId: string;
  start?: Date;
  end?: Date;
}) {
  const dateFilter =
    input.start || input.end
      ? {
          createdAt: {
            ...(input.start ? { gte: input.start } : {}),
            ...(input.end ? { lte: input.end } : {}),
          },
        }
      : {};

  const [snapshots, payrollLines] = await Promise.all([
    prisma.vendorDayRoiSnapshot.findMany({
      where: {
        orgId: input.orgId,
        ...dateFilter,
      },
      include: {
        account: true,
        workerProfile: true,
        employer: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payrollLineItem.findMany({
      where: {
        orgId: input.orgId,
      },
      include: {
        workerProfile: true,
        employer: true,
        assignment: {
          include: {
            request: {
              include: {
                account: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totals = snapshots.reduce(
    (accumulator, snapshot) => {
      accumulator.revenueLift += Number(snapshot.revenueLift ?? 0);
      accumulator.laborCost += Number(snapshot.laborCost ?? 0);
      accumulator.travelCost += Number(snapshot.travelCost ?? 0);
      accumulator.serviceCompanyCost += Number(snapshot.serviceCompanyCost ?? 0);
      accumulator.creditExposure += Number(snapshot.pennyBundleCreditExposure ?? 0);
      accumulator.orderLift += snapshot.orderCountLift;
      return accumulator;
    },
    {
      revenueLift: 0,
      laborCost: 0,
      travelCost: 0,
      serviceCompanyCost: 0,
      creditExposure: 0,
      orderLift: 0,
    },
  );

  const byWorker = new Map<string, { label: string; events: number; pay: number; revenueLift: number; travelMinutes: number }>();
  for (const line of payrollLines) {
    const key = line.workerProfileId;
    const current = byWorker.get(key) ?? {
      label: line.workerProfile.displayName,
      events: 0,
      pay: 0,
      revenueLift: 0,
      travelMinutes: 0,
    };
    current.events += 1;
    current.pay += Number(line.totalPayAmount);
    current.travelMinutes += line.travelMinutes;
    byWorker.set(key, current);
  }
  for (const snapshot of snapshots) {
    if (!snapshot.workerProfileId) continue;
    const current = byWorker.get(snapshot.workerProfileId);
    if (current) {
      current.revenueLift += Number(snapshot.revenueLift);
    }
  }

  const byBrand = new Map<string, { label: string; events: number; revenueLift: number }>();
  for (const snapshot of snapshots) {
    const label = snapshot.brandLabel?.trim() || 'Unspecified';
    const current = byBrand.get(label) ?? { label, events: 0, revenueLift: 0 };
    current.events += 1;
    current.revenueLift += Number(snapshot.revenueLift);
    byBrand.set(label, current);
  }

  return {
    totals,
    snapshots,
    payrollLines,
    byWorker: [...byWorker.values()].sort((a, b) => b.revenueLift - a.revenueLift),
    byBrand: [...byBrand.values()].sort((a, b) => b.revenueLift - a.revenueLift),
  };
}
