import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { AppRole } from '@/lib/types/rbac';
import { getUserRole } from '@/lib/rbac/guards';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';

export async function guard(allowedRoles?: AppRole[]) {
  if (AUTH_BYPASS_MODE) {
    const role: AppRole = 'ADMIN';
    if (allowedRoles?.length && !allowedRoles.includes(role)) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { orgId: DEMO_ORG_ID, userId: DEMO_USER_ID, ...(allowedRoles?.length ? { role } : {}) };
  }

  const missingEnv = getMissingEnv();
  if (missingEnv.length > 0) {
    return {
      error: NextResponse.json(
        {
          error: 'Environment not configured',
          missing: missingEnv,
        },
        { status: 503 },
      ),
    };
  }

  let userId: string | null = null;
  let orgId: string | null = null;
  try {
    const authResult = await auth();
    userId = authResult.userId ?? null;
    orgId = authResult.orgId ?? null;
  } catch {
    return { error: NextResponse.json({ error: 'Auth unavailable' }, { status: 503 }) };
  }

  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  }

  let email = '';
  try {
    const user = await currentUser();
    email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  } catch {
    return { error: NextResponse.json({ error: 'Auth unavailable' }, { status: 503 }) };
  }
  const allowlist = parseEmailAllowlist(process.env.TERRITORY_ALLOWED_EMAILS);
  if (allowlist.entries.length === 0) {
    return { error: NextResponse.json({ error: 'TERRITORY_ALLOWED_EMAILS is not configured' }, { status: 503 }) };
  }
  if (!isEmailAllowed(email, allowlist)) {
    return { error: NextResponse.json({ error: 'Access denied for this user' }, { status: 403 }) };
  }

  const workspaceKey = orgId ?? `user_${userId}`;
  let workspaceOrgId = workspaceKey;
  try {
    workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, email);
  } catch {
    return { error: NextResponse.json({ error: 'Workspace bootstrap failed' }, { status: 500 }) };
  }

  if (allowedRoles?.length) {
    let role: AppRole;
    try {
      role = await getUserRole(workspaceOrgId, userId);
    } catch {
      return { error: NextResponse.json({ error: 'Membership role not configured' }, { status: 403 }) };
    }
    if (!allowedRoles.includes(role)) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { orgId: workspaceOrgId, userId, role };
  }

  return { orgId: workspaceOrgId, userId };
}

function getMissingEnv() {
  const required = ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'DATABASE_URL'] as const;
  return required.filter((key) => !process.env[key]);
}
