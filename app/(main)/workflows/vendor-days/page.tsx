import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { WorkflowBoard } from '@/components/workflows/workflow-board';

export default async function VendorDaysWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const [events, accounts] = await Promise.all([
    prisma.vendorDayEvent.findMany({ where: { orgId }, include: { account: true }, orderBy: { eventDate: 'asc' } }),
    prisma.account.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 400 }),
  ]);

  return (
    <WorkflowBoard
      title="Vendor Day Scheduling"
      description="Coordinate ambassador appointments, contacts, and promotion outcomes."
      rows={events.map((event) => ({
        id: event.id,
        status: event.status,
        primary: event.account.name,
        secondary: `${new Date(event.eventDate).toLocaleString()} · Rep: ${event.repName ?? 'Unassigned'} · BA: ${event.ambassadorName ?? 'Unassigned'}`,
        description: `Contact: ${event.vdContact ?? '—'} · ${event.vdContactEmail ?? '—'}`,
        detail: event.notes,
        createdAt: event.createdAt.toISOString(),
      }))}
      createEndpoint="/api/workflows/vendor-days"
      patchEndpointBase="/api/workflows/vendor-days"
      accounts={accounts}
      createFields={[
        { key: 'accountId', label: 'Account', type: 'account', required: true },
        { key: 'eventDate', label: 'Event Date', type: 'date', required: true },
        { key: 'repName', label: 'Rep Name', type: 'text' },
        { key: 'ambassadorName', label: 'Ambassador Name', type: 'text' },
        { key: 'vdContact', label: 'Vendor Contact', type: 'text' },
        { key: 'vdContactEmail', label: 'Vendor Contact Email', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
