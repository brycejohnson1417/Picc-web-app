import { Role } from '@prisma/client';
import { markGuestInviteAccepted } from '@/lib/auth/guest-invites';
import { firstAllowlistEntryAsCsv, isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { getSharedWorkspaceId, getWorkspaceAllowlist } from '@/lib/auth/access-policy';
import { prisma } from '@/lib/db/prisma';

type AuthorizedAccessInput = {
  email: string;
  accessType: 'workspace' | 'guest';
  workspaceOrgId?: string;
};

function getAdminAllowlistCsv() {
  const explicitAdmins = parseEmailAllowlist(process.env.TERRITORY_ADMIN_EMAILS);
  if (explicitAdmins.entries.length > 0) {
    return process.env.TERRITORY_ADMIN_EMAILS;
  }

  const allowlist = getWorkspaceAllowlist();
  if (allowlist.allowAll) {
    return '*';
  }

  return firstAllowlistEntryAsCsv(allowlist);
}

function shouldGrantAdminRole(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const adminAllowlist = parseEmailAllowlist(getAdminAllowlistCsv());
  return isEmailAllowed(normalizedEmail, adminAllowlist);
}

export async function ensureWorkspaceAndMembership(clerkOrgId: string, clerkUserId: string, access: AuthorizedAccessInput) {
  const workspaceKey =
    access.accessType === 'guest'
      ? access.workspaceOrgId
      : access.workspaceOrgId ?? clerkOrgId ?? getSharedWorkspaceId();

  if (!workspaceKey) {
    throw new Error('WORKSPACE_KEY_REQUIRED');
  }

  const workspace =
    access.accessType === 'guest'
      ? await prisma.organizationWorkspace.findUnique({
          where: { id: workspaceKey },
        })
      : await prisma.organizationWorkspace.upsert({
          where: { clerkOrgId: workspaceKey },
          update: {},
          create: {
            id: workspaceKey,
            clerkOrgId: workspaceKey,
            name: 'PICC Workspace',
          },
        });

  if (!workspace) {
    throw new Error('INVITED_WORKSPACE_NOT_FOUND');
  }

  const membership = await prisma.membership.findUnique({
    where: {
      orgId_clerkUserId: {
        orgId: workspace.id,
        clerkUserId,
      },
    },
  });

  if (!membership) {
    const existingCount = await prisma.membership.count({ where: { orgId: workspace.id } });
    const shouldBeAdmin = access.accessType !== 'guest' && shouldGrantAdminRole(access.email);

    await prisma.membership.create({
      data: {
        orgId: workspace.id,
        clerkUserId,
        role:
          access.accessType === 'guest'
            ? Role.GUEST_VIEWER
            : shouldBeAdmin || existingCount === 0
              ? Role.ADMIN
              : Role.SALES_REP,
        source: 'BOOTSTRAP',
        active: true,
      },
    });
  } else {
    const shouldBeAdmin = access.accessType !== 'guest' && shouldGrantAdminRole(access.email);
    await prisma.membership.update({
      where: {
        orgId_clerkUserId: {
          orgId: workspace.id,
          clerkUserId,
        },
      },
      data: {
        active: true,
        ...(shouldBeAdmin && membership.role !== Role.ADMIN ? { role: Role.ADMIN } : {}),
      },
    });
  }

  if (access.accessType === 'guest') {
    await markGuestInviteAccepted({
      orgId: workspace.id,
      email: access.email,
      clerkUserId,
    });
  }

  return workspace.id;
}
