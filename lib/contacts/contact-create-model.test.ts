import { describe, expect, it } from 'vitest';
import {
  buildContactCreatePayload,
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

  it('lists what is still missing before a contact can be saved', () => {
    expect(
      contactCreateMissingFields({ accountPageId: ' ', name: '', position: '', email: '', phone: '', roles: [] }),
    ).toEqual(['an account', "the contact's name", 'their role / position']);
    expect(
      contactCreateMissingFields({ accountPageId: 'a', name: 'Maya Chen', position: ' ', email: '', phone: '', roles: [] }),
    ).toEqual(['their role / position']);
    expect(
      contactCreateMissingFields({ accountPageId: 'a', name: 'Maya Chen', position: 'Buyer', email: '', phone: '', roles: [] }),
    ).toEqual([]);
  });

  it('uses honest confirmation copy for verified, duplicate, and partial outcomes', () => {
    expect(contactCreateMessage('created_verified')).toContain('created and linked');
    expect(contactCreateMessage('existing_verified')).toContain('already existed');
    expect(contactCreateMessage('partial_relation')).toContain('could not verify');
  });
});
