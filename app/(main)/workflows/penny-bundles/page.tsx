import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { currency } from '@/lib/utils';
import { QueryToast } from '@/components/crm/query-toast';
import { ClientActionButton } from '@/components/crm/client-action-button';
import Link from 'next/link';

export default async function PennyBundlesWorkflowPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { orgId } = await requireWorkspaceContext();
  const params = await searchParams;

  const items = await prisma.pennyBundleCreditSubmission.findMany({
    where: { orgId },
    include: { account: true, vendorDayEvent: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6">
      {params.new === '1' && <QueryToast message="New Penny Bundle submission form coming soon" />}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Penny Bundle Credits</h1>
          <p className="text-sm text-slate-500">Review and process penny bundle promotion credit submissions.</p>
        </div>
        <Button asChild>
          <Link href="/workflows/penny-bundles?new=1">Submit New</Link>
        </Button>
      </header>
      <Card>
        <CardHeader><CardTitle>Submission Queue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{item.account.name}</p>
                <Badge variant={item.status === 'APPROVED' || item.status === 'COMPLETED' ? 'success' : 'warning'}>{item.status}</Badge>
              </div>
              <p className="text-sm text-slate-500">Order #{item.orderNumber ?? '—'} · Credit Memo {item.creditMemo ?? '—'}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm">Amount: {currency(Number(item.creditAmount || 0))}</p>
                <div className="flex gap-2">
                  <ClientActionButton label="View Details" actionMessage="Viewing details coming soon" variant="outline" />
                  {item.status !== 'APPROVED' && item.status !== 'COMPLETED' && (
                    <ClientActionButton label="Process" actionMessage="Processing credit memo coming soon" variant="secondary" />
                  )}
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No active submissions.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
