import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';

interface AccessResult {
  ok: boolean;
  status: number;
  error?: string;
  email?: string;
  orgId?: string;
}

function parseCsv(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getAllowlist() {
  return parseCsv(process.env.TERRITORY_ALLOWED_EMAILS);
}

function getAdminAllowlist(allowlist: Set<string>) {
  const explicitAdmins = parseCsv(process.env.TERRITORY_ADMIN_EMAILS);
  if (explicitAdmins.size > 0) {
    return explicitAdmins;
  }

  if (allowlist.has('*')) {
    return new Set(['*']);
  }

  const fallbackFirst = [...allowlist][0];
  return fallbackFirst ? new Set([fallbackFirst]) : new Set<string>();
}

export async function checkTerritoryAccess(opts?: { requireAdmin?: boolean }): Promise<AccessResult> {
  let userId: string | null = null;
  let authOrgId: string | null = null;
  try {
    const authResult = await auth();
    userId = authResult.userId ?? null;
    authOrgId = authResult.orgId ?? null;
  } catch {
    return { ok: false, status: 503, error: 'Auth unavailable' };
  }

  if (!userId) {
    return { ok: false, status: 401, error: 'Unauthenticated' };
  }

  let workspaceOrgId: string;
  try {
    const workspaceKey = authOrgId ?? `user_${userId}`;
    workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId);
  } catch {
    return { ok: false, status: 500, error: 'Workspace bootstrap failed' };
  }

  const user = await currentUser().catch(() => null);
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) {
    return { ok: false, status: 403, error: 'User email not found' };
  }
  const normalizedEmail = email.toLowerCase();

  const allowlist = getAllowlist();
  if (allowlist.size === 0) {
    if (opts?.requireAdmin) {
      return {
        ok: false,
        status: 503,
        error: 'TERRITORY_ADMIN_EMAILS is not configured',
      };
    }

    // Backward-compatible fallback: authenticated users can access territory
    // surfaces when no explicit email allowlist is configured.
    return { ok: true, status: 200, email: normalizedEmail, orgId: workspaceOrgId };
  }

  const allowAll = allowlist.has('*');
  if (!allowAll && !allowlist.has(normalizedEmail)) {
    return { ok: false, status: 403, error: 'Access denied for this user' };
  }

  if (opts?.requireAdmin) {
    const adminAllowlist = getAdminAllowlist(allowlist);
    if (!adminAllowlist.has('*') && !adminAllowlist.has(normalizedEmail)) {
      return { ok: false, status: 403, error: 'Admin access required' };
    }
  }

  return { ok: true, status: 200, email: normalizedEmail, orgId: workspaceOrgId };
}

export async function requireTerritoryApiAccess(opts?: { requireAdmin?: boolean }) {
  const result = await checkTerritoryAccess(opts);
  if (!result.ok) {
    return {
      error: NextResponse.json(
        {
          error: result.error,
        },
        {
          status: result.status,
        },
      ),
    };
  }

  return {
    email: result.email!,
    orgId: result.orgId!,
  };
}
