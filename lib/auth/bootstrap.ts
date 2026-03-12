import { Role } from '@prisma/client';
import { markGuestInviteAccepted } from '@/lib/auth/guest-invites';
import { prisma } from '@/lib/db/prisma';

type AuthorizedAccessInput = {
  email: string;
  accessType: 'workspace' | 'guest';
  workspaceOrgId?: string;
};

export async function ensureWorkspaceAndMembership(clerkOrgId: string, clerkUserId: string, access: AuthorizedAccessInput) {
  const workspace =
    access.accessType === 'guest'
      ? await prisma.organizationWorkspace.findUnique({
          where: { id: access.workspaceOrgId },
        })
      : await prisma.organizationWorkspace.upsert({
          where: { clerkOrgId },
          update: {},
          create: {
            id: clerkOrgId,
            clerkOrgId,
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

    await prisma.membership.create({
      data: {
        orgId: workspace.id,
        clerkUserId,
        role: access.accessType === 'guest' ? Role.GUEST_VIEWER : existingCount === 0 ? Role.ADMIN : Role.SALES_REP,
        source: 'BOOTSTRAP',
        active: true,
      },
    });
  } else if (!membership.active) {
    await prisma.membership.update({
      where: {
        orgId_clerkUserId: {
          orgId: workspace.id,
          clerkUserId,
        },
      },
      data: { active: true },
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
