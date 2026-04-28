import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';
import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';

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
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center sm:p-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <ClipboardCheck className="h-6 w-6 text-slate-600" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">You&apos;re all caught up!</h2>
              <p className="mt-2 text-sm text-slate-500 max-w-sm">
                There are currently no tasks in the queue for this workspace.
                Any new assignments for sales, ops, finance, or ambassadors will appear here.
              </p>
              <div className="mt-6">
                <Button asChild variant="default">
                  <Link href="/tasks?new=1">
                    Create new task
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            tasks.map((task) => (
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
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
