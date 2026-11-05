import type { ContactActionKind } from '@/lib/contacts/contact-actions';

type FollowUpAccount = {
  id: string;
  name: string;
};

type FollowUpContact = {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
};

export function buildCommunicationFollowUpPayload(input: {
  action: ContactActionKind;
  account: FollowUpAccount;
  contact: FollowUpContact;
  followUpDate: string;
  reason: string;
}) {
  const reason = input.reason.trim() || `Follow up after ${input.action} with ${input.contact.name}`;

  return {
    followUpDate: input.followUpDate,
    followUpNeeded: true,
    followUpReason: reason,
  };
}

export function buildAccountFollowUpPayload(input: {
  account: FollowUpAccount & { notionPageId: string };
  followUpDate: string;
  reason: string;
}) {
  const reason = input.reason.trim();

  return {
    store: {
      id: input.account.id,
      notionPageId: input.account.notionPageId,
      name: input.account.name,
    },
    noteText: `New follow-up scheduled: ${reason}`,
    followUpDate: input.followUpDate,
    followUpNeeded: true,
    followUpReason: reason,
  };
}
