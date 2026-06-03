'use server';

import { ActivityType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireOrgContext } from '@/lib/auth/organization';
import { requireRole } from '@/lib/rbac/guards';
import { accountSchema } from '@/lib/validation/schemas';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

export async function createAccountAction(raw: unknown) {
  const { userId, orgId } = await requireOrgContext();
  await requireRole(orgId, userId, ['ADMIN', 'OPS_TEAM', 'SALES_REP']);

  const payload = accountSchema.parse(raw);
  const account = await prisma.account.create({
    data: {
      orgId,
      ...payload,
    },
  });

  await writeActivity({
    orgId,
    accountId: account.id,
    actorClerkUserId: userId,
    type: ActivityType.ACCOUNT_UPDATED,
    title: 'Account created',
    description: `${account.name} was created.`,
  });

  revalidatePath('/accounts');
  return account;
}
