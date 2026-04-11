import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { createApiHandler } from '@/lib/api/handler';
import { accountSchema } from '@/lib/validation/schemas';
import { getAccounts, createAccount } from '@/lib/data/accounts';
import { writeActivity } from '@/lib/activity-log/write';

export const GET = createApiHandler(async (_req, ctx) => {
  const rows = await getAccounts(ctx.orgId);
  return NextResponse.json(rows);
});

export const POST = createApiHandler(
  async (_req, ctx, data) => {
    const account = await createAccount(ctx.orgId, data);

    await writeActivity({
      orgId: ctx.orgId,
      accountId: account.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.ACCOUNT_UPDATED,
      title: 'Account created via API',
      description: account.name,
    });

    return NextResponse.json(account, { status: 201 });
  },
  {
    allowedRoles: ['ADMIN', 'OPS_TEAM', 'SALES_REP'],
    schema: accountSchema,
  },
);
