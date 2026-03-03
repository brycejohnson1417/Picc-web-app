import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { currency } from '@/lib/utils';
import { ClientActionButton } from '@/components/crm/client-action-button';

export default async function OverdueWorkflowPage() {
  const { orgId } = await requireWorkspaceContext();

  const overdue = await prisma.overdueSnapshot.findMany({
    where: { orgId, OR: [{ daysOverdue1: { gt: 0 } }, { daysOverdue2: { gt: 0 } }, { daysOverdue3: { gt: 0 } }] },
    include: { account: true },
    orderBy: { snapshotDate: 'desc' },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Overdue Accounts</h1>
        <p className="text-sm text-slate-500">Payment history snapshots from Sheets to prioritize collections.</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Collections Queue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {overdue.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{item.account.name}</p>
                <Badge variant="danger">{Math.max(item.daysOverdue1, item.daysOverdue2, item.daysOverdue3)} days</Badge>
              </div>
              <p className="text-sm text-slate-500">Credit Status: {item.creditStatus ?? 'Unknown'}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-red-600">Amount: {currency(Number(item.amountOverdue || 0))}</p>
                <div className="flex gap-2">
                  <ClientActionButton label="Log Activity" actionMessage="Logging collection activity coming soon" variant="outline" />
                  <ClientActionButton label="Send Reminder" actionMessage="Automated reminder coming soon" variant="secondary" />
                </div>
              </div>
            </div>
          ))}
          {overdue.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No overdue accounts found.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
