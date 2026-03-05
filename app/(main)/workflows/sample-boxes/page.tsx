import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { WorkflowBoard } from '@/components/workflows/workflow-board';

export default async function SampleBoxesWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const [requests, accounts] = await Promise.all([
    prisma.sampleBoxRequest.findMany({ where: { orgId }, include: { account: true, contact: true }, orderBy: { createdAt: 'desc' } }),
    prisma.account.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 400 }),
  ]);

  return (
    <WorkflowBoard
      title="Sample Box Requests"
      description="Track lead sample box approvals, fulfillment status, and follow-up dependencies."
      rows={requests.map((request) => ({
        id: request.id,
        status: request.status,
        primary: request.account.name,
        secondary: `Requested by ${request.requestedBy} · ${request.contact ? `${request.contact.firstName} ${request.contact.lastName}` : 'No contact'}`,
        description: request.requestReason,
        detail: request.shippingNotes,
        createdAt: request.createdAt.toISOString(),
      }))}
      createEndpoint="/api/workflows/sample-box-requests"
      patchEndpointBase="/api/workflows/sample-box-requests"
      accounts={accounts}
      createFields={[
        { key: 'accountId', label: 'Account', type: 'account', required: true },
        { key: 'requestReason', label: 'Request Reason', type: 'textarea', required: true },
      ]}
    />
  );
}
