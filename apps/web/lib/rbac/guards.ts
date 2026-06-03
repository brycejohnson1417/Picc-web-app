import { prisma } from '@/lib/db/prisma';
import { type AppRole } from '@/lib/types/rbac';
import { cookies } from 'next/headers';

const ACTIVE_ROLE_COOKIE = 'picc_active_role';

function isValidRole(role: string | null | undefined): role is AppRole {
  return role === 'ADMIN' || role === 'OPS_TEAM' || role === 'SALES_REP' || role === 'FINANCE' || role === 'BRAND_AMBASSADOR' || role === 'GUEST_VIEWER';
}

export function getActiveRoleCookieName() {
  return ACTIVE_ROLE_COOKIE;
}

export async function getUserRoles(orgId: string, clerkUserId: string): Promise<AppRole[]> {
  const [membership, grants] = await Promise.all([
    prisma.membership.findUnique({
      where: {
        orgId_clerkUserId: {
          orgId,
          clerkUserId,
        },
      },
      select: { role: true },
    }),
    prisma.membershipRoleGrant.findMany({
      where: { orgId, clerkUserId, active: true },
      select: { role: true },
    }),
  ]);

  if (!membership) {
    throw new Error('ROLE_NOT_FOUND');
  }

  return [...new Set([membership.role as AppRole, ...grants.map((grant) => grant.role as AppRole)])];
}

export async function getUserRole(orgId: string, clerkUserId: string): Promise<AppRole> {
  const availableRoles = await getUserRoles(orgId, clerkUserId);
  const cookieStore = await cookies();
  const requestedRole = cookieStore.get(ACTIVE_ROLE_COOKIE)?.value;
  if (isValidRole(requestedRole) && availableRoles.includes(requestedRole)) {
    return requestedRole;
  }

  return availableRoles[0];
}

export async function requireRole(orgId: string, clerkUserId: string, allowed: AppRole[]) {
  const role = await getUserRole(orgId, clerkUserId);

  if (!allowed.includes(role)) {
    throw new Error('FORBIDDEN');
  }

  return role;
}
