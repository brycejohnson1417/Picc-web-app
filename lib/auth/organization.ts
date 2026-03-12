import { auth, currentUser } from '@clerk/nextjs/server';
import { evaluateUserAccess } from '@/lib/auth/access-policy';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';

export async function requireOrgContext() {
  if (AUTH_BYPASS_MODE) {
    return { userId: DEMO_USER_ID, orgId: DEMO_ORG_ID };
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error('UNAUTHENTICATED');
  }

  if (!orgId) {
    throw new Error('NO_ORGANIZATION');
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    throw new Error(access.error ?? 'ACCESS_DENIED');
  }

  const workspaceKey = access.workspaceOrgId ?? orgId;
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, {
    email: access.email!,
    accessType: access.accessType ?? 'workspace',
    workspaceOrgId: access.workspaceOrgId,
  });
  return { userId, orgId: workspaceOrgId };
}
