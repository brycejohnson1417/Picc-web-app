import { Role } from '@prisma/client';
import { requireAuthorizedEmail } from '@/lib/auth/access-policy';
import { prisma } from '@/lib/db/prisma';

export async function ensureWorkspaceAndMembership(clerkOrgId: string, clerkUserId: string, email?: string) {
  if (email) {
    await requireAuthorizedEmail(email);
  }

  const workspace = await prisma.organizationWorkspace.upsert({
    where: { clerkOrgId },
    update: {},
    create: {
      id: clerkOrgId,
      clerkOrgId,
      name: 'PICC Workspace',
    },
  });

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
        role: existingCount === 0 ? Role.ADMIN : Role.SALES_REP,
        source: 'BOOTSTRAP',
        active: true,
      },
    });
  }

  return workspace.id;
}
