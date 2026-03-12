import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';

export default async function TasksPage() {
  const { orgId } = await requireWorkspaceContext();

  const tasks = await prisma.task.findMany({
    where: { orgId },
    include: { account: true, contact: true },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 300,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Tasks</h1>
        <p className="text-sm text-slate-500">Unified list for sales, ops, finance, and ambassador task queues.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-semibold">{task.title}</p>
                <p className="text-xs text-slate-500">{task.account.name} · {task.contact ? `${task.contact.firstName} ${task.contact.lastName}` : 'No contact'} · Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'unscheduled'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={task.priority === 'URGENT' ? 'danger' : task.priority === 'HIGH' ? 'warning' : 'secondary'}>{task.priority}</Badge>
                <Badge variant={task.status === 'DONE' ? 'success' : 'secondary'}>{task.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
