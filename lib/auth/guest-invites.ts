import 'server-only';

import { GuestInviteStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getActiveGuestInviteByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return prisma.guestAccessInvite.findFirst({
    where: {
      email: normalizedEmail,
      status: {
        in: [GuestInviteStatus.PENDING, GuestInviteStatus.ACCEPTED],
      },
      revokedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listGuestInvites(orgId: string) {
  return prisma.guestAccessInvite.findMany({
    where: { orgId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function createOrRefreshGuestInvite(input: {
  orgId: string;
  email: string;
  invitedByClerkUserId: string;
  invitedByEmail?: string | null;
  note?: string | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  return prisma.guestAccessInvite.upsert({
    where: {
      orgId_email: {
        orgId: input.orgId,
        email: normalizedEmail,
      },
    },
    update: {
      invitedByClerkUserId: input.invitedByClerkUserId,
      invitedByEmail: input.invitedByEmail?.trim().toLowerCase() ?? null,
      note: input.note?.trim() || null,
      status: GuestInviteStatus.PENDING,
      revokedAt: null,
      acceptedAt: null,
      acceptedByClerkUserId: null,
    },
    create: {
      orgId: input.orgId,
      email: normalizedEmail,
      invitedByClerkUserId: input.invitedByClerkUserId,
      invitedByEmail: input.invitedByEmail?.trim().toLowerCase() ?? null,
      note: input.note?.trim() || null,
      status: GuestInviteStatus.PENDING,
    },
  });
}

export async function markGuestInviteAccepted(input: {
  orgId: string;
  email: string;
  clerkUserId: string;
}) {
  return prisma.guestAccessInvite.updateMany({
    where: {
      orgId: input.orgId,
      email: normalizeEmail(input.email),
      status: GuestInviteStatus.PENDING,
      revokedAt: null,
    },
    data: {
      status: GuestInviteStatus.ACCEPTED,
      acceptedAt: new Date(),
      acceptedByClerkUserId: input.clerkUserId,
    },
  });
}

export async function revokeGuestInvite(input: {
  orgId: string;
  inviteId: string;
}) {
  return prisma.guestAccessInvite.updateMany({
    where: {
      id: input.inviteId,
      orgId: input.orgId,
      revokedAt: null,
    },
    data: {
      status: GuestInviteStatus.REVOKED,
      revokedAt: new Date(),
    },
  });
}

export async function isGuestInviteActiveForOrg(orgId: string, email: string) {
  const invite = await prisma.guestAccessInvite.findFirst({
    where: {
      orgId,
      email: normalizeEmail(email),
      status: {
        in: [GuestInviteStatus.PENDING, GuestInviteStatus.ACCEPTED],
      },
      revokedAt: null,
    },
    select: { id: true },
  });

  return Boolean(invite);
}
