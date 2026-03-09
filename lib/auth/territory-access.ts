import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { firstAllowlistEntryAsCsv, isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { AUTH_BYPASS_MODE } from '@/lib/config/runtime';

interface AccessResult {
  ok: boolean;
  status: number;
  error?: string;
  email?: string;
}

function parseCsv(value: string | undefined) {
  return parseEmailAllowlist(value);
}

function getAllowlist() {
  return parseCsv(process.env.TERRITORY_ALLOWED_EMAILS);
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

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, status: 401, error: 'Unauthenticated' };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  if (!email) {
    return { ok: false, status: 403, error: 'User email not found' };
  }

  const allowlist = getAllowlist();
  if (allowlist.entries.length === 0) {
    return {
      ok: false,
      status: 503,
      error: 'TERRITORY_ALLOWED_EMAILS is not configured',
    };
  }

  const normalizedEmail = email.toLowerCase();
  if (!isEmailAllowed(normalizedEmail, allowlist)) {
    return { ok: false, status: 403, error: 'Access denied for this user' };
  }

  if (opts?.requireAdmin) {
    const adminAllowlist = parseEmailAllowlist(getAdminAllowlistCsv(allowlist));
    if (!isEmailAllowed(normalizedEmail, adminAllowlist)) {
      return { ok: false, status: 403, error: 'Admin access required' };
    }
  }

  return { ok: true, status: 200, email: normalizedEmail };
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
  };
}
