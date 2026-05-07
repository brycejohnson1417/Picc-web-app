import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { NabisSyncLeaseError, syncNabisRetailersAndOrders, syncNabisRetailersWithOptions } from '@/lib/server/nabis-sync';

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const syncModule = body.module || 'all';
  const actor = {
    clerkUserId: ctx.userId,
    email: ctx.email,
  };

  if (['all', 'nabis', 'nabis-orders', 'nabis-retailers'].includes(syncModule)) {
    const run = async () => {
      if (syncModule === 'nabis-orders') {
        return syncNabisRetailersAndOrders(ctx.orgId, actor, { reconciliation: false, syncCrm: false });
      }
      if (syncModule === 'nabis-retailers') {
        return syncNabisRetailersWithOptions(ctx.orgId, actor, { syncCrm: false });
      }
      return syncNabisRetailersAndOrders(ctx.orgId, actor, { reconciliation: body.reconciliation === true, syncCrm: false });
    };

    const result = await run().catch((error: unknown) => {
      if (error instanceof NabisSyncLeaseError) {
        return {
          leaseRefused: true as const,
          message: error.message,
          active: error.decision,
        };
      }
      throw error;
    });

    if ('leaseRefused' in result) {
      return NextResponse.json(
        {
          started: 0,
          module: 'nabis',
          error: result.message,
          active: result.active,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      started: 1,
      module: syncModule === 'all' ? 'nabis' : syncModule,
      result,
    });
  }

  const integrations = await prisma.integrationConnection.findMany({ where: { orgId: ctx.orgId, enabled: true } });

  const runs = await Promise.all(
    integrations.map((integration) =>
      prisma.syncRun.create({
        data: {
          orgId: ctx.orgId,
          integrationId: integration.id,
          module: syncModule,
          status: 'RUNNING',
          recordsIn: 0,
        },
      }),
    ),
  );

  return NextResponse.json({ started: runs.length, module: syncModule });
}
