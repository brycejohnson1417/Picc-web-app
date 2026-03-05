'use client';

import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  accountId: string;
  contactId: string | null;
  account: { id: string; name: string };
  contact: { id: string; firstName: string; lastName: string } | null;
  updatedAt: string;
};

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

type AccountOption = { id: string; name: string };

type TaskForm = {
  title: string;
  description: string;
  accountId: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
};

const EMPTY_FORM: TaskForm = {
  title: '',
  description: '',
  accountId: '',
  dueDate: '',
  priority: 'MEDIUM',
  status: 'OPEN',
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function TasksClient({
  initialTasks,
  initialAccounts,
  autoOpenCreate = false,
}: {
  initialTasks: TaskItem[];
  initialAccounts: AccountOption[];
  autoOpenCreate?: boolean;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [accounts] = useState<AccountOption[]>(initialAccounts);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');
  const [sortBy, setSortBy] = useState<'dueDate' | 'updatedAt' | 'priority'>('dueDate');
  const [showCreate, setShowCreate] = useState(autoOpenCreate);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [creating, setCreating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<TaskForm>(() => ({
    ...EMPTY_FORM,
    accountId: initialAccounts[0]?.id ?? '',
  }));

  const [editForms, setEditForms] = useState<Record<string, TaskForm>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredRows = tasks.filter((task) => {
      if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) return false;
      if (!q) return true;

      return [
        task.title,
        task.description ?? '',
        task.account.name,
        task.contact ? `${task.contact.firstName} ${task.contact.lastName}` : '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    return filteredRows.sort((a, b) => {
      if (sortBy === 'priority') {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      if (sortBy === 'updatedAt') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }

      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
  }, [priorityFilter, search, sortBy, statusFilter, tasks]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  const refreshTasks = useCallback(async () => {
    const response = await fetch('/api/tasks', { cache: 'no-store' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? 'Failed to refresh tasks');
    }
    const payload = (await response.json()) as TaskItem[];
    setTasks(payload);
  }, []);

  async function handleCreate() {
    if (!createForm.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    if (!createForm.accountId) {
      toast.error('Select an account');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: createForm.accountId,
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          dueDate: createForm.dueDate || undefined,
          priority: createForm.priority,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create task');
      }

      await refreshTasks();
      setCreateForm({ ...EMPTY_FORM, accountId: createForm.accountId });
      setShowCreate(false);
      toast.success('Task created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(task: TaskItem) {
    setEditingTaskId(task.id);
    setEditForms((current) => ({
      ...current,
      [task.id]: {
        title: task.title,
        description: task.description ?? '',
        accountId: task.accountId,
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
        priority: task.priority,
        status: task.status,
      },
    }));
  }

  async function saveEdit(taskId: string) {
    const form = editForms[taskId];
    if (!form || !form.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    setSavingTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          dueDate: form.dueDate || null,
          priority: form.priority,
          status: form.status,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update task');
      }

      await refreshTasks();
      setEditingTaskId(null);
      toast.success('Task updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update task');
    } finally {
      setSavingTaskId(null);
    }
  }

  async function setStatus(taskId: string, status: TaskStatus) {
    setSavingTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update status');
      }
      await refreshTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setSavingTaskId(null);
    }
  }

  async function deleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to delete task');
      }
      setTasks((current) => current.filter((task) => task.id !== taskId));
      toast.success('Task deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete task');
    } finally {
      setDeletingTaskId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-sm text-slate-500">Create, edit, filter, and complete account-linked tasks.</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)}>
          <Plus className="mr-1 h-4 w-4" />
          {showCreate ? 'Close' : 'New Task'}
        </Button>
      </header>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-500">
                Account
                <select
                  value={createForm.accountId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, accountId: event.target.value }))}
                  className="h-11 w-full rounded-md border bg-white px-3 text-sm text-slate-900"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-500">
                Due Date
                <Input
                  type="date"
                  value={createForm.dueDate}
                  onChange={(event) => setCreateForm((current) => ({ ...current, dueDate: event.target.value }))}
                />
              </label>

              <label className="space-y-1 text-xs text-slate-500">
                Priority
                <select
                  value={createForm.priority}
                  onChange={(event) => setCreateForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}
                  className="h-11 w-full rounded-md border bg-white px-3 text-sm text-slate-900"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
                Title
                <Input
                  value={createForm.title}
                  onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Call buyer about reorder"
                />
              </label>

              <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
                Description
                <Textarea
                  value={createForm.description}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Add any prep notes for the assignee"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>Task Queue</span>
            <div className="flex flex-wrap gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks"
                className="h-10 w-[220px]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'ALL' | TaskStatus)}
                className="h-10 rounded-md border bg-white px-2 text-sm"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as 'ALL' | TaskPriority)}
                className="h-10 rounded-md border bg-white px-2 text-sm"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as 'dueDate' | 'updatedAt' | 'priority')}
                className="h-10 rounded-md border bg-white px-2 text-sm"
              >
                <option value="dueDate">Sort: Due Date</option>
                <option value="updatedAt">Sort: Updated</option>
                <option value="priority">Sort: Priority</option>
              </select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No tasks match your filters.</p>
          ) : (
            paged.map((task) => {
              const editing = editingTaskId === task.id;
              const editForm = editForms[task.id];
              return (
                <div key={task.id} className="rounded-lg border p-3">
                  {editing && editForm ? (
                    <div className="space-y-2">
                      <Input
                        value={editForm.title}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [task.id]: { ...editForm, title: event.target.value },
                          }))
                        }
                      />
                      <Textarea
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [task.id]: { ...editForm, description: event.target.value },
                          }))
                        }
                      />
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input
                          type="date"
                          value={editForm.dueDate}
                          onChange={(event) =>
                            setEditForms((current) => ({
                              ...current,
                              [task.id]: { ...editForm, dueDate: event.target.value },
                            }))
                          }
                        />
                        <select
                          value={editForm.priority}
                          onChange={(event) =>
                            setEditForms((current) => ({
                              ...current,
                              [task.id]: { ...editForm, priority: event.target.value as TaskPriority },
                            }))
                          }
                          className="h-10 rounded-md border bg-white px-2 text-sm"
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="URGENT">Urgent</option>
                        </select>
                        <select
                          value={editForm.status}
                          onChange={(event) =>
                            setEditForms((current) => ({
                              ...current,
                              [task.id]: { ...editForm, status: event.target.value as TaskStatus },
                            }))
                          }
                          className="h-10 rounded-md border bg-white px-2 text-sm"
                        >
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="DONE">Done</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingTaskId(null)} disabled={savingTaskId === task.id}>
                          Cancel
                        </Button>
                        <Button onClick={() => saveEdit(task.id)} disabled={savingTaskId === task.id}>
                          {savingTaskId === task.id ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{task.title}</p>
                          <p className="text-xs text-slate-500">
                            {task.account.name}
                            {task.contact ? ` · ${task.contact.firstName} ${task.contact.lastName}` : ''}
                            {' · '}Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'unscheduled'}
                          </p>
                          {task.description ? <p className="mt-1 text-sm text-slate-600">{task.description}</p> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={task.priority === 'URGENT' ? 'danger' : task.priority === 'HIGH' ? 'warning' : 'secondary'}>{task.priority}</Badge>
                          <Badge variant={task.status === 'DONE' ? 'success' : 'secondary'}>{task.status}</Badge>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setStatus(task.id, task.status === 'OPEN' ? 'IN_PROGRESS' : 'OPEN')}
                          disabled={savingTaskId === task.id}
                        >
                          {task.status === 'OPEN' ? 'Start' : 'Reopen'}
                        </Button>
                        <Button size="sm" onClick={() => setStatus(task.id, 'DONE')} disabled={savingTaskId === task.id || task.status === 'DONE'}>
                          Mark Done
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(task)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deleteTask(task.id)} disabled={deletingTaskId === task.id}>
                          {deletingTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
          {filtered.length > 0 ? (
            <div className="flex items-center justify-between border-t pt-3 text-sm text-slate-500">
              <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
