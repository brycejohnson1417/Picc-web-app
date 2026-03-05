import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { TasksClient } from '@/components/tasks/tasks-client';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { orgId } = await requireWorkspaceContext();
  const params = await searchParams;

  const [tasks, accounts] = await Promise.all([
    prisma.task.findMany({
      where: { orgId },
      include: { account: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    }),
    prisma.account.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 400,
    }),
  ]);

  return (
    <TasksClient
      initialTasks={tasks.map((task) => ({
        ...task,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        updatedAt: task.updatedAt.toISOString(),
      }))}
      initialAccounts={accounts}
      autoOpenCreate={params.new === '1'}
    />
  );
}
