import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { QueryToast } from '@/components/crm/query-toast';
import { ClientActionButton } from '@/components/crm/client-action-button';
import Link from 'next/link';

export default async function SampleBoxesWorkflowPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { orgId } = await requireWorkspaceContext();
  const params = await searchParams;

  const requests = await prisma.sampleBoxRequest.findMany({ where: { orgId }, include: { account: true, contact: true }, orderBy: { createdAt: 'desc' } });

  return (
    <div className="space-y-6">
      {params.new === '1' && <QueryToast message="New Sample Box request coming soon" />}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sample Box Requests</h1>
          <p className="text-sm text-slate-500">Track lead sample box approvals, fulfillment status, and follow-up dependencies.</p>
        </div>
        <Button asChild>
          <Link href="/workflows/sample-boxes?new=1">Request New</Link>
        </Button>
      </header>
      <Card>
        <CardHeader><CardTitle>Request Queue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {requests.map((request) => (
            <div key={request.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{request.account.name}</p>
                <Badge variant={request.status === 'APPROVED' || request.status === 'COMPLETED' ? 'success' : 'warning'}>{request.status}</Badge>
              </div>
              <p className="text-sm text-slate-500">Requested by: {request.requestedBy} · Contact: {request.contact ? `${request.contact.firstName} ${request.contact.lastName}` : 'N/A'}</p>
              <p className="text-sm mt-1 italic">Reason: {request.requestReason}</p>
              <div className="mt-2 flex justify-end gap-2">
                <ClientActionButton label="View Lead" actionMessage="Viewing lead details coming soon" variant="outline" />
                {request.status !== 'APPROVED' && request.status !== 'COMPLETED' && (
                  <ClientActionButton label="Approve" actionMessage="Approving request coming soon" variant="secondary" />
                )}
              </div>
            </div>
          ))}
          {requests.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No active sample requests.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
