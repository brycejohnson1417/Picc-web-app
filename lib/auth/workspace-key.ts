import 'server-only';

const DEFAULT_PICC_EMAIL_DOMAIN = 'piccplatform.com';
const DEFAULT_PICC_SHARED_ORG_ID = 'org_piccplatform';

function parseDomains(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) {
    return [DEFAULT_PICC_EMAIL_DOMAIN];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const piccEmailDomains = parseDomains(process.env.PICC_ALLOWED_EMAIL_DOMAINS);

export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function isPiccDomainEmail(value: string | null | undefined) {
  const email = normalizeEmail(value);
  if (!email.includes('@')) return false;

  return piccEmailDomains.some((domain) => email.endsWith(`@${domain}`));
}

export function resolveWorkspaceKey(input: {
  authOrgId?: string | null;
  userId: string;
  email?: string | null;
}) {
  const authOrgId = input.authOrgId?.trim();
  if (authOrgId) {
    return authOrgId;
  }

  if (isPiccDomainEmail(input.email)) {
    return process.env.PICC_SHARED_ORG_ID?.trim() || DEFAULT_PICC_SHARED_ORG_ID;
  }

  return `user_${input.userId}`;
}
