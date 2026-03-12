import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';

export default async function VendorDaysPage() {
  const { orgId } = await requireWorkspaceContext();
  const events = await prisma.vendorDayEvent.findMany({
    where: { orgId },
    include: { account: true },
    orderBy: { eventDate: 'asc' },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Vendor Days</h1>
        <p className="text-sm text-slate-500">Live vendor day scheduling module with account timeline context.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Calendar Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{event.account.name}</p>
                <Badge variant={event.status === 'COMPLETED' ? 'success' : 'secondary'}>{event.status}</Badge>
              </div>
              <p className="text-sm text-slate-500">
                {new Date(event.eventDate).toLocaleString()} · Rep: {event.repName ?? 'Unassigned'} · BA: {event.ambassadorName ?? 'Unassigned'}
              </p>
              <p className="text-sm">Contact: {event.vdContact ?? '—'} · {event.vdContactEmail ?? '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
