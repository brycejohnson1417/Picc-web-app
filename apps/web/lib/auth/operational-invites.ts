import 'server-only';

import { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getActiveOperationalInviteByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return prisma.operationalAccessInvite.findFirst({
    where: {
      email: normalizedEmail,
      active: true,
      revokedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function listOperationalInvites(orgId: string) {
  return prisma.operationalAccessInvite.findMany({
    where: { orgId },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createOrRefreshOperationalInvite(input: {
  orgId: string;
  email: string;
  role?: Role;
  invitedByClerkUserId: string;
  invitedByEmail?: string | null;
  note?: string | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  return prisma.operationalAccessInvite.upsert({
    where: {
      orgId_email: {
        orgId: input.orgId,
        email: normalizedEmail,
      },
    },
    update: {
      role: input.role ?? Role.BRAND_AMBASSADOR,
      invitedByClerkUserId: input.invitedByClerkUserId,
      invitedByEmail: input.invitedByEmail?.trim().toLowerCase() ?? null,
      note: input.note?.trim() || null,
      active: true,
      revokedAt: null,
      acceptedAt: null,
      acceptedByClerkUserId: null,
    },
    create: {
      orgId: input.orgId,
      email: normalizedEmail,
      role: input.role ?? Role.BRAND_AMBASSADOR,
      invitedByClerkUserId: input.invitedByClerkUserId,
      invitedByEmail: input.invitedByEmail?.trim().toLowerCase() ?? null,
      note: input.note?.trim() || null,
      active: true,
    },
  });
}

export async function markOperationalInviteAccepted(input: { orgId: string; email: string; clerkUserId: string }) {
  return prisma.operationalAccessInvite.updateMany({
    where: {
      orgId: input.orgId,
      email: normalizeEmail(input.email),
      active: true,
      revokedAt: null,
    },
    data: {
      acceptedAt: new Date(),
      acceptedByClerkUserId: input.clerkUserId,
    },
  });
}

export async function revokeOperationalInvite(input: { orgId: string; inviteId: string }) {
  return prisma.operationalAccessInvite.updateMany({
    where: {
      id: input.inviteId,
      orgId: input.orgId,
      revokedAt: null,
    },
    data: {
      active: false,
      revokedAt: new Date(),
    },
  });
}
