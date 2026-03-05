import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

const inviteSchema = z.object({
  clerkUserId: z.string().min(3),
  role: z.nativeEnum(Role),
});

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = inviteSchema.parse(await request.json());

    const membership = await prisma.membership.upsert({
      where: {
        orgId_clerkUserId: {
          orgId: ctx.orgId,
          clerkUserId: payload.clerkUserId,
        },
      },
      update: {
        role: payload.role,
        active: true,
        source: 'INVITE',
      },
      create: {
        orgId: ctx.orgId,
        clerkUserId: payload.clerkUserId,
        role: payload.role,
        active: true,
        source: 'INVITE',
      },
    });

    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid invite payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to invite user' }, { status: 500 });
  }
}
