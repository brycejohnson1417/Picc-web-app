import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  const membership = await prisma.membership.findUnique({
    where: {
      orgId_clerkUserId: {
        orgId: ctx.orgId,
        clerkUserId: ctx.userId,
      },
    },
    select: {
      testModeEnabled: true,
    },
  });

  return NextResponse.json({
    testModeEnabled: Boolean(membership?.testModeEnabled),
  });
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = patchSchema.parse(await request.json());
    const membership = await prisma.membership.update({
      where: {
        orgId_clerkUserId: {
          orgId: ctx.orgId,
          clerkUserId: ctx.userId,
        },
      },
      data: {
        testModeEnabled: payload.enabled,
      },
      select: {
        testModeEnabled: true,
      },
    });

    return NextResponse.json({
      testModeEnabled: membership.testModeEnabled,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid test mode payload', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to update test mode';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
