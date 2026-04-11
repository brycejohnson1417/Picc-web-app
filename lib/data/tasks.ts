import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { taskSchema } from '@/lib/validation/schemas';

export async function getTasks(orgId: string) {
  return prisma.task.findMany({
    where: { orgId },
    include: { account: true, contact: true, opportunity: true },
    orderBy: { dueDate: 'asc' },
  });
}

export async function createTask(orgId: string, assignedToUserId: string, data: z.infer<typeof taskSchema>) {
  return prisma.task.create({
    data: {
      orgId,
      assignedToUserId,
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
    },
  });
}
