'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';

type AppointmentItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  reminderMinutes: number | null;
  accountId: string;
  contactId: string | null;
  account: { id: string; name: string };
  contact: { id: string; firstName: string; lastName: string } | null;
};

type VendorDayItem = {
  id: string;
  eventDate: string;
  status: string;
  account: { id: string; name: string };
  repName: string | null;
  ambassadorName: string | null;
  notes: string | null;
};

type AccountOption = { id: string; name: string };

type AppointmentForm = {
  title: string;
  accountId: string;
  startsAt: string;
  endsAt: string;
  description: string;
  reminderMinutes: string;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toDateKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function toDatetimeLocalValue(date: Date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 16);
}

function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function CalendarClient({
  initialAppointments,
  initialVendorDays,
  accounts,
  autoOpenCreate = false,
}: {
  initialAppointments: AppointmentItem[];
  initialVendorDays: VendorDayItem[];
  accounts: AccountOption[];
  autoOpenCreate?: boolean;
}) {
  const now = new Date();
  const [appointments, setAppointments] = useState<AppointmentItem[]>(initialAppointments);
  const [vendorDays] = useState<VendorDayItem[]>(initialVendorDays);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(now));
  const [monthCursor, setMonthCursor] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [showForm, setShowForm] = useState(autoOpenCreate);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState<AppointmentForm>(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return {
      title: '',
      accountId: accounts[0]?.id ?? '',
      startsAt: toDatetimeLocalValue(start),
      endsAt: toDatetimeLocalValue(end),
      description: '',
      reminderMinutes: '30',
    };
  });

  const [editForms, setEditForms] = useState<Record<string, AppointmentForm>>({});

  const appointmentByDay = useMemo(() => {
    const map = new Map<string, AppointmentItem[]>();
    for (const appointment of appointments) {
      const key = toDateKey(new Date(appointment.startsAt));
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  const vendorByDay = useMemo(() => {
    const map = new Map<string, VendorDayItem[]>();
    for (const vendorDay of vendorDays) {
      const key = toDateKey(new Date(vendorDay.eventDate));
      const list = map.get(key) ?? [];
      list.push(vendorDay);
      map.set(key, list);
    }
    return map;
  }, [vendorDays]);

  const selectedKey = toDateKey(selectedDate);
  const selectedAppointments = appointmentByDay.get(selectedKey) ?? [];
  const selectedVendorDays = vendorByDay.get(selectedKey) ?? [];

  const monthCells = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const firstDay = start.getDay();
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = 0; i < firstDay; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() - (firstDay - i));
      cells.push({ date, inMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
      cells.push({ date, inMonth: true });
    }

    while (cells.length % 7 !== 0) {
      const date = new Date(cells[cells.length - 1].date);
      date.setDate(date.getDate() + 1);
      cells.push({ date, inMonth: false });
    }

    return cells;
  }, [monthCursor]);

  const weekDays = useMemo(() => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(start);
      date.setDate(start.getDate() + idx);
      return date;
    });
  }, [selectedDate]);

  function resetFormForDate(date: Date) {
    const start = new Date(date);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    setForm((current) => ({
      ...current,
      startsAt: toDatetimeLocalValue(start),
      endsAt: toDatetimeLocalValue(end),
      title: '',
      description: '',
    }));
  }

  async function createAppointment() {
    if (!form.title.trim()) {
      toast.error('Appointment title is required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: form.accountId,
          title: form.title.trim(),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          reminderMinutes: form.reminderMinutes ? Number(form.reminderMinutes) : undefined,
          description: form.description.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create appointment');
      }

      const account = accounts.find((item) => item.id === form.accountId);
      setAppointments((current) => [
        {
          ...payload,
          account: payload.account ?? { id: form.accountId, name: account?.name ?? 'Account' },
          contact: payload.contact ?? null,
        },
        ...current,
      ]);
      setShowForm(false);
      resetFormForDate(selectedDate);
      toast.success('Appointment created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create appointment');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(appointment: AppointmentItem) {
    setEditingId(appointment.id);
    setEditForms((current) => ({
      ...current,
      [appointment.id]: {
        title: appointment.title,
        accountId: appointment.accountId,
        startsAt: toDatetimeLocalValue(new Date(appointment.startsAt)),
        endsAt: toDatetimeLocalValue(new Date(appointment.endsAt)),
        description: appointment.description ?? '',
        reminderMinutes: appointment.reminderMinutes ? String(appointment.reminderMinutes) : '',
      },
    }));
  }

  async function saveEdit(appointmentId: string) {
    const editForm = editForms[appointmentId];
    if (!editForm) return;

    setSavingId(appointmentId);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          startsAt: new Date(editForm.startsAt).toISOString(),
          endsAt: new Date(editForm.endsAt).toISOString(),
          reminderMinutes: editForm.reminderMinutes ? Number(editForm.reminderMinutes) : null,
          description: editForm.description.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update appointment');
      }

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === appointmentId
            ? {
                ...appointment,
                ...payload,
                account: appointment.account,
                contact: appointment.contact,
              }
            : appointment,
        ),
      );
      setEditingId(null);
      toast.success('Appointment updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update appointment');
    } finally {
      setSavingId(null);
    }
  }

  async function removeAppointment(appointmentId: string) {
    setDeletingId(appointmentId);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to delete appointment');
      }
      setAppointments((current) => current.filter((appointment) => appointment.id !== appointmentId));
      toast.success('Appointment deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete appointment');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">Interactive planning across appointments and vendor-day events.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={view === 'month' ? 'default' : 'outline'} onClick={() => setView('month')}>Month</Button>
          <Button variant={view === 'week' ? 'default' : 'outline'} onClick={() => setView('week')}>Week</Button>
          <Button variant={view === 'day' ? 'default' : 'outline'} onClick={() => setView('day')}>Day</Button>
          <Button
            onClick={() => {
              resetFormForDate(selectedDate);
              setShowForm((value) => !value);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {showForm ? 'Close' : 'New Appointment'}
          </Button>
        </div>
      </header>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Appointment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-500">
              Title
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Account check-in" />
            </label>
            <label className="space-y-1 text-xs text-slate-500">
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
            <label className="space-y-1 text-xs text-slate-500">
              Starts At
              <Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              Ends At
              <Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} />
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              Reminder Minutes
              <Input value={form.reminderMinutes} onChange={(event) => setForm((current) => ({ ...current, reminderMinutes: event.target.value }))} placeholder="30" />
            </label>
            <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
              Description
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Meeting agenda and context" />
            </label>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={creating}>Cancel</Button>
              <Button onClick={createAppointment} disabled={creating}>{creating ? 'Creating...' : 'Create Appointment'}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {view === 'month' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{monthCursor.toLocaleString([], { month: 'long', year: 'numeric' })}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>Prev</Button>
                <Button variant="outline" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>Next</Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-slate-500">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((cell) => {
                const key = toDateKey(cell.date);
                const count = (appointmentByDay.get(key)?.length ?? 0) + (vendorByDay.get(key)?.length ?? 0);
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.date);
                      setView('day');
                    }}
                    className={`min-h-[92px] rounded-md border p-2 text-left ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : cell.inMonth
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-100 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <p className="text-sm font-semibold">{cell.date.getDate()}</p>
                    {count > 0 ? (
                      <p className="mt-1 text-xs text-slate-600">
                        <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                        {count} event{count > 1 ? 's' : ''}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {view === 'week' ? (
        <Card>
          <CardHeader>
            <CardTitle>Week of {weekDays[0].toLocaleDateString()}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const dayAppointments = appointmentByDay.get(key) ?? [];
              const dayVendors = vendorByDay.get(key) ?? [];
              return (
                <button
                  key={key}
                  type="button"
                  className="rounded-lg border p-3 text-left"
                  onClick={() => {
                    setSelectedDate(day);
                    setView('day');
                  }}
                >
                  <p className="font-semibold">{day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  <p className="text-xs text-slate-500">{dayAppointments.length} appointments · {dayVendors.length} vendor days</p>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {view === 'day' ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedAppointments.length === 0 && selectedVendorDays.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No events on this date.</p>
            ) : null}

            {selectedAppointments.map((appointment) => {
              const editing = editingId === appointment.id;
              const editForm = editForms[appointment.id];
              return (
                <div key={appointment.id} className="rounded-lg border p-3">
                  {editing && editForm ? (
                    <div className="space-y-2">
                      <Input
                        value={editForm.title}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [appointment.id]: { ...editForm, title: event.target.value },
                          }))
                        }
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          type="datetime-local"
                          value={editForm.startsAt}
                          onChange={(event) =>
                            setEditForms((current) => ({
                              ...current,
                              [appointment.id]: { ...editForm, startsAt: event.target.value },
                            }))
                          }
                        />
                        <Input
                          type="datetime-local"
                          value={editForm.endsAt}
                          onChange={(event) =>
                            setEditForms((current) => ({
                              ...current,
                              [appointment.id]: { ...editForm, endsAt: event.target.value },
                            }))
                          }
                        />
                      </div>
                      <Textarea
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForms((current) => ({
                            ...current,
                            [appointment.id]: { ...editForm, description: event.target.value },
                          }))
                        }
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingId(null)} disabled={savingId === appointment.id}>Cancel</Button>
                        <Button onClick={() => saveEdit(appointment.id)} disabled={savingId === appointment.id}>
                          {savingId === appointment.id ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{appointment.title}</p>
                          <p className="text-xs text-slate-500">{formatTimeRange(appointment.startsAt, appointment.endsAt)} · {appointment.account.name}</p>
                          {appointment.description ? <p className="mt-1 text-sm text-slate-600">{appointment.description}</p> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(appointment)}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => removeAppointment(appointment.id)} disabled={deletingId === appointment.id}>
                            {deletingId === appointment.id ? '...' : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {selectedVendorDays.map((vendorDay) => (
              <div key={vendorDay.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-semibold text-amber-900">Vendor Day · {vendorDay.account.name}</p>
                <p className="text-xs text-amber-800">
                  {new Date(vendorDay.eventDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {vendorDay.status}
                </p>
                <p className="text-sm text-amber-900">Rep: {vendorDay.repName ?? 'Unassigned'} · BA: {vendorDay.ambassadorName ?? 'Unassigned'}</p>
                {vendorDay.notes ? <p className="mt-1 text-sm text-amber-900">{vendorDay.notes}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
