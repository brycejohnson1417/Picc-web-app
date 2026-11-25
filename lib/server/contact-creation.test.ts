import { PrimaryContactChangedError } from '@/lib/contacts/primary-contact';
import { describe, expect, it, vi } from 'vitest';
import {
  createVerifiedContact,
  retryVerifiedContactLink,
  type ContactCreationAdapter,
  type ContactRecord,
  type CreateContactInput,
} from '@/lib/server/contact-creation';

function contact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'contact-page',
    name: 'Maya Chen',
    position: 'Buyer',
    email: 'maya@example.com',
    phone: '212-555-0187',
    ...overrides,
  };
}

function input(overrides: Partial<CreateContactInput> = {}): CreateContactInput {
  return {
    accountPageId: 'account-page',
    name: 'Maya Chen',
    position: 'Buyer',
    email: 'maya@example.com',
    phone: '212-555-0187',
    ...overrides,
  };
}

function fakeAdapter(options: {
  existing?: ContactRecord | null;
  verify?: boolean;
  ensureError?: Error;
} = {}) {
  const created = contact();
  const adapter = {
    requireAccount: vi.fn().mockResolvedValue(undefined),
    findContact: vi.fn().mockResolvedValue(options.existing ?? null),
    getContact: vi.fn().mockResolvedValue(created),
    createContact: vi.fn().mockResolvedValue(created),
    ensureAccountContact: options.ensureError
      ? vi.fn().mockRejectedValue(options.ensureError)
      : vi.fn().mockResolvedValue(undefined),
    verifyBothSides: vi.fn().mockResolvedValue(options.verify ?? true),
    getRoleAssignments: vi.fn().mockResolvedValue({}),
    assignRoles: vi.fn().mockResolvedValue(undefined),
    refreshContacts: vi.fn().mockResolvedValue(undefined),
  } satisfies ContactCreationAdapter;

  return adapter;
}

describe('verified contact creation', () => {
  it('returns an existing verified contact for the same normalized name and account', async () => {
    const existing = contact({ name: 'Maya  Chen' });
    const adapter = fakeAdapter({ existing });

    const result = await createVerifiedContact(input({ name: '  MAYA chen  ' }), adapter);

    expect(result).toEqual({
      status: 'existing_verified',
      contact: existing,
      accountPageId: 'account-page',
    });
    expect(adapter.findContact).toHaveBeenCalledWith('account-page', 'maya chen');
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.ensureAccountContact).toHaveBeenCalledWith('account-page', 'contact-page');
    expect(adapter.refreshContacts).toHaveBeenCalledTimes(1);
  });

  it('creates and verifies a contact when the account has no normalized-name match', async () => {
    const adapter = fakeAdapter({ existing: null });

    const result = await createVerifiedContact(input(), adapter);

    expect(result.status).toBe('created_verified');
    expect(adapter.requireAccount).toHaveBeenCalledWith('account-page');
    expect(adapter.createContact).toHaveBeenCalledWith(input());
    expect(adapter.ensureAccountContact).toHaveBeenCalledWith('account-page', 'contact-page');
    expect(adapter.verifyBothSides).toHaveBeenCalledWith('account-page', 'contact-page');
    expect(adapter.refreshContacts).toHaveBeenCalledTimes(1);
  });

  it('returns a collision preview before creating or replacing an occupied role', async () => {
    const adapter = fakeAdapter({ existing: null });
    adapter.getRoleAssignments.mockResolvedValue({
      PRIMARY_CONTACT: [{ id: 'existing-page', name: 'Existing Buyer' }],
    });

    const result = await createVerifiedContact(input({ roles: ['PRIMARY_CONTACT'] }), adapter);

    expect(result).toMatchObject({
      status: 'role_collision',
      collisions: [{ role: 'PRIMARY_CONTACT', label: 'Primary Contact' }],
    });
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.assignRoles).not.toHaveBeenCalled();
  });

  it('saves an associated contact without touching existing role assignments', async () => {
    const adapter = fakeAdapter();
    adapter.getRoleAssignments.mockResolvedValue({ PRIMARY_CONTACT: [{ id: 'old', name: 'Existing' }] });
    const result = await createVerifiedContact(input({ position: '', roles: [], overwriteRoles: false }), adapter);
    expect(result.status).toBe('created_verified');
    expect(adapter.ensureAccountContact).toHaveBeenCalledWith('account-page', 'contact-page');
    expect(adapter.assignRoles).not.toHaveBeenCalled();
    expect(adapter.getRoleAssignments).not.toHaveBeenCalled();
  });

  it('assigns multiple selected roles after explicit overwrite confirmation', async () => {
    const adapter = fakeAdapter({ existing: null });
    adapter.getRoleAssignments.mockResolvedValue({
      PRIMARY_CONTACT: [{ id: 'existing-page', name: 'Existing Buyer' }],
    });
    const roles = ['PRIMARY_CONTACT', 'BILLING_CONTACT'] as const;

    const result = await createVerifiedContact(input({ roles: [...roles], overwriteRoles: true }), adapter);

    expect(result.status).toBe('created_verified');
    expect(adapter.assignRoles).toHaveBeenCalledWith('account-page', 'contact-page', [...roles]);
  });

  it('allows the same normalized name at a different account', async () => {
    const adapter = fakeAdapter({ existing: null });

    const result = await createVerifiedContact(input({ accountPageId: 'second-account' }), adapter);

    expect(result.status).toBe('created_verified');
    expect(adapter.findContact).toHaveBeenCalledWith('second-account', 'maya chen');
    expect(adapter.createContact).toHaveBeenCalledTimes(1);
  });

  it('returns partial_relation when a created contact cannot be verified', async () => {
    const adapter = fakeAdapter({ existing: null, verify: false });

    const result = await createVerifiedContact(input(), adapter);

    expect(result).toEqual({
      status: 'partial_relation',
      contact: contact(),
      accountPageId: 'account-page',
      retry: {
        accountPageId: 'account-page',
        contactPageId: 'contact-page',
      },
    });
    expect(adapter.refreshContacts).not.toHaveBeenCalled();
  });

  it('returns partial_relation when relation append fails after contact creation', async () => {
    const adapter = fakeAdapter({ existing: null, ensureError: new Error('temporary integration failure') });

    const result = await createVerifiedContact(input(), adapter);

    expect(result.status).toBe('partial_relation');
    expect(adapter.createContact).toHaveBeenCalledTimes(1);
    expect(adapter.refreshContacts).not.toHaveBeenCalled();
  });

  it('preserves selected roles in retry context and assigns them again during repair', async () => {
    const adapter = fakeAdapter({ existing: null, verify: false });
    const roles = ['PRIMARY_CONTACT', 'BILLING_CONTACT'] as const;

    const initial = await createVerifiedContact(input({ roles: [...roles] }), adapter);

    expect(initial).toMatchObject({
      status: 'partial_relation',
      retry: { accountPageId: 'account-page', contactPageId: 'contact-page', roles: [...roles] },
    });

    adapter.verifyBothSides.mockResolvedValue(true);
    adapter.assignRoles.mockClear();
    const retried = await retryVerifiedContactLink(
      { accountPageId: 'account-page', contactPageId: 'contact-page', roles: [...roles] },
      adapter,
    );

    expect(retried.status).toBe('existing_verified');
    expect(adapter.assignRoles).toHaveBeenCalledWith('account-page', 'contact-page', [...roles]);
  });

  it('retries relationship repair without creating another contact', async () => {
    const adapter = fakeAdapter({ verify: true });

    const result = await retryVerifiedContactLink(
      { accountPageId: 'account-page', contactPageId: 'contact-page' },
      adapter,
    );

    expect(result.status).toBe('existing_verified');
    expect(adapter.requireAccount).toHaveBeenCalledWith('account-page');
    expect(adapter.getContact).toHaveBeenCalledWith('contact-page');
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.ensureAccountContact).toHaveBeenCalledTimes(1);
    expect(adapter.refreshContacts).toHaveBeenCalledTimes(1);
  });
});


describe('scalar primary contact confirmation', () => {
  const before = { name: 'Existing Buyer', email: 'old@example.com', phone: '123', position: 'Buyer', revision: 'rev1' };
  const after = { name: 'Maya Chen', email: 'maya@example.com', phone: '212-555-0187', position: 'Buyer' };
  function primaryAdapter() {
    return { ...fakeAdapter(), previewPrimaryContact: vi.fn().mockResolvedValue({ before, after }), assignPrimaryContact: vi.fn().mockResolvedValue(undefined) };
  }
  it('previews old and new fields without writing, including when overwrite has no expected snapshot', async () => {
    const adapter = primaryAdapter();
    const result = await createVerifiedContact(input({ roles: ['PRIMARY_CONTACT'], overwriteRoles: true }), adapter);
    expect(result).toMatchObject({ status: 'role_collision', primaryPreview: { before, after } });
    expect(adapter.createContact).not.toHaveBeenCalled();
    expect(adapter.assignPrimaryContact).not.toHaveBeenCalled();
  });
  it('requires renewed confirmation when old or replacement values change', async () => {
    const adapter = primaryAdapter();
    for (const expected of [{ ...before, phone: 'changed' }, before]) {
      const result = await createVerifiedContact(input({ roles: ['PRIMARY_CONTACT'], overwriteRoles: true, expectedPrimary: expected, expectedPrimaryReplacement: { ...after, name: 'Different' } }), adapter);
      expect(result.status).toBe('role_collision');
    }
    expect(adapter.createContact).not.toHaveBeenCalled();
  });
  it('writes scalar primary only after confirmation, never via relation assignment', async () => {
    const adapter = primaryAdapter();
    const result = await createVerifiedContact(input({ roles: ['PRIMARY_CONTACT'], overwriteRoles: true, expectedPrimary: before, expectedPrimaryReplacement: after }), adapter);
    expect(result.status).toBe('created_verified');
    expect(adapter.assignPrimaryContact).toHaveBeenCalledWith('account-page', { before, after });
    expect(adapter.assignRoles).not.toHaveBeenCalled();
  });
  it('returns a fresh confirmation preview if primary changes immediately before PATCH', async () => {
    const adapter = primaryAdapter();
    const updated = { before: { ...before, phone: 'changed', revision: 'rev2' }, after };
    adapter.assignPrimaryContact.mockRejectedValue(new PrimaryContactChangedError(updated));
    const result = await createVerifiedContact(input({ roles: ['PRIMARY_CONTACT'], overwriteRoles: true, expectedPrimary: before, expectedPrimaryReplacement: after }), adapter);
    expect(result).toMatchObject({ status: 'role_collision', primaryPreview: updated });
    expect(adapter.assignPrimaryContact).toHaveBeenCalledTimes(1);
  });
  it('associated-only never previews or changes primary fields', async () => {
    const adapter = primaryAdapter();
    await createVerifiedContact(input({ roles: [] }), adapter);
    expect(adapter.previewPrimaryContact).not.toHaveBeenCalled();
    expect(adapter.assignPrimaryContact).not.toHaveBeenCalled();
  });
});
