import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { currency } from '@/lib/utils';
import { QueryToast } from '@/components/crm/query-toast';
import { ClientActionButton } from '@/components/crm/client-action-button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default async function PipelinesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { orgId } = await requireWorkspaceContext();
  const params = await searchParams;

  const pipeline = await prisma.pipeline.findFirst({
    where: { orgId },
    include: {
      stages: {
        orderBy: { sortOrder: 'asc' },
        include: {
          opportunities: {
            where: { status: 'OPEN' },
            include: { account: true },
            orderBy: { updatedAt: 'desc' },
          },
        },
      },
    },
  });

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
        <p className="mb-4 text-sm text-slate-500">No pipeline configured for this organization.</p>
        <Button onClick={() => {}}>Create First Pipeline</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {params.new === '1' && <QueryToast message="New Opportunity form coming soon" />}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pipelines & Opportunities</h1>
          <p className="text-sm text-slate-500">Manage your sales stages and track deal progress.</p>
        </div>
        <Button asChild>
          <Link href="/pipelines?new=1">
            <Plus className="mr-2 h-4 w-4" />
            Add Opportunity
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-4 overflow-x-auto pb-4">
        {pipeline.stages.map((stage) => (
          <div key={stage.id} className="min-w-[280px]">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{stage.name}</h2>
              <Badge variant="secondary" className="rounded-full">{stage.opportunities.length}</Badge>
            </div>
            <Card className="bg-slate-50/50 dark:bg-slate-900/50 border-dashed min-h-[500px]">
              <CardContent className="p-2 space-y-2">
                {stage.opportunities.map((opp) => (
                  <Card key={opp.id} className="cursor-grab active:cursor-grabbing hover:border-blue-300 transition-colors shadow-sm">
                    <CardContent className="p-3">
                      <p className="font-semibold text-sm mb-1">{opp.name}</p>
                      <p className="text-xs text-slate-500 mb-2">{opp.account.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-primary">{currency(Number(opp.value))}</span>
                        <ClientActionButton label="Edit" actionMessage="Opportunity editor coming soon" variant="ghost" className="h-7 w-7 p-0">
                          <Plus className="h-4 w-4 rotate-45" />
                        </ClientActionButton>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {stage.opportunities.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <p className="text-xs italic">Empty stage</p>
                  </div>
                )}
                <Button variant="ghost" className="w-full h-9 border-dashed border border-slate-200 text-slate-500 hover:text-primary hover:border-primary text-xs" onClick={() => {}}>
                  + Add Opportunity
                </Button>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
