import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { WorkflowBoard } from '@/components/workflows/workflow-board';
import { currency } from '@/lib/utils';

export default async function PennyBundlesWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const [items, accounts] = await Promise.all([
    prisma.pennyBundleCreditSubmission.findMany({ where: { orgId }, include: { account: true, vendorDayEvent: true }, orderBy: { createdAt: 'desc' } }),
    prisma.account.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 400 }),
  ]);

  return (
    <WorkflowBoard
      title="Penny Bundle Credits"
      description="Review and process penny bundle promotion credit submissions."
      rows={items.map((item) => ({
        id: item.id,
        status: item.status,
        primary: item.account.name,
        secondary: `Order #${item.orderNumber ?? '—'} · Credit Memo ${item.creditMemo ?? '—'}`,
        description: `Amount: ${currency(Number(item.creditAmount || 0))}`,
        detail: item.notes,
        createdAt: item.createdAt.toISOString(),
      }))}
      createEndpoint="/api/workflows/penny-bundle-submissions"
      patchEndpointBase="/api/workflows/penny-bundle-submissions"
      accounts={accounts}
      createFields={[
        { key: 'accountId', label: 'Account', type: 'account', required: true },
        { key: 'orderNumber', label: 'Order Number', type: 'text' },
        { key: 'creditMemo', label: 'Credit Memo', type: 'text' },
        { key: 'creditAmount', label: 'Credit Amount', type: 'number' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
