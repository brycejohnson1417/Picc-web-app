import 'server-only';

import { isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { getActiveGuestInviteByEmail } from '@/lib/auth/guest-invites';
import { hasNotionWorkspaceUser } from '@/lib/server/notion-workspace-users';

const REQUIRED_EMAIL_DOMAIN = 'piccplatform.com';
const DEFAULT_ALLOWED_EMAILS = `@${REQUIRED_EMAIL_DOMAIN}`;

export interface AccessPolicyResult {
  ok: boolean;
  status: number;
  email?: string;
  accessType?: 'workspace' | 'guest';
  workspaceOrgId?: string;
  error?: string;
}

export function getWorkspaceAllowlist() {
  return parseEmailAllowlist(process.env.TERRITORY_ALLOWED_EMAILS?.trim() || DEFAULT_ALLOWED_EMAILS);
}

export function isRequiredCompanyEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail.endsWith(`@${REQUIRED_EMAIL_DOMAIN}`);
}

export async function evaluateUserAccess(email: string | null | undefined): Promise<AccessPolicyResult> {
  const normalizedEmail = email?.trim().toLowerCase() ?? '';
  if (!normalizedEmail) {
    return { ok: false, status: 403, error: 'User email not found' };
  }

  const guestInvite = await getActiveGuestInviteByEmail(normalizedEmail);
  if (guestInvite) {
    return {
      ok: true,
      status: 200,
      email: normalizedEmail,
      accessType: 'guest',
      workspaceOrgId: guestInvite.orgId,
    };
  }

  if (!isRequiredCompanyEmail(normalizedEmail)) {
    return {
      ok: false,
      status: 403,
      error: 'Use your @piccplatform.com Google account to access piccnewyork.org.',
    };
  }

  const allowlist = getWorkspaceAllowlist();
  if (!isEmailAllowed(normalizedEmail, allowlist)) {
    return {
      ok: false,
      status: 403,
      error: 'Your account is not allowlisted for this workspace.',
    };
  }

  try {
    const hasNotionAccount = await hasNotionWorkspaceUser(normalizedEmail);
    if (!hasNotionAccount) {
      return {
        ok: false,
        status: 403,
        error: 'Your @piccplatform.com email must also be a Notion workspace account.',
      };
    }
  } catch (error) {
    console.error('Failed to verify Notion workspace membership:', error);
    return {
      ok: false,
      status: 503,
      error: 'Notion workspace verification is currently unavailable.',
    };
  }

  return {
    ok: true,
    status: 200,
    email: normalizedEmail,
    accessType: 'workspace',
  };
}

export async function requireAuthorizedEmail(email: string | null | undefined) {
  const result = await evaluateUserAccess(email);
  if (!result.ok) {
    throw new Error(result.error ?? 'Access denied');
  }

  return result.email!;
}
