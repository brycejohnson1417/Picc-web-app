import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { evaluateUserAccess, getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { requireRole } from '@/lib/rbac/guards';
import type { AppRole } from '@/lib/types/rbac';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';

export async function withOrg() {
  if (AUTH_BYPASS_MODE) {
    return { userId: DEMO_USER_ID, orgId: DEMO_ORG_ID };
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    throw NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    throw NextResponse.json({ error: access.error }, { status: access.status });
  }

  const workspaceKey = access.workspaceOrgId ?? orgId ?? getSharedWorkspaceId();
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, {
    email: access.email!,
    accessType: access.accessType ?? 'workspace',
    workspaceOrgId: access.workspaceOrgId,
  });
  return { userId, orgId: workspaceOrgId };
}

export async function withRole(allowedRoles: AppRole[]) {
  const { userId, orgId } = await withOrg();
  await requireRole(orgId, userId, allowedRoles);
  return { userId, orgId };
}
