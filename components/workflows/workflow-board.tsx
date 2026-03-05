'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';

export type WorkflowBoardRow = {
  id: string;
  status: WorkflowStatus;
  primary: string;
  secondary?: string | null;
  description?: string | null;
  detail?: string | null;
  createdAt: string;
};

type WorkflowStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export type WorkflowCreateField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'account' | 'json';
  required?: boolean;
  placeholder?: string;
};

export type WorkflowAccountOption = {
  id: string;
  name: string;
};

function defaultStatusOptions(current: WorkflowStatus): WorkflowStatus[] {
  const all: WorkflowStatus[] = ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'];
  return all.filter((status) => status !== current);
}

function parseCreateFieldValue(field: WorkflowCreateField, rawValue: string) {
  if (field.type === 'number') {
    return rawValue.trim() ? Number(rawValue) : undefined;
  }
  if (field.type === 'json') {
    return rawValue.trim() ? JSON.parse(rawValue) : {};
  }
  if (field.type === 'text' || field.type === 'textarea') {
    return rawValue.trim() || undefined;
  }
  if (field.type === 'account' || field.type === 'date') {
    return rawValue.trim() || undefined;
  }
  return rawValue;
}

export function WorkflowBoard({
  title,
  description,
  rows: initialRows,
  createEndpoint,
  patchEndpointBase,
  createFields,
  accounts,
  defaultCreateValues,
  extraCreatePayload,
}: {
  title: string;
  description: string;
  rows: WorkflowBoardRow[];
  createEndpoint: string;
  patchEndpointBase: string;
  createFields: WorkflowCreateField[];
  accounts: WorkflowAccountOption[];
  defaultCreateValues?: Record<string, string>;
  extraCreatePayload?: Record<string, unknown>;
}) {
  const [rows, setRows] = useState<WorkflowBoardRow[]>(initialRows);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | WorkflowStatus>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createValues, setCreateValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = { ...(defaultCreateValues ?? {}) };
    for (const field of createFields) {
      if (!(field.key in values)) {
        if (field.type === 'account') {
          values[field.key] = accounts[0]?.id ?? '';
        } else {
          values[field.key] = '';
        }
      }
    }
    return values;
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
        if (!q) return true;
        return [row.primary, row.secondary ?? '', row.description ?? '', row.detail ?? ''].join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rows, search, statusFilter]);

  async function createRecord() {
    for (const field of createFields) {
      if (field.required && !createValues[field.key]?.trim()) {
        toast.error(`${field.label} is required`);
        return;
      }
    }

    setCreating(true);
    try {
      const payload: Record<string, unknown> = { ...(extraCreatePayload ?? {}) };
      for (const field of createFields) {
        const rawValue = createValues[field.key] ?? '';
        const parsed = parseCreateFieldValue(field, rawValue);
        if (parsed !== undefined) {
          payload[field.key] = parsed;
        }
      }

      const response = await fetch(createEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error ?? `Failed to create ${title}`);
      }

      const nextRow: WorkflowBoardRow = {
        id: result.id,
        status: result.status ?? 'SUBMITTED',
        primary: result.account?.name ?? result.source ?? result.requestReason ?? 'New record',
        secondary: result.referredBy ?? result.orderNumber ?? result.repName ?? result.requestedBy ?? result.suggestedBy ?? null,
        description: result.notes ?? result.reason ?? result.requestReason ?? null,
        detail:
          result.eventDate
            ? new Date(result.eventDate).toLocaleString()
            : result.createdAt
              ? new Date(result.createdAt).toLocaleString()
              : null,
        createdAt: result.createdAt ?? new Date().toISOString(),
      };

      setRows((current) => [nextRow, ...current]);
      setShowCreate(false);
      setCreateValues(() => {
        const reset = { ...(defaultCreateValues ?? {}) };
        for (const field of createFields) {
          if (!(field.key in reset)) {
            reset[field.key] = field.type === 'account' ? accounts[0]?.id ?? '' : '';
          }
        }
        return reset;
      });
      toast.success('Record created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create record');
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(recordId: string, status: WorkflowStatus) {
    setUpdatingId(recordId);
    const original = rows;
    setRows((current) => current.map((row) => (row.id === recordId ? { ...row, status } : row)));

    try {
      const response = await fetch(`${patchEndpointBase}/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error ?? 'Failed to update status');
      }
      toast.success(`Status updated to ${status}`);
    } catch (error) {
      setRows(original);
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)}>
          <Plus className="mr-1 h-4 w-4" />
          {showCreate ? 'Close' : 'New Record'}
        </Button>
      </header>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Record</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {createFields.map((field) => {
              const value = createValues[field.key] ?? '';
              if (field.type === 'textarea') {
                return (
                  <label key={field.key} className="space-y-1 text-xs text-slate-500 md:col-span-2">
                    {field.label}
                    <Textarea
                      value={value}
                      onChange={(event) => setCreateValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                    />
                  </label>
                );
              }

              if (field.type === 'account') {
                return (
                  <label key={field.key} className="space-y-1 text-xs text-slate-500">
                    {field.label}
                    <select
                      value={value}
                      onChange={(event) => setCreateValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      className="h-11 w-full rounded-md border bg-white px-3 text-sm"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </label>
                );
              }

              return (
                <label key={field.key} className="space-y-1 text-xs text-slate-500">
                  {field.label}
                  <Input
                    type={field.type === 'date' ? 'datetime-local' : field.type === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={(event) => setCreateValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    placeholder={field.placeholder}
                  />
                </label>
              );
            })}
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
              <Button onClick={createRecord} disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Queue</span>
            <div className="flex flex-wrap gap-2">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" className="w-[220px]" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'ALL' | WorkflowStatus)}
                className="h-10 rounded-md border bg-white px-2 text-sm"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? <p className="text-sm text-slate-500">No records found.</p> : null}
          {filtered.map((row) => (
            <div key={row.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.primary}</p>
                  {row.secondary ? <p className="text-xs text-slate-500">{row.secondary}</p> : null}
                  {row.description ? <p className="mt-1 text-sm text-slate-700">{row.description}</p> : null}
                  {row.detail ? <p className="mt-1 text-xs text-slate-500">{row.detail}</p> : null}
                </div>
                <Badge variant={row.status === 'COMPLETED' ? 'success' : row.status === 'REJECTED' ? 'danger' : row.status === 'APPROVED' ? 'success' : 'secondary'}>
                  {row.status}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {defaultStatusOptions(row.status).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus(row.id, status)}
                    disabled={updatingId === row.id}
                  >
                    {updatingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Move to {status}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
