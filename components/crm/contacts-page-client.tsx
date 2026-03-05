'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ContactsTable, type ContactTableRow } from '@/components/crm/contacts-table';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';

type ContactForm = {
  accountId: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  email: string;
  phone: string;
};

type AccountOption = {
  id: string;
  name: string;
};

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportRowsToCsv(rows: ContactTableRow[]) {
  const headers = ['ID', 'Name', 'Role', 'Account', 'Email', 'Phone', 'Status', 'LinkedWork'];
  const lines = rows.map((row) => [row.id, row.name, row.roleTitle, row.accountName, row.email, row.phone, row.status, row.linkedWork]);
  const csv = [headers, ...lines].map((line) => line.map((value) => csvEscape(value)).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ContactsPageClient({ initialRows, accounts }: { initialRows: ContactTableRow[]; accounts: AccountOption[] }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialRows);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ContactForm>({
    accountId: accounts[0]?.id ?? '',
    firstName: '',
    lastName: '',
    roleTitle: '',
    email: '',
    phone: '',
  });

  const shouldAutoOpenNew = useMemo(() => searchParams.get('new') === '1', [searchParams]);
  const shouldAutoExport = useMemo(() => searchParams.get('export') === '1', [searchParams]);

  useEffect(() => {
    if (shouldAutoOpenNew) {
      setShowCreate(true);
    }
  }, [shouldAutoOpenNew]);

  useEffect(() => {
    if (shouldAutoExport) {
      exportRowsToCsv(rows);
      toast.success('Contacts CSV export started');
    }
  }, [rows, shouldAutoExport]);

  async function createContact() {
    if (!form.accountId || !form.firstName.trim() || !form.lastName.trim() || !form.roleTitle.trim()) {
      toast.error('Account, first name, last name, and role are required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: form.accountId,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          roleTitle: form.roleTitle.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          status: 'ACTIVE',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create contact');
      }

      const account = accounts.find((item) => item.id === form.accountId);
      const nextRow: ContactTableRow = {
        id: payload.id,
        name: `${payload.firstName} ${payload.lastName}`,
        roleTitle: payload.roleTitle,
        accountName: account?.name ?? 'Account',
        email: payload.email ?? '—',
        phone: payload.phone ?? '—',
        status: payload.status,
        linkedWork: 'Newly created',
      };

      setRows((current) => [nextRow, ...current]);
      setShowCreate(false);
      setForm((current) => ({ ...current, firstName: '', lastName: '', roleTitle: '', email: '', phone: '' }));
      toast.success('Contact created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create contact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close' : 'New Contact'}</Button>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
              Account
              <select
                value={form.accountId}
                onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
                className="h-11 w-full rounded-md border bg-white px-3 text-sm"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>
            <Input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} placeholder="First name" />
            <Input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} placeholder="Last name" />
            <Input value={form.roleTitle} onChange={(event) => setForm((current) => ({ ...current, roleTitle: event.target.value }))} placeholder="Role" />
            <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
            <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
              <Button onClick={createContact} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ContactsTable rows={rows} onExportCsv={() => exportRowsToCsv(rows)} />
    </div>
  );
}
