import { expect, it } from 'vitest';
import { primaryContactPatch, readPrimaryContact, samePrimaryContact } from './primary-contact';
const page = { last_edited_time: 'rev1', properties: { Contact: { type: 'rich_text', rich_text: [{ plain_text: 'Old Buyer' }] }, 'Contact Email': { type: 'email', email: 'old@example.com' }, 'Contact Phone': { type: 'phone_number', phone_number: '123' } } };
it('reads exact scalar values and does not invent an absent position property', () => {
  const snapshot = readPrimaryContact(page);
  expect(snapshot).toEqual({ name: 'Old Buyer', email: 'old@example.com', phone: '123', position: null, revision: 'rev1' });
  expect(primaryContactPatch(snapshot)).not.toHaveProperty('Contact Position');
  expect(primaryContactPatch({ ...snapshot, name: 'New', email: null })).toMatchObject({ Contact: { rich_text: [{ text: { content: 'New' } }] }, 'Contact Email': { email: null } });
});
it('rejects stale revisions and changed old fields', () => {
  const snapshot = readPrimaryContact(page);
  expect(samePrimaryContact(snapshot, { ...snapshot })).toBe(true);
  expect(samePrimaryContact(snapshot, { ...snapshot, phone: '456' })).toBe(false);
  expect(samePrimaryContact(snapshot, { ...snapshot, revision: 'rev2' })).toBe(false);
});
it('fails closed on incompatible fields', () => {
  expect(() => readPrimaryContact({ ...page, properties: {} })).toThrow('Save as associated');
});
