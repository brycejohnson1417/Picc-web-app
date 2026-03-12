import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { evaluateUserAccess, getWorkspaceAllowlist } from '@/lib/auth/access-policy';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { firstAllowlistEntryAsCsv, isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { AUTH_BYPASS_MODE } from '@/lib/config/runtime';

interface AccessResult {
  ok: boolean;
  status: number;
  error?: string;
  email?: string;
  userId?: string;
  orgId?: string;
  displayName?: string;
}

function parseCsv(value: string | undefined) {
  return parseEmailAllowlist(value);
}

function getAllowlist() {
  return getWorkspaceAllowlist();
}

function getAdminAllowlistCsv(allowlist: ReturnType<typeof parseEmailAllowlist>) {
  const explicitAdmins = parseCsv(process.env.TERRITORY_ADMIN_EMAILS);
  if (explicitAdmins.entries.length > 0) {
    return process.env.TERRITORY_ADMIN_EMAILS;
  }

  if (allowlist.allowAll) {
    return '*';
  }

  return firstAllowlistEntryAsCsv(allowlist);
}

export async function checkTerritoryAccess(opts?: { requireAdmin?: boolean }): Promise<AccessResult> {
  if (AUTH_BYPASS_MODE) {
    const allowlist = getAllowlist();
    const fallbackEmail =
      firstAllowlistEntryAsCsv(allowlist)
        .split(',')
        .map((value) => value.trim())
        .find(Boolean) ?? 'demo@piccplatform.com';

    return { ok: true, status: 200, email: fallbackEmail.toLowerCase() };
  }

  const { userId, orgId } = await auth();
  if (!userId) {
    return { ok: false, status: 401, error: 'Unauthenticated' };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }

  if (opts?.requireAdmin) {
    const normalizedEmail = access.email!;
    const allowlist = getAllowlist();
    const adminAllowlist = parseEmailAllowlist(getAdminAllowlistCsv(allowlist));
    if (!isEmailAllowed(normalizedEmail, adminAllowlist)) {
      return { ok: false, status: 403, error: 'Admin access required' };
    }
  }

  const workspaceKey = orgId ?? `user_${userId}`;
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, access.email);

  return {
    ok: true,
    status: 200,
    email: access.email,
    userId,
    orgId: workspaceOrgId,
    displayName: user?.fullName ?? user?.firstName ?? access.email,
  };
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
    userId: result.userId ?? null,
    orgId: result.orgId ?? null,
    displayName: result.displayName ?? result.email!,
  };
}
