'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, Input, Textarea } from '@/components/ui';

type Props = {
  title: string;
  subtitle: string;
  status: 'ACTIVE' | 'INACTIVE';
  accountId?: string;
  onQuickLogHref?: string;
};

export function AccountHero({ title, subtitle, status, accountId, onQuickLogHref = '#' }: Props) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingAppt, setSavingAppt] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');

  const [apptTitle, setApptTitle] = useState('');
  const [apptDescription, setApptDescription] = useState('');
  const [apptStartsAt, setApptStartsAt] = useState('');
  const [apptEndsAt, setApptEndsAt] = useState('');

  const hasAccountId = Boolean(accountId);

  async function createTask() {
    if (!accountId) {
      toast.error('This account does not have a CRM ID yet');
      return;
    }
    if (!taskTitle.trim()) {
      toast.error('Task title is required');
      return;
    }

    setSavingTask(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          title: taskTitle.trim(),
          description: taskDescription.trim() || undefined,
          dueDate: taskDueDate || undefined,
          priority: taskPriority,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create task');
      }

      setTaskOpen(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setTaskPriority('MEDIUM');
      toast.success('Task created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create task');
    } finally {
      setSavingTask(false);
    }
  }

  async function createAppointment() {
    if (!accountId) {
      toast.error('This account does not have a CRM ID yet');
      return;
    }
    if (!apptTitle.trim()) {
      toast.error('Appointment title is required');
      return;
    }
    if (!apptStartsAt || !apptEndsAt) {
      toast.error('Start and end are required');
      return;
    }

    setSavingAppt(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          title: apptTitle.trim(),
          startsAt: new Date(apptStartsAt).toISOString(),
          endsAt: new Date(apptEndsAt).toISOString(),
          description: apptDescription.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create appointment');
      }

      setApptOpen(false);
      setApptTitle('');
      setApptDescription('');
      setApptStartsAt('');
      setApptEndsAt('');
      toast.success('Appointment scheduled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to schedule appointment');
    } finally {
      setSavingAppt(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>{status}</Badge>
          </div>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={onQuickLogHref}>Quick Log</a>
          </Button>
          <Button variant="secondary" onClick={() => setTaskOpen((value) => !value)} disabled={!hasAccountId}>
            New Task
          </Button>
          <Button variant="outline" onClick={() => setApptOpen((value) => !value)} disabled={!hasAccountId}>
            Schedule Appointment
          </Button>
          <Button variant="outline" onClick={() => setMoreOpen((value) => !value)}>
            <MoreHorizontal className="mr-1 h-4 w-4" />
            More
          </Button>
        </div>
      </CardContent>

      {taskOpen ? (
        <div className="border-t px-6 pb-6 pt-4">
          <p className="text-sm font-semibold">Create Task</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" />
            <Input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
            <select
              value={taskPriority}
              onChange={(event) => setTaskPriority(event.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT')}
              className="h-11 rounded-md border bg-white px-3 text-sm"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
            <div className="hidden md:block" />
            <div className="md:col-span-2">
              <Textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Task description" />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTaskOpen(false)} disabled={savingTask}>Cancel</Button>
            <Button onClick={createTask} disabled={savingTask}>{savingTask ? 'Saving...' : 'Create Task'}</Button>
          </div>
        </div>
      ) : null}

      {apptOpen ? (
        <div className="border-t px-6 pb-6 pt-4">
          <p className="text-sm font-semibold">Schedule Appointment</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Input value={apptTitle} onChange={(event) => setApptTitle(event.target.value)} placeholder="Appointment title" />
            <div className="hidden md:block" />
            <Input type="datetime-local" value={apptStartsAt} onChange={(event) => setApptStartsAt(event.target.value)} />
            <Input type="datetime-local" value={apptEndsAt} onChange={(event) => setApptEndsAt(event.target.value)} />
            <div className="md:col-span-2">
              <Textarea value={apptDescription} onChange={(event) => setApptDescription(event.target.value)} placeholder="Agenda or context" />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApptOpen(false)} disabled={savingAppt}>Cancel</Button>
            <Button onClick={createAppointment} disabled={savingAppt}>{savingAppt ? 'Saving...' : 'Create Appointment'}</Button>
          </div>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="border-t px-6 pb-6 pt-4">
          <p className="text-sm font-semibold">More Actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {accountId ? (
              <Button asChild variant="outline">
                <a href={`/conversations?accountId=${encodeURIComponent(accountId)}`}>Open Conversations</a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <a href="/tasks?new=1">Create Task in Queue</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/calendar?new=1">Create Appointment in Calendar</a>
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
