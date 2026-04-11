import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { createApiHandler } from '@/lib/api/handler';
import { taskSchema } from '@/lib/validation/schemas';
import { getTasks, createTask } from '@/lib/data/tasks';
import { writeActivity } from '@/lib/activity-log/write';

export const GET = createApiHandler(async (_req, ctx) => {
  const rows = await getTasks(ctx.orgId);
  return NextResponse.json(rows);
});

export const POST = createApiHandler(
  async (_req, ctx, data) => {
    const task = await createTask(ctx.orgId, ctx.userId, data);

    await writeActivity({
      orgId: ctx.orgId,
      accountId: data.accountId,
      taskId: task.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.TASK_CREATED,
      title: 'Task created',
      description: data.title,
    });

    return NextResponse.json(task, { status: 201 });
  },
  {
    allowedRoles: ['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR'],
    schema: taskSchema,
  },
);
