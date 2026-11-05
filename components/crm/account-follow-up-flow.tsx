'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CalendarPlus, Loader2, Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { dateAfterToday } from '@/lib/follow-up/sales-today';
import { notifyAccountUpdated } from '@/lib/territory/account-cache-events';

export type FollowUpAccountOption = {
  id: string;
  notionPageId: string;
  name: string;
  repNames: string[];
};

type AccountFollowUpFlowProps = {
  accounts: FollowUpAccountOption[];
  initialAccountId?: string;
  initialDate?: string | null;
  initialReason?: string | null;
  today?: string;
  trigger?: ReactNode;
  onSaved?: () => void;
};

export function AccountFollowUpFlow({ accounts, initialAccountId, initialDate, initialReason, today, trigger, onSaved }: AccountFollowUpFlowProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = accounts.find((account) => account.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US');
    if (!query) return accounts.slice(0, 50);
    return accounts
      .filter((account) => `${account.name} ${account.repNames.join(' ')}`.toLocaleLowerCase('en-US').includes(query))
      .slice(0, 50);
  }, [accounts, search]);

  function changeOpen(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setSelectedId(initialAccountId ?? '');
      setFollowUpDate(initialDate?.slice(0, 10) ?? '');
      setReason(initialReason ?? '');
      setError(null);
    } else {
      setSearch('');
      setSelectedId('');
      setFollowUpDate('');
      setReason('');
      setError(null);
    }
  }

  async function save() {
    if (!selected || !followUpDate) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/territory/stores/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ followUpDate, followUpNeeded: true, followUpReason: reason.trim() || null }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; syncWarning?: string | null };
      if (!response.ok) throw new Error(payload.error || 'Follow-up could not be saved.');
      toast.success('Follow-up set', { description: payload.syncWarning || `${selected.name} is scheduled for ${followUpDate}.` });
      notifyAccountUpdated(selected.id);
      setOpen(false);
      onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Follow-up could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        {trigger ?? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#dfe4d7] bg-white px-3 text-[14px] font-semibold text-[#30392a] transition hover:bg-[#f3f5ef] active:scale-[0.98]">
          <CalendarPlus className="h-4 w-4" />
          New follow-up
        </button>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[6000] bg-[#242624]/45" />
        <Dialog.Content className="fixed inset-x-3 bottom-[calc(var(--picc-bottom-nav-clearance)+12px)] z-[6100] mx-auto max-h-[calc(100dvh-var(--picc-bottom-nav-clearance)-32px)] max-w-lg overflow-y-auto rounded-xl border border-[#dfe4d7] bg-[#fbfcf9] p-4 shadow-[0_24px_70px_rgba(24,33,45,0.24)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[19px] font-semibold text-[#18212d]">{initialAccountId ? 'Edit follow-up' : 'New follow-up'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-[14px] text-[#667183]">Choose the account, date, and next action.</Dialog.Description>
            </div>
            <Dialog.Close className="grid h-10 w-10 place-items-center rounded-lg text-[#5f6978] hover:bg-[#e9edf3]" aria-label="Close follow-up" disabled={saving}>
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {selected ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#cbd3df] bg-white p-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#18212d]">{selected.name}</p>
                <p className="truncate text-[12px] text-[#7a8492]">Rep: {selected.repNames.join(', ') || 'Unassigned'}</p>
              </div>
              {!initialAccountId ? <button type="button" onClick={() => setSelectedId('')} className="text-[13px] font-semibold text-[#c93412]">Change</button> : null}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-[#cbd3df] bg-white">
              <label className="flex h-11 items-center gap-2 border-b border-[#e0e5ed] px-3">
                <Search className="h-4 w-4 text-[#7b8491]" />
                <span className="sr-only">Search accounts</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search account or rep" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#929ba8]" />
              </label>
              <div className="max-h-48 overflow-y-auto p-1.5">
                {filtered.length ? filtered.map((account) => (
                  <button key={account.id} type="button" onClick={() => setSelectedId(account.id)} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-[#f1f4f8]">
                    <p className="truncate text-[14px] font-semibold text-[#253142]">{account.name}</p>
                    <p className="truncate text-[12px] text-[#7a8492]">{account.repNames.join(', ') || 'Unassigned'}</p>
                  </button>
                )) : <p className="px-3 py-6 text-center text-[14px] text-[#77818f]">No matching accounts</p>}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[{ label: 'Tomorrow', days: 1 }, { label: '3 days', days: 3 }, { label: '1 week', days: 7 }].map((option) => (
              <button key={option.days} type="button" onClick={() => setFollowUpDate(dateAfterToday(today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), option.days))} className="min-h-10 rounded-lg border border-[#cbd3df] bg-white px-2 text-[13px] font-semibold text-[#344052] hover:bg-[#f0f3f7] active:scale-[0.98]">{option.label}</button>
            ))}
          </div>
          <label className="mt-3 block text-[13px] font-semibold text-[#344052]">
            Follow-up date
            <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#cbd3df] bg-white px-3 text-[16px] text-[#18212d]" />
          </label>
          <label className="mt-3 block text-[13px] font-semibold text-[#344052]">
            Next action <span className="font-normal text-[#667183]">(optional)</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What needs to happen next?" className="mt-1 h-11 w-full rounded-lg border border-[#cbd3df] bg-white px-3 text-[15px] font-normal text-[#18212d] placeholder:text-[#929ba8]" />
          </label>
          {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Dialog.Close className="min-h-11 rounded-lg border border-[#cbd3df] bg-white px-3 text-[14px] font-semibold text-[#344052]" disabled={saving}>Cancel</Dialog.Close>
            <button type="button" onClick={() => void save()} disabled={saving || !selected || !followUpDate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#c93412] px-3 text-[14px] font-semibold text-white hover:bg-[#ad2d0e] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#d7aaa0]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {saving ? 'Saving' : 'Set follow-up'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
