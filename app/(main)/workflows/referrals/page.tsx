import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { WorkflowBoard } from '@/components/workflows/workflow-board';
import { currency } from '@/lib/utils';

export default async function ReferralWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const [referrals, accounts] = await Promise.all([
    prisma.referralRecord.findMany({ where: { orgId }, include: { account: true, opportunity: true }, orderBy: { createdAt: 'desc' } }),
    prisma.account.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 400 }),
  ]);

  return (
    <WorkflowBoard
      title="Referral Tracking"
      description="Track referral source attribution, conversion links, and payout readiness."
      rows={referrals.map((ref) => ({
        id: ref.id,
        status: ref.status,
        primary: ref.account.name,
        secondary: `Source: ${ref.source} · Referred by ${ref.referredBy}`,
        description: `Order ${ref.orderNumber ?? '—'} · ${currency(Number(ref.orderTotal || 0))}`,
        detail: ref.opportunity ? `Opportunity: ${ref.opportunity.name}` : null,
        createdAt: ref.createdAt.toISOString(),
      }))}
      createEndpoint="/api/workflows/referrals"
      patchEndpointBase="/api/workflows/referrals"
      accounts={accounts}
      createFields={[
        { key: 'accountId', label: 'Account', type: 'account', required: true },
        { key: 'source', label: 'Source', type: 'text', required: true, placeholder: 'Inbound call' },
        { key: 'referredBy', label: 'Referred By', type: 'text', required: true, placeholder: 'Buyer name' },
        { key: 'orderNumber', label: 'Order Number', type: 'text' },
        { key: 'orderTotal', label: 'Order Total', type: 'number' },
      ]}
    />
  );
}
