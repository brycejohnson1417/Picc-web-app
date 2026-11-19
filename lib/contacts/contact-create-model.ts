export type ContactAccountOption = {
  notionPageId: string;
  name: string;
  city: string | null;
  state: string | null;
};

export type ContactCreateDraft = {
  accountPageId: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  roles: ContactRole[];
};

export type ContactCreateStatus = 'created_verified' | 'existing_verified' | 'partial_relation';

export function filterContactAccounts<T extends ContactAccountOption>(accounts: T[], query: string) {
  const normalized = query.trim().toLocaleLowerCase('en-US');
  if (!normalized) return accounts;
  return accounts.filter((account) =>
    [account.name, account.city, account.state]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('en-US')
      .includes(normalized),
  );
}

export function buildContactCreatePayload(draft: ContactCreateDraft, overwriteRoles = false) {
  const optional = (value: string) => value.trim() || null;
  return {
    accountPageId: draft.accountPageId.trim(),
    name: draft.name.trim(),
    position: draft.position.trim(),
    email: optional(draft.email),
    phone: optional(draft.phone),
    roles: draft.roles,
    overwriteRoles,
  };
}

export function contactCreateMissingFields(draft: ContactCreateDraft) {
  const missing: string[] = [];
  if (!draft.accountPageId.trim()) missing.push('an account');
  if (!draft.name.trim()) missing.push("the contact's name");
  if (!draft.position.trim()) missing.push('their role / position');
  return missing;
}

export function contactCreateMessage(status: ContactCreateStatus) {
  if (status === 'created_verified') {
    return 'Contact created and linked to the account in Notion.';
  }
  if (status === 'existing_verified') {
    return 'This contact already existed. Its account link is verified.';
  }
  return 'The contact was saved, but we could not verify both relationship links yet.';
}
import type { ContactRole } from '@/lib/contacts/contact-profile';
