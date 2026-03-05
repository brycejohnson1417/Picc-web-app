import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { WorkflowBoard } from '@/components/workflows/workflow-board';

export default async function EditSuggestionWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const [suggestions, accounts] = await Promise.all([
    prisma.editSuggestion.findMany({ where: { orgId }, include: { account: true, contact: true }, orderBy: { createdAt: 'desc' } }),
    prisma.account.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 400 }),
  ]);

  return (
    <WorkflowBoard
      title="Edit Suggestions"
      description="Brand Ambassador-safe update flow for restricted account/contact changes that require approval."
      rows={suggestions.map((item) => ({
        id: item.id,
        status: item.status,
        primary: item.account.name,
        secondary: `Suggested by ${item.suggestedBy}${item.contact ? ` · Contact: ${item.contact.firstName} ${item.contact.lastName}` : ''}`,
        description: item.reason ?? 'No reason provided',
        detail: item.approvedBy ? `Approved by ${item.approvedBy}` : null,
        createdAt: item.createdAt.toISOString(),
      }))}
      createEndpoint="/api/workflows/edit-suggestions"
      patchEndpointBase="/api/workflows/edit-suggestions"
      accounts={accounts}
      createFields={[
        { key: 'accountId', label: 'Account', type: 'account', required: true },
        { key: 'reason', label: 'Reason', type: 'textarea' },
        { key: 'patch', label: 'Patch JSON', type: 'json', required: true, placeholder: '{"field":"new value"}' },
      ]}
      defaultCreateValues={{ patch: '{}' }}
    />
  );
}
