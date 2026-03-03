import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { QueryToast } from '@/components/crm/query-toast';
import { ClientActionButton } from '@/components/crm/client-action-button';
import Link from 'next/link';

export default async function VendorDaysWorkflowPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { orgId } = await requireWorkspaceContext();
  const params = await searchParams;

  const events = await prisma.vendorDayEvent.findMany({ where: { orgId }, include: { account: true }, orderBy: { eventDate: 'asc' } });

  return (
    <div className="space-y-6">
      {params.new === '1' && <QueryToast message="New Vendor Day scheduling coming soon" />}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendor Day Scheduling</h1>
          <p className="text-sm text-slate-500">Coordinate ambassador appointments, contacts, and promotion outcomes.</p>
        </div>
        <Button asChild>
          <Link href="/workflows/vendor-days?new=1">Schedule New</Link>
        </Button>
      </header>
      <Card>
        <CardHeader><CardTitle>Vendor Day Calendar Queue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{event.account.name}</p>
                <Badge variant={event.status === 'COMPLETED' ? 'success' : 'secondary'}>{event.status}</Badge>
              </div>
              <p className="text-sm text-slate-500">{new Date(event.eventDate).toLocaleString()} · Rep: {event.repName ?? 'Unassigned'} · BA: {event.ambassadorName ?? 'Unassigned'}</p>
              <p className="text-sm">Contact: {event.vdContact ?? '—'} · {event.vdContactEmail ?? '—'}</p>
              <div className="mt-2 flex justify-end gap-2">
                <ClientActionButton label="View on Map" actionMessage="Map integration coming soon" variant="outline" />
                <ClientActionButton label="Manage" actionMessage="Event management coming soon" variant="secondary" />
              </div>
            </div>
          ))}
          {events.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No upcoming vendor days.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
