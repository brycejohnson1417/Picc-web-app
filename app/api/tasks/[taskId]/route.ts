import { NextResponse } from 'next/server';
import { ActivityType, TaskPriority, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    title: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    contactId: z.string().cuid().nullable().optional(),
    opportunityId: z.string().cuid().nullable().optional(),
    assignedToUserId: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const { taskId } = await context.params;

  const existing = await prisma.task.findFirst({
    where: { id: taskId, orgId: ctx.orgId },
    include: { account: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  try {
    const payload = patchSchema.parse(await request.json());

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: payload.title,
        description: payload.description,
        dueDate: payload.dueDate !== undefined ? (payload.dueDate ? new Date(payload.dueDate) : null) : undefined,
        status: payload.status,
        priority: payload.priority,
        contactId: payload.contactId,
        opportunityId: payload.opportunityId,
        assignedToUserId: payload.assignedToUserId,
      },
    });

    const transitionedToDone = payload.status === 'DONE' && existing.status !== 'DONE';
    await writeActivity({
      orgId: ctx.orgId,
      accountId: existing.accountId,
      contactId: updated.contactId ?? undefined,
      taskId: updated.id,
      actorClerkUserId: ctx.userId,
      type: transitionedToDone ? ActivityType.TASK_COMPLETED : ActivityType.ACCOUNT_UPDATED,
      title: transitionedToDone ? 'Task completed' : 'Task updated',
      description: updated.title,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid task payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  const { taskId } = await context.params;

  const task = await prisma.task.findFirst({ where: { id: taskId, orgId: ctx.orgId } });
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: taskId } });

  await writeActivity({
    orgId: ctx.orgId,
    accountId: task.accountId,
    contactId: task.contactId ?? undefined,
    actorClerkUserId: ctx.userId,
    type: ActivityType.ACCOUNT_UPDATED,
    title: 'Task deleted',
    description: task.title,
  });

  return NextResponse.json({ ok: true });
}
