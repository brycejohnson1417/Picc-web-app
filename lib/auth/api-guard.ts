import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { AppRole } from '@/lib/types/rbac';
import { evaluateUserAccess, getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { getUserRole } from '@/lib/rbac/guards';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';

export async function guard(allowedRoles?: AppRole[]) {
  if (AUTH_BYPASS_MODE) {
    const role: AppRole = 'ADMIN';
    if (allowedRoles?.length && !allowedRoles.includes(role)) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { orgId: DEMO_ORG_ID, userId: DEMO_USER_ID, email: 'demo@piccplatform.com', ...(allowedRoles?.length ? { role } : {}) };
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
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    return { error: NextResponse.json({ error: access.error }, { status: access.status }) };
  }

    const workspaceKey = access.workspaceOrgId ?? orgId ?? getSharedWorkspaceId();
    let workspaceOrgId = workspaceKey;
    try {
      workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, {
        email: access.email!,
        accessType: access.accessType ?? 'workspace',
        workspaceOrgId: access.workspaceOrgId,
      });
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
    return { orgId: workspaceOrgId, userId, role, email: access.email! };
  }

  return { orgId: workspaceOrgId, userId, email: access.email! };
}

function getMissingEnv() {
  const required = ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'DATABASE_URL'] as const;
  return required.filter((key) => !process.env[key]);
}
