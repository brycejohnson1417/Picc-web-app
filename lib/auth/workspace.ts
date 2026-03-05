import { cache } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { DEMO_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';
import { resolveWorkspaceKey } from '@/lib/auth/workspace-key';

const loadWorkspaceContext = cache(async () => {
  if (DEMO_MODE) {
    return { userId: DEMO_USER_ID, orgId: DEMO_ORG_ID };
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error('UNAUTHENTICATED');
  }

  const user = await currentUser().catch(() => null);
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
  const workspaceKey = resolveWorkspaceKey({ authOrgId: orgId, userId, email });
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId);
  return { userId, orgId: workspaceOrgId };
});

export async function requireWorkspaceContext() {
  return loadWorkspaceContext();
}
