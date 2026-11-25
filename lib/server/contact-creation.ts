import { PrimaryContactChangedError, samePrimaryContact, type PrimaryContactPreview, type PrimaryContactSnapshot } from '@/lib/contacts/primary-contact';
import {
  buildRoleCollisionPreview,
  type ContactRole,
  type ExistingRoleAssignment,
} from '@/lib/contacts/contact-profile';

export type CreateContactInput = {
  accountPageId: string;
  name: string;
  position: string;
  email: string | null;
  phone: string | null;
  roles?: ContactRole[];
  overwriteRoles?: boolean;
  expectedPrimary?: PrimaryContactSnapshot;
  expectedPrimaryReplacement?: PrimaryContactPreview['after'];
};

export type ContactRecord = {
  id: string;
  name: string;
  position: string;
  email: string | null;
  phone: string | null;
};

export type ContactCreationOutcome =
  | {
      status: 'created_verified' | 'existing_verified';
      contact: ContactRecord;
      accountPageId: string;
    }
  | {
      status: 'partial_relation';
      contact: ContactRecord;
      accountPageId: string;
      retry: {
        accountPageId: string;
        contactPageId: string;
        roles?: ContactRole[];
      };
    }
  | {
      status: 'role_collision';
      contact: ContactRecord | null;
      accountPageId: string;
      collisions: ReturnType<typeof buildRoleCollisionPreview>;
      primaryPreview?: PrimaryContactPreview;
    };

export type RetryContactLinkInput = {
  accountPageId: string;
  contactPageId: string;
  roles?: ContactRole[];
};

export interface ContactCreationAdapter {
  requireAccount(accountPageId: string): Promise<void>;
  findContact(accountPageId: string, normalizedName: string): Promise<ContactRecord | null>;
  getContact(contactPageId: string): Promise<ContactRecord>;
  createContact(input: CreateContactInput): Promise<ContactRecord>;
  ensureAccountContact(accountPageId: string, contactPageId: string): Promise<void>;
  verifyBothSides(accountPageId: string, contactPageId: string): Promise<boolean>;
  getRoleAssignments?(
    accountPageId: string,
    roles: ContactRole[],
  ): Promise<Partial<Record<ContactRole, ExistingRoleAssignment[]>>>;
  assignRoles?(accountPageId: string, contactPageId: string, roles: ContactRole[]): Promise<void>;
  previewPrimaryContact?(accountPageId: string, contact: Omit<ContactRecord, 'id'>): Promise<PrimaryContactPreview>;
  assignPrimaryContact?(accountPageId: string, preview: PrimaryContactPreview): Promise<void>;
  refreshContacts(): Promise<void>;
}

export function normalizeContactName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function partialOutcome(
  accountPageId: string,
  contact: ContactRecord,
  roles: ContactRole[] = [],
): ContactCreationOutcome {
  return {
    status: 'partial_relation',
    contact,
    accountPageId,
    retry: {
      accountPageId,
      contactPageId: contact.id,
      ...(roles.length > 0 ? { roles } : {}),
    },
  };
}

async function finishRelationship(
  accountPageId: string,
  contact: ContactRecord,
  adapter: ContactCreationAdapter,
  verifiedStatus: 'created_verified' | 'existing_verified',
  roles: ContactRole[] = [],
): Promise<ContactCreationOutcome> {
  try {
    await adapter.ensureAccountContact(accountPageId, contact.id);
    if (roles.length > 0) {
      if (!adapter.assignRoles) throw new Error('Contact role assignment is unavailable');
      await adapter.assignRoles(accountPageId, contact.id, roles);
    }
    const verified = await adapter.verifyBothSides(accountPageId, contact.id);
    if (!verified) {
      return partialOutcome(accountPageId, contact, roles);
    }

    await adapter.refreshContacts().catch(() => undefined);
    return {
      status: verifiedStatus,
      contact,
      accountPageId,
    };
  } catch {
    return partialOutcome(accountPageId, contact, roles);
  }
}

export async function createVerifiedContact(
  input: CreateContactInput,
  adapter: ContactCreationAdapter,
): Promise<ContactCreationOutcome> {
  await adapter.requireAccount(input.accountPageId);

  const existing = await adapter.findContact(
    input.accountPageId,
    normalizeContactName(input.name),
  );
  const wantsPrimary = input.roles?.includes('PRIMARY_CONTACT') && adapter.previewPrimaryContact;
  const roles = (input.roles ?? []).filter((role) => !wantsPrimary || role !== 'PRIMARY_CONTACT');
  let primaryPreview: PrimaryContactPreview | undefined;
  if (wantsPrimary) {
    primaryPreview = await adapter.previewPrimaryContact!(input.accountPageId, existing ?? input);

  }
  let collisions: ReturnType<typeof buildRoleCollisionPreview> = [];
  if (roles.length > 0) {
    if (!adapter.getRoleAssignments) throw new Error('Contact role preview is unavailable');
    const existingAssignments = await adapter.getRoleAssignments(input.accountPageId, roles);
    collisions = buildRoleCollisionPreview({
      selectedRoles: roles,
      candidateContactId: existing?.id,
      existingAssignments,
    });
  }
  if ((collisions.length > 0 && !input.overwriteRoles) || (primaryPreview && (!input.overwriteRoles || !input.expectedPrimary || !samePrimaryContact(input.expectedPrimary, primaryPreview.before) || !input.expectedPrimaryReplacement || !samePrimaryContact({ ...input.expectedPrimaryReplacement, revision: '' }, { ...primaryPreview.after, revision: '' })))) {
    return { status: 'role_collision', contact: existing, accountPageId: input.accountPageId, collisions, ...(primaryPreview ? { primaryPreview } : {}) };
  }
  async function assignPrimary(contact: ContactRecord) {
    if (!primaryPreview) return;
    if (!adapter.assignPrimaryContact) throw new Error('Primary contact update unavailable. Save as associated contact instead.');
    // Link first; the adapter rereads the live scalar fields immediately before writing.
    await adapter.ensureAccountContact(input.accountPageId, contact.id);
    try {
      await adapter.assignPrimaryContact(input.accountPageId, primaryPreview);
    } catch (error) {
      if (error instanceof PrimaryContactChangedError) {
        return { status: 'role_collision' as const, contact, accountPageId: input.accountPageId, collisions, primaryPreview: error.preview };
      }
      throw error;
    }
  }
  if (existing) {
    const collision = await assignPrimary(existing);
    if (collision) return collision;
    return finishRelationship(input.accountPageId, existing, adapter, 'existing_verified', roles);
  }

  const created = await adapter.createContact(input);
  const collision = await assignPrimary(created);
  if (collision) return collision;
  return finishRelationship(input.accountPageId, created, adapter, 'created_verified', roles);
}

export async function retryVerifiedContactLink(
  input: RetryContactLinkInput,
  adapter: ContactCreationAdapter,
): Promise<ContactCreationOutcome> {
  await adapter.requireAccount(input.accountPageId);
  const contact = await adapter.getContact(input.contactPageId);
  return finishRelationship(input.accountPageId, contact, adapter, 'existing_verified', input.roles ?? []);
}
