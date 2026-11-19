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

export type ContactSaveMode = 'selected' | 'associated' | 'replace';

export function contactCreateMissingFields(draft: ContactCreateDraft) {
  const missing: string[] = [];
  if (!draft.accountPageId.trim()) missing.push('an account');
  if (!draft.name.trim()) missing.push("the contact's name");
  return missing;
}

export function canSubmitContactCreate(draft: ContactCreateDraft) {
  return contactCreateMissingFields(draft).length === 0;
}

export function buildContactCreatePayload(draft: ContactCreateDraft, mode: ContactSaveMode = 'selected') {
  const optional = (value: string) => value.trim() || null;
  return {
    accountPageId: draft.accountPageId.trim(),
    name: draft.name.trim(),
    position: draft.position.trim(),
    email: optional(draft.email),
    phone: optional(draft.phone),
    roles: mode === 'associated' ? [] : draft.roles,
    overwriteRoles: mode === 'replace',
  };
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
