import 'server-only';

export interface ParsedEmailAllowlist {
  allowAll: boolean;
  exactEmails: Set<string>;
  domains: Set<string>;
  entries: string[];
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDomain(value: string) {
  const normalized = normalize(value).replace(/^@+/, '');
  return normalized;
}

export function parseEmailAllowlist(csv: string | undefined): ParsedEmailAllowlist {
  const entries = (csv ?? '')
    .split(',')
    .map((entry) => normalize(entry))
    .filter(Boolean);

  const exactEmails = new Set<string>();
  const domains = new Set<string>();
  let allowAll = false;

  for (const entry of entries) {
    if (entry === '*') {
      allowAll = true;
      continue;
    }

    if (entry.startsWith('@')) {
      const domain = normalizeDomain(entry);
      if (domain) domains.add(domain);
      continue;
    }

    if (entry.includes('@')) {
      exactEmails.add(entry);
      continue;
    }

    // Support plain domains, e.g. piccplatform.com
    if (entry.includes('.')) {
      const domain = normalizeDomain(entry);
      if (domain) domains.add(domain);
      continue;
    }

    // Fall back to exact matching for malformed entries.
    exactEmails.add(entry);
  }

  return {
    allowAll,
    exactEmails,
    domains,
    entries,
  };
}

export function isEmailAllowed(email: string, allowlist: ParsedEmailAllowlist) {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail) {
    return false;
  }

  if (allowlist.allowAll) {
    return true;
  }

  if (allowlist.exactEmails.has(normalizedEmail)) {
    return true;
  }

  const [, domain = ''] = normalizedEmail.split('@');
  if (!domain) {
    return false;
  }

  return allowlist.domains.has(domain);
}

export function firstAllowlistEntryAsCsv(allowlist: ParsedEmailAllowlist) {
  const firstEntry = allowlist.entries[0];
  return firstEntry ? firstEntry : '';
}
