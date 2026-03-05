'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AccountsTable, type AccountTableRow } from '@/components/crm/accounts-table';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';

type AccountForm = {
  name: string;
  licenseNumber: string;
  address1: string;
  city: string;
  state: string;
  zipcode: string;
  phone: string;
};

const EMPTY_FORM: AccountForm = {
  name: '',
  licenseNumber: '',
  address1: '',
  city: '',
  state: '',
  zipcode: '',
  phone: '',
};

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportRowsToCsv(rows: AccountTableRow[]) {
  const headers = ['ID', 'Name', 'License', 'Status', 'City', 'State', 'Contacts', 'OpenValue', 'DaysOverdue', 'LastUpdated'];
  const lines = rows.map((row) => [
    row.id,
    row.name,
    row.licenseNumber,
    row.status,
    row.city,
    row.state,
    String(row.contactsCount),
    String(row.openValue),
    String(row.daysOverdue),
    row.lastUpdated,
  ]);

  const csv = [headers, ...lines]
    .map((line) => line.map((value) => csvEscape(value)).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AccountsPageClient({ initialRows }: { initialRows: AccountTableRow[] }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialRows);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);

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
      toast.success('Accounts CSV export started');
    }
  }, [rows, shouldAutoExport]);

  async function createAccount() {
    if (!form.name.trim() || !form.licenseNumber.trim()) {
      toast.error('Name and license are required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          licenseNumber: form.licenseNumber.trim(),
          address1: form.address1.trim() || 'Address pending',
          city: form.city.trim() || 'Unknown',
          state: form.state.trim() || 'CA',
          zipcode: form.zipcode.trim() || '00000',
          phone: form.phone.trim() || null,
          status: 'ACTIVE',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create account');
      }

      const nextRow: AccountTableRow = {
        id: payload.id,
        name: payload.name,
        licenseNumber: payload.licenseNumber,
        status: payload.status,
        city: payload.city,
        state: payload.state,
        contactsCount: 0,
        openValue: 0,
        daysOverdue: 0,
        lastUpdated: new Date(payload.updatedAt).toLocaleDateString(),
      };

      setRows((current) => [nextRow, ...current]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      toast.success('Account created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close' : 'New Account'}</Button>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Account name" />
            <Input value={form.licenseNumber} onChange={(event) => setForm((current) => ({ ...current, licenseNumber: event.target.value }))} placeholder="License number" />
            <Input value={form.address1} onChange={(event) => setForm((current) => ({ ...current, address1: event.target.value }))} placeholder="Address" />
            <Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
            <Input value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} placeholder="State" />
            <Input value={form.zipcode} onChange={(event) => setForm((current) => ({ ...current, zipcode: event.target.value }))} placeholder="Zipcode" />
            <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
              <Button onClick={createAccount} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AccountsTable rows={rows} onExportCsv={() => exportRowsToCsv(rows)} />
    </div>
  );
}
