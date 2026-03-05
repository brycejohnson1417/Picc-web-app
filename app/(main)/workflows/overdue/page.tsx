import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { WorkflowBoard } from '@/components/workflows/workflow-board';
import { currency } from '@/lib/utils';

export default async function OverdueWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const [overdue, accounts] = await Promise.all([
    prisma.overdueSnapshot.findMany({
      where: { orgId, OR: [{ daysOverdue1: { gt: 0 } }, { daysOverdue2: { gt: 0 } }, { daysOverdue3: { gt: 0 } }] },
      include: { account: true },
      orderBy: { snapshotDate: 'desc' },
    }),
    prisma.account.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 400 }),
  ]);

  return (
    <WorkflowBoard
      title="Overdue Accounts"
      description="Payment history snapshots from Sheets to prioritize collections."
      rows={overdue.map((item) => ({
        id: item.id,
        status: 'IN_REVIEW',
        primary: item.account.name,
        secondary: `Credit: ${item.creditStatus ?? 'Unknown'} · ${Math.max(item.daysOverdue1, item.daysOverdue2, item.daysOverdue3)} days overdue`,
        description: `Amount Overdue: ${currency(Number(item.amountOverdue || 0))}`,
        detail: `Snapshot: ${new Date(item.snapshotDate).toLocaleDateString()}`,
        createdAt: item.snapshotDate.toISOString(),
      }))}
      createEndpoint="/api/workflows/overdue"
      patchEndpointBase="/api/workflows/overdue"
      accounts={accounts}
      createFields={[
        { key: 'accountId', label: 'Account', type: 'account', required: true },
        { key: 'creditStatus', label: 'Credit Status', type: 'text' },
        { key: 'overdueOrders', label: 'Overdue Orders', type: 'number' },
        { key: 'daysOverdue1', label: 'Days Overdue Bucket 1', type: 'number' },
        { key: 'amountOverdue', label: 'Amount Overdue', type: 'number' },
      ]}
      defaultCreateValues={{ overdueOrders: '0', daysOverdue1: '0', amountOverdue: '0' }}
    />
  );
}
