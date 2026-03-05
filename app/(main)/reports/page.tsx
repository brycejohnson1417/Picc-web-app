import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { ReportsClient } from '@/components/reports/reports-client';

export default async function ReportsPage() {
  const { orgId } = await requireWorkspaceContext();

  const [referrals, pennyBundles, overdue, sampleRequests, opportunities] = await Promise.all([
    prisma.referralRecord.findMany({ where: { orgId }, select: { createdAt: true } }),
    prisma.pennyBundleCreditSubmission.findMany({ where: { orgId }, select: { createdAt: true } }),
    prisma.overdueSnapshot.findMany({ where: { orgId, OR: [{ daysOverdue1: { gt: 0 } }, { daysOverdue2: { gt: 0 } }, { daysOverdue3: { gt: 0 } }] }, select: { snapshotDate: true } }),
    prisma.sampleBoxRequest.findMany({ where: { orgId }, select: { createdAt: true } }),
    prisma.opportunity.findMany({ where: { orgId }, select: { status: true, value: true, updatedAt: true } }),
  ]);

  return (
    <ReportsClient
      source={{
        referrals: referrals.map((row) => ({ createdAt: row.createdAt.toISOString() })),
        pennyBundles: pennyBundles.map((row) => ({ createdAt: row.createdAt.toISOString() })),
        overdue: overdue.map((row) => ({ snapshotDate: row.snapshotDate.toISOString() })),
        sampleRequests: sampleRequests.map((row) => ({ createdAt: row.createdAt.toISOString() })),
        opportunities: opportunities.map((row) => ({ status: row.status, value: Number(row.value), updatedAt: row.updatedAt.toISOString() })),
      }}
    />
  );
}
