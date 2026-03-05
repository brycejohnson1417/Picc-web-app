import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

const patchSchema = z
  .object({
    role: z.nativeEnum(Role).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ membershipId: string }> }) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  const { membershipId } = await context.params;

  const existing = await prisma.membership.findFirst({
    where: { id: membershipId, orgId: ctx.orgId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.membership.update({
      where: { id: membershipId },
      data: {
        role: payload.role,
        active: payload.active,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid membership payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update membership' }, { status: 500 });
  }
}
