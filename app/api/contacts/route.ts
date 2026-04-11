import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { createApiHandler } from '@/lib/api/handler';
import { contactSchema } from '@/lib/validation/schemas';
import { getContacts, createContact } from '@/lib/data/contacts';
import { writeActivity } from '@/lib/activity-log/write';

export const GET = createApiHandler(async (_req, ctx) => {
  const contacts = await getContacts(ctx.orgId);
  return NextResponse.json(contacts);
});

export const POST = createApiHandler(
  async (_req, ctx, data) => {
    const contact = await createContact(ctx.orgId, data);

    await writeActivity({
      orgId: ctx.orgId,
      accountId: data.accountId,
      contactId: contact.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.CONTACT_UPDATED,
      title: 'Contact added',
      description: `${contact.firstName} ${contact.lastName}`,
    });

    return NextResponse.json(contact, { status: 201 });
  },
  {
    allowedRoles: ['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR'],
    schema: contactSchema,
  },
);
