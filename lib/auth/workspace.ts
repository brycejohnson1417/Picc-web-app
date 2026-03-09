import { cache } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
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
  const allowlist = parseEmailAllowlist(process.env.TERRITORY_ALLOWED_EMAILS);
  if (allowlist.entries.length === 0) {
    throw new Error('ALLOWLIST_NOT_CONFIGURED');
  }
  if (!isEmailAllowed(email, allowlist)) {
    throw new Error('ACCESS_DENIED');
  }

  const workspaceKey = orgId ?? `user_${userId}`;
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, email);
  return { userId, orgId: workspaceOrgId };
});

export async function requireWorkspaceContext() {
  return loadWorkspaceContext();
}
