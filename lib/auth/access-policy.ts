import 'server-only';

import { isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { getActiveGuestInviteByEmail } from '@/lib/auth/guest-invites';
import { getActiveOperationalInviteByEmail } from '@/lib/auth/operational-invites';

const REQUIRED_EMAIL_DOMAIN = 'piccplatform.com';
const DEFAULT_ALLOWED_EMAILS = `@${REQUIRED_EMAIL_DOMAIN}`;
const DEFAULT_SHARED_WORKSPACE_ID = 'picc_company_workspace';

export interface AccessPolicyResult {
  ok: boolean;
  status: number;
  email?: string;
  accessType?: 'workspace' | 'guest';
  workspaceOrgId?: string;
  invitedRole?: 'ADMIN' | 'OPS_TEAM' | 'SALES_REP' | 'FINANCE' | 'BRAND_AMBASSADOR' | 'GUEST_VIEWER';
  error?: string;
}

export function getWorkspaceAllowlist() {
  return parseEmailAllowlist(process.env.TERRITORY_ALLOWED_EMAILS?.trim() || DEFAULT_ALLOWED_EMAILS);
}

export function getSharedWorkspaceId() {
  return process.env.PICC_WORKSPACE_ORG_ID?.trim() || DEFAULT_SHARED_WORKSPACE_ID;
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

  const operationalInvite = await getActiveOperationalInviteByEmail(normalizedEmail);
  if (operationalInvite) {
    return {
      ok: true,
      status: 200,
      email: normalizedEmail,
      accessType: 'workspace',
      workspaceOrgId: operationalInvite.orgId,
      invitedRole: operationalInvite.role,
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
