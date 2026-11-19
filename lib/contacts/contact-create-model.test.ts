import { notionContactCreateSchema } from '@/lib/validation/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildContactCreatePayload,
  canSubmitContactCreate,
  contactCreateMessage,
  contactCreateMissingFields,
  filterContactAccounts,
} from '@/lib/contacts/contact-create-model';

const accounts = [
  { notionPageId: 'a', name: 'Gotham Buds', city: 'New York', state: 'NY' },
  { notionPageId: 'b', name: 'Alta Dispensary', city: 'Astoria', state: 'NY' },
];

describe('contact create UI model', () => {
  it('finds accounts by name and location without changing source order', () => {
    expect(filterContactAccounts(accounts, 'astoria').map((account) => account.notionPageId)).toEqual(['b']);
    expect(filterContactAccounts(accounts, '')).toEqual(accounts);
  });

  it('trims required fields and converts blank optional fields to null', () => {
    expect(
      buildContactCreatePayload({
        accountPageId: ' account-id ',
        name: ' Maya Chen ',
        position: ' Buyer ',
        email: ' ',
        phone: ' 212-555-0187 ',
        roles: ['PRIMARY_CONTACT', 'BILLING_CONTACT'],
      }),
    ).toEqual({
      accountPageId: 'account-id',
      name: 'Maya Chen',
      position: 'Buyer',
      email: null,
      phone: '212-555-0187',
      roles: ['PRIMARY_CONTACT', 'BILLING_CONTACT'],
      overwriteRoles: false,
    });
  });

  it('uses honest confirmation copy for verified, duplicate, and partial outcomes', () => {
    expect(contactCreateMessage('created_verified')).toContain('created and linked');
    expect(contactCreateMessage('existing_verified')).toContain('already existed');
    expect(contactCreateMessage('partial_relation')).toContain('could not verify');
  });
});

const associatedDraft = { accountPageId: 'account-id', name: 'New Contact', position: '', email: '', phone: '', roles: ['PRIMARY_CONTACT' as const] };
it('allows a name-only contact at a selected account, without inventing a position', () => {
  expect(canSubmitContactCreate(associatedDraft)).toBe(true);
  expect(canSubmitContactCreate({ ...associatedDraft, name: ' ' })).toBe(false);
  expect(canSubmitContactCreate({ ...associatedDraft, accountPageId: '' })).toBe(false);
});
it('explains missing required fields without demanding a title', () => {
  expect(contactCreateMissingFields(associatedDraft)).toEqual([]);
  expect(contactCreateMissingFields({ ...associatedDraft, accountPageId: ' ', name: ' ' })).toEqual(['an account', "the contact's name"]);
});
it('saves associated-only without role replacement and retains the draft for an explicit replacement', () => {
  expect(buildContactCreatePayload(associatedDraft, 'associated')).toMatchObject({ roles: [], overwriteRoles: false });
  expect(buildContactCreatePayload(associatedDraft, 'replace')).toMatchObject({ roles: ['PRIMARY_CONTACT'], overwriteRoles: true });
  expect(associatedDraft.roles).toEqual(['PRIMARY_CONTACT']);
});

it('accepts a blank optional position at the API boundary while requiring a name', () => {
  const payload = buildContactCreatePayload({ ...associatedDraft, accountPageId: '11111111-1111-4111-8111-111111111111' });
  expect(notionContactCreateSchema.safeParse(payload).success).toBe(true);
  expect(notionContactCreateSchema.safeParse({ ...payload, name: '' }).success).toBe(false);
});
