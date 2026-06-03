import 'server-only';

import { PayrollBatchStatus, PayrollLineStatus, VendorDayAssignmentStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { appendAuditEvent } from '@/lib/server/audit-log';

type Actor = {
  userId?: string | null;
  email?: string | null;
};

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function lastDayOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function payrollWindowForDate(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (utcDate.getUTCDate() < 15) {
    return {
      startsOn: startOfDay(new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), 1))),
      endsOn: endOfDay(new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), 14))),
    };
  }

  return {
    startsOn: startOfDay(new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), 15))),
    endsOn: endOfDay(lastDayOfMonth(utcDate)),
  };
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
}

async function ensurePayrollBatch(orgId: string, actor?: Actor, referenceDate?: Date) {
  const window = payrollWindowForDate(referenceDate);
  return prisma.payrollBatch.upsert({
    where: {
      orgId_startsOn_endsOn: {
        orgId,
        startsOn: window.startsOn,
        endsOn: window.endsOn,
      },
    },
    update: {},
    create: {
      orgId,
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      status: PayrollBatchStatus.OPEN,
      createdByClerkUserId: actor?.userId ?? null,
      createdByEmail: actor?.email ?? null,
    },
  });
}

export async function ensurePayrollLineItemForAssignment(input: {
  orgId: string;
  assignmentId: string;
  actor?: Actor;
}) {
  const assignment = await prisma.vendorDayAssignment.findFirst({
    where: { id: input.assignmentId, orgId: input.orgId },
    include: {
      execution: true,
      workerProfile: {
        include: {
          employer: true,
        },
      },
    },
  });
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  const eventMinutes =
    assignment.execution?.checkInAt && assignment.execution?.checkOutAt
      ? minutesBetween(assignment.execution.checkInAt, assignment.execution.checkOutAt)
      : minutesBetween(assignment.scheduledStart, assignment.scheduledEnd);
  const travelMinutes =
    assignment.travelMinutesOneWay != null &&
    assignment.oneWayTravelThresholdMin != null &&
    assignment.travelMinutesOneWay > assignment.oneWayTravelThresholdMin
      ? assignment.travelMinutesOneWay * 2
      : 0;
  const eventPayAmount = Number(assignment.eventPayAmount ?? 0);
  const travelPayAmount = Number(assignment.travelPayAmount ?? 0);
  const totalPayAmount = Number((eventPayAmount + travelPayAmount).toFixed(2));
  const batch = await ensurePayrollBatch(input.orgId, input.actor, assignment.execution?.checkOutAt ?? assignment.scheduledEnd);

  const line = await prisma.payrollLineItem.upsert({
    where: { assignmentId: assignment.id },
    update: {
      workerProfileId: assignment.workerProfileId,
      employerId: assignment.workerProfile.employerId,
      batchId: batch.id,
      eventMinutes,
      travelMinutes,
      eventPayAmount,
      travelPayAmount,
      totalPayAmount,
      status: PayrollLineStatus.PENDING,
    },
    create: {
      orgId: input.orgId,
      assignmentId: assignment.id,
      workerProfileId: assignment.workerProfileId,
      employerId: assignment.workerProfile.employerId,
      batchId: batch.id,
      status: PayrollLineStatus.PENDING,
      eventMinutes,
      travelMinutes,
      eventPayAmount,
      travelPayAmount,
      totalPayAmount,
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'payroll.line_item.synced',
    entityType: 'PayrollLineItem',
    entityId: line.id,
    metadata: {
      assignmentId: assignment.id,
      batchId: batch.id,
      totalPayAmount,
    },
  });

  return line;
}

export async function syncPayrollForCompletedAssignments(orgId: string, actor?: Actor) {
  const assignments = await prisma.vendorDayAssignment.findMany({
    where: {
      orgId,
      status: {
        in: [VendorDayAssignmentStatus.CHECKED_OUT, VendorDayAssignmentStatus.COMPLETED],
      },
    },
    select: { id: true },
  });

  const results = [];
  for (const assignment of assignments) {
    results.push(await ensurePayrollLineItemForAssignment({ orgId, assignmentId: assignment.id, actor }));
  }
  return results;
}

export async function getPayrollOverview(orgId: string) {
  const currentBatch = await ensurePayrollBatch(orgId);
  const [batch, runningBalances, disputedLines] = await Promise.all([
    prisma.payrollBatch.findUnique({
      where: { id: currentBatch.id },
      include: {
        lineItems: {
          include: {
            workerProfile: true,
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
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    }),
    prisma.payrollLineItem.groupBy({
      by: ['workerProfileId'],
      where: {
        orgId,
        status: {
          in: [PayrollLineStatus.PENDING, PayrollLineStatus.APPROVED, PayrollLineStatus.PAID],
        },
      },
      _sum: {
        totalPayAmount: true,
      },
    }),
    prisma.payrollLineItem.findMany({
      where: { orgId, status: PayrollLineStatus.DISPUTED },
      include: {
        workerProfile: true,
        assignment: {
          include: {
            request: {
              include: { account: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    currentBatch: batch,
    runningBalances,
    disputedLines,
  };
}

export async function updatePayrollLineStatus(input: {
  orgId: string;
  lineItemId: string;
  status: PayrollLineStatus;
  actor?: Actor;
  disputedReason?: string | null;
}) {
  const line = await prisma.payrollLineItem.update({
    where: { id: input.lineItemId },
    data: {
      status: input.status,
      disputedReason: input.disputedReason?.trim() || null,
      approvedAt: input.status === PayrollLineStatus.APPROVED ? new Date() : undefined,
      paidAt: input.status === PayrollLineStatus.PAID ? new Date() : undefined,
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'payroll.line_item.status_updated',
    entityType: 'PayrollLineItem',
    entityId: line.id,
    reason: input.disputedReason?.trim() || null,
    metadata: {
      status: input.status,
    },
  });

  return line;
}

export async function markPayrollBatchExported(input: {
  orgId: string;
  batchId: string;
  actor?: Actor;
}) {
  const batch = await prisma.payrollBatch.update({
    where: { id: input.batchId },
    data: {
      status: PayrollBatchStatus.EXPORTED,
      exportedAt: new Date(),
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'payroll.batch.exported',
    entityType: 'PayrollBatch',
    entityId: batch.id,
  });

  return batch;
}
