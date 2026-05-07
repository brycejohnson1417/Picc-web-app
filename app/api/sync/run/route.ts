import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { NabisSyncLeaseError, syncNabisRetailersAndOrders } from '@/lib/server/nabis-sync';

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const syncModule = body.module || 'all';

  if (syncModule === 'all' || syncModule === 'nabis') {
    const result = await syncNabisRetailersAndOrders(
      ctx.orgId,
      {
        clerkUserId: ctx.userId,
        email: ctx.email,
      },
      { reconciliation: body.reconciliation === true },
    ).catch((error: unknown) => {
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
      started: 2,
      module: 'nabis',
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
