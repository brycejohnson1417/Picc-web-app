import { cache } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { evaluateUserAccess } from '@/lib/auth/access-policy';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';

const loadWorkspaceContext = cache(async () => {
  if (AUTH_BYPASS_MODE) {
    return { userId: DEMO_USER_ID, orgId: DEMO_ORG_ID };
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error('UNAUTHENTICATED');
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    throw new Error(access.status === 503 ? 'ACCESS_VERIFICATION_UNAVAILABLE' : 'ACCESS_DENIED');
  }

  const workspaceKey = orgId ?? `user_${userId}`;
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, access.email);
  return { userId, orgId: workspaceOrgId };
});

export async function requireWorkspaceContext() {
  return loadWorkspaceContext();
}
