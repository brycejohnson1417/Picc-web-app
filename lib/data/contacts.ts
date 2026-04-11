import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { contactSchema } from '@/lib/validation/schemas';

export async function getContacts(orgId: string) {
  return prisma.contact.findMany({
    where: { orgId },
    include: { account: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createContact(orgId: string, data: z.infer<typeof contactSchema>) {
  return prisma.contact.create({
    data: {
      orgId,
      ...data,
    },
  });
}
