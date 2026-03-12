import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const schema = z.object({
  accountId: z.string().cuid(),
  contactId: z.string().cuid().optional().nullable(),
  opportunityId: z.string().cuid().optional().nullable(),
  title: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  try {
    const rows = await prisma.task.findMany({ where: { orgId: ctx.orgId }, include: { account: true, contact: true, opportunity: true } });
    return NextResponse.json(rows);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load tasks' });
  }
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(req, schema);
    const task = await prisma.task.create({
      data: {
        orgId: ctx.orgId,
        accountId: payload.accountId,
        contactId: payload.contactId,
        opportunityId: payload.opportunityId,
        assignedToUserId: ctx.userId,
        title: payload.title,
        description: payload.description,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : new Date(),
        priority: payload.priority,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: payload.accountId,
      taskId: task.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.TASK_CREATED,
      title: 'Task created',
      description: payload.title,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create task',
      zodMessage: 'Invalid task payload',
    });
  }
}
