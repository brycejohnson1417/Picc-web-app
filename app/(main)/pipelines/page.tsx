import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { PipelinesClient } from '@/components/crm/pipelines-client';
import { prisma } from '@/lib/db/prisma';

export default async function PipelinesPage() {
  const { orgId } = await requireWorkspaceContext();

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
    return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No pipeline configured.</div>;
  }

  return <PipelinesClient initialStages={pipeline.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    sortOrder: stage.sortOrder,
    opportunities: stage.opportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      status: opp.status,
      value: Number(opp.value),
      account: {
        id: opp.account.id,
        name: opp.account.name,
      },
      updatedAt: opp.updatedAt.toISOString(),
    })),
  }))} />;
}
