import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const schema = z.object({
  pipelineId: z.string().cuid(),
  stageId: z.string().cuid(),
  accountId: z.string().cuid(),
  contactId: z.string().cuid().optional().nullable(),
  name: z.string().min(2),
  value: z.number().nonnegative(),
  probability: z.number().min(0).max(100).default(10),
  expectedCloseDate: z.string().optional(),
});

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  const rows = await prisma.opportunity.findMany({ where: { orgId: ctx.orgId }, include: { account: true, contact: true, stage: true } });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  const body = await req.json();
  const payload = schema.parse(body);

  const opportunity = await prisma.opportunity.create({
    data: {
      orgId: ctx.orgId,
      pipelineId: payload.pipelineId,
      stageId: payload.stageId,
      accountId: payload.accountId,
      contactId: payload.contactId,
      ownerClerkUserId: ctx.userId,
      name: payload.name,
      value: payload.value,
      probability: payload.probability,
      expectedCloseDate: payload.expectedCloseDate ? new Date(payload.expectedCloseDate) : null,
    },
  });

  await writeActivity({
    orgId: ctx.orgId,
    accountId: payload.accountId,
    opportunityId: opportunity.id,
    actorClerkUserId: ctx.userId,
    type: ActivityType.OPPORTUNITY_CREATED,
    title: 'Opportunity created',
    description: payload.name,
  });

  return NextResponse.json(opportunity, { status: 201 });
}
