import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { createOrRefreshOperationalInvite, listOperationalInvites, revokeOperationalInvite } from '@/lib/auth/operational-invites';

export const dynamic = 'force-dynamic';

const createInviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(Role).default(Role.SALES_REP),
  note: z.string().trim().max(500).optional().nullable(),
});

const patchInviteSchema = z.object({
  inviteId: z.string().trim().min(1),
  action: z.enum(['revoke']),
});

function serializeInvite(invite: Awaited<ReturnType<typeof listOperationalInvites>>[number], origin: string) {
  const inviteEmail = invite.email.trim().toLowerCase();
  const inviteLink = `${origin}/sign-in?invite=operational&email=${encodeURIComponent(inviteEmail)}`;

  return {
    id: invite.id,
    email: inviteEmail,
    role: invite.role,
    active: invite.active,
    note: invite.note,
    invitedByEmail: invite.invitedByEmail,
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
    inviteLink,
  };
}

export async function GET(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const origin = new URL(request.url).origin;
    const invites = await listOperationalInvites(ctx.orgId);
    return NextResponse.json({
      invites: invites.map((invite) => serializeInvite(invite, origin)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load operational invites';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const origin = new URL(request.url).origin;
    const payload = createInviteSchema.parse(await request.json());
    const invite = await createOrRefreshOperationalInvite({
      orgId: ctx.orgId,
      email: payload.email,
      role: payload.role,
      note: payload.note,
      invitedByClerkUserId: ctx.userId,
      invitedByEmail: ctx.email ?? null,
    });
    return NextResponse.json({
      invite: serializeInvite(invite, origin),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid operational invite payload', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to create operational invite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = patchInviteSchema.parse(await request.json());
    if (payload.action === 'revoke') {
      await revokeOperationalInvite({
        orgId: ctx.orgId,
        inviteId: payload.inviteId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid operational invite update', details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update operational invite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
