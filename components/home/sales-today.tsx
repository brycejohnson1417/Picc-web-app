'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Loader2, Pencil, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { AccountFollowUpFlow } from '@/components/crm/account-follow-up-flow';
import { notifyAccountUpdated } from '@/lib/territory/account-cache-events';
import { buildTodayQueues, dateOnly, followUpDisplayText, followUpPatch, parseTodayPayload, type TodayPayload, type TodayQueueKey, type TodayRow } from '@/lib/follow-up/sales-today';

const REP_KEY = 'picc:today:rep';
const PAGE_SIZE = 20;
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#dfe4d7] bg-white px-3 text-[13px] font-semibold text-[#30392a] transition hover:bg-[#f2f4ee] disabled:cursor-wait disabled:opacity-50';
const queues: { key: TodayQueueKey; label: string; empty: string }[] = [
  { key: 'due', label: 'Due now', empty: 'No follow-ups due for this book.' },
  { key: 'upcoming', label: 'Upcoming', empty: 'No upcoming follow-ups for this book.' },
  { key: 'unscheduled', label: 'Needs a date', empty: 'Every open follow-up has a date.' },
  { key: 'ppp', label: 'PPP waiting', empty: 'No accounts waiting on PPP in this book.' },
  { key: 'payments', label: 'Payment conditions', empty: 'No flagged payment conditions in the available source.' },
  { key: 'samples', label: 'Sample follow-up', empty: 'No verified sample follow-ups in this book.' },
];

function formatDay(value: string, full = false) {
  if (!dateOnly(value)) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: full ? 'long' : 'short', day: 'numeric', ...(full ? { weekday: 'long' as const } : {}) }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function dueLabel(row: TodayRow) {
  if (row.dueDays === null) return 'Needs a date';
  if (row.dueDays < 0) return `${Math.abs(row.dueDays)}d overdue`;
  if (row.dueDays === 0) return 'Today';
  if (row.dueDays === 1) return 'Tomorrow';
  return row.followUpDate ? formatDay(row.followUpDate) : '';
}

async function loadToday(): Promise<TodayPayload> {
  const response = await fetch('/api/workspace/today', { cache: 'no-store' });
  if (!response.ok) throw new Error('Today’s account queue is unavailable.');
  return parseTodayPayload(await response.json());
}

export function SalesToday() {
  const { canEdit } = useAppAccess();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['workspace-today'], queryFn: loadToday, staleTime: 30_000, retry: false });
  const data = query.data;
  const [rep, setRep] = useState('');
  const [queue, setQueue] = useState<TodayQueueKey>('due');
  const [dueOrder, setDueOrder] = useState<'recent' | 'oldest'>('recent');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const preferenceLoaded = useRef(false);

  const reps = useMemo(() => data ? [...new Set(data.stores.flatMap(store => store.repNames))].sort().concat(data.stores.some(store => !store.repNames.length) ? ['Unassigned'] : []) : [], [data]);
  useEffect(() => {
    if (!data || preferenceLoaded.current) return;
    preferenceLoaded.current = true;
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(REP_KEY); } catch { /* Preference storage is optional. */ }
    setRep(saved !== null && (saved === '' || reps.includes(saved)) ? saved : data.viewerRep && reps.includes(data.viewerRep) ? data.viewerRep : '');
  }, [data, reps]);

  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['workspace-today'] }); };
    window.addEventListener('picc:account-updated', refresh);
    return () => window.removeEventListener('picc:account-updated', refresh);
  }, [queryClient]);

  const scoped = useMemo(() => data ? buildTodayQueues(data.stores, data.today, rep, dueOrder) : null, [data, rep, dueOrder]);
  const paymentCoverage = useMemo(() => {
    const book = (data?.stores ?? []).filter(store => !rep || (rep === 'Unassigned' ? !store.repNames.length : store.repNames.includes(rep)));
    return { known: book.filter(store => !!store.paymentStatus?.trim()).length, accounts: book.length };
  }, [data, rep]);
  const visibleQueues = queues.filter(item => item.key !== 'samples' || !!scoped?.samples.length);
  const effectiveQueue = queue === 'samples' && !scoped?.samples.length ? 'due' : queue;
  const activeQueue = queues.find(item => item.key === effectiveQueue)!;
  const rows = useMemo(() => {
    const text = search.trim().toLocaleLowerCase('en-US');
    return (scoped?.[effectiveQueue] ?? []).filter(row => !text || [row.name, row.city, row.locationAddress, row.followUpReason, row.pppStatus, row.paymentStatus].filter(Boolean).join(' ').toLocaleLowerCase('en-US').includes(text));
  }, [scoped, effectiveQueue, search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount - 1);
  const accounts = useMemo(() => (data?.stores ?? []).map(store => ({ id: store.id, notionPageId: store.notionPageId ?? store.id, name: store.name, repNames: store.repNames })), [data]);

  function changeRep(value: string) {
    setRep(value);
    setPage(0);
    try { window.localStorage.setItem(REP_KEY, value); } catch { /* Preference storage is optional. */ }
  }

  function refreshAccounts() {
    void queryClient.invalidateQueries({ queryKey: ['workspace-today'] });
    void queryClient.invalidateQueries({ queryKey: ['territory-mobile'] });
  }

  async function patchFollowUp(row: TodayRow, patch: { followUpNeeded?: boolean | null; followUpDate?: string | null; followUpReason?: string | null }, message: string, allowUndo = true) {
    setSavingId(row.id);
    setSaveError(null);
    try {
      const response = await fetch(`/api/territory/stores/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      const result = await response.json().catch(() => ({})) as { error?: string; syncWarning?: string };
      if (!response.ok) throw new Error(result.error || 'The follow-up could not be updated.');
      queryClient.setQueryData<TodayPayload>(['workspace-today'], current => current ? { ...current, stores: current.stores.map(store => store.id === row.id ? { ...store, ...patch } : store) } : current);
      notifyAccountUpdated(row.id);
      refreshAccounts();
      toast.success(message, {
        description: result.syncWarning || row.name,
        ...(allowUndo ? { action: { label: 'Undo', onClick: () => void patchFollowUp(row, { followUpNeeded: row.followUpNeeded ?? false, followUpDate: row.followUpDate ?? null, followUpReason: row.followUpReason ?? null }, 'Follow-up restored', false) } } : {}),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The follow-up could not be updated.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-full bg-[#fbfcf9] px-4 py-5 text-[#30392a] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-[22px] font-semibold">Today</h1><p className="mt-1 text-[13px] text-[#737c6b]">{data ? formatDay(data.today, true) : 'Account follow-ups'}</p></div>
          <div className="flex flex-wrap items-center gap-2"><Link href="/calendar" className={buttonClass}><CalendarDays className="h-4 w-4" />Calendar</Link>{canEdit && data ? <AccountFollowUpFlow accounts={accounts} today={data.today} onSaved={refreshAccounts} /> : null}</div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-[#dfe4d7] py-3">
          <label className="flex items-center gap-2 text-[13px] font-medium">Book<select aria-label="Rep book" value={rep} onChange={event => changeRep(event.target.value)} className="h-10 max-w-[230px] rounded-lg border border-[#dfe4d7] bg-white pl-3 pr-8 text-[14px] outline-none focus:border-[#8b9582]"><option value="">All reps</option>{reps.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <div className="flex items-center gap-2 text-[12px] text-[#737c6b]">
            {data ? <details className="relative"><summary className="cursor-pointer py-2">Last sync {new Date(data.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}</summary><div className="absolute right-0 z-20 mt-1 w-[min(320px,80vw)] rounded-lg border border-[#dfe4d7] bg-white p-4 text-[13px] shadow-lg"><p className="font-semibold text-[#30392a]">Current account records</p><p className="mt-2">{data.stores.length.toLocaleString()} accounts. Follow-up dates use New York calendar days.</p>{Object.entries(data.coverage ?? {}).filter(([, value]) => typeof value === 'string').map(([key, value]) => <p key={key} className="mt-2">{String(value)}</p>)}</div></details> : null}
            <button type="button" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#edf0e7] disabled:opacity-50" aria-label="Refresh Today" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {query.isError ? <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-[14px] text-red-900"><p>{query.error.message}{data ? ' Showing the last loaded records.' : ''}</p><button type="button" onClick={() => void query.refetch()} className={buttonClass}>Retry</button></div> : null}
        {saveError ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[14px] text-red-900">{saveError}</div> : null}
        {!canEdit ? <p className="mt-4 text-[13px] text-[#737c6b]">Your current role has read-only access.</p> : null}

        {query.isPending ? <div className="mt-5 space-y-3" aria-label="Loading account follow-ups">{[0, 1, 2, 3].map(index => <div key={index} className="h-28 animate-pulse rounded-lg border border-[#e6e9e0] bg-[#f0f2ec]" />)}</div> : data && scoped ? <>
          <div role="tablist" aria-label="Account work queues" className="mt-4 flex gap-1 overflow-x-auto border-b border-[#dfe4d7]">{visibleQueues.map(item => <button key={item.key} type="button" role="tab" id={`today-tab-${item.key}`} aria-controls="today-queue" aria-selected={effectiveQueue === item.key} onClick={() => { setQueue(item.key); setPage(0); setSearch(''); }} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-[13px] font-semibold transition ${effectiveQueue === item.key ? 'border-[#c93412] text-[#b72d10]' : 'border-transparent text-[#737c6b] hover:text-[#30392a]'}`}>{item.label}<span className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${effectiveQueue === item.key ? 'bg-[#f9e9e3]' : 'bg-[#edf0e7]'}`}>{item.key === 'payments' && !paymentCoverage.known ? '—' : scoped[item.key].length}</span></button>)}</div>

          <section role="tabpanel" id="today-queue" aria-labelledby={`today-tab-${effectiveQueue}`} className="pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[16px] font-semibold">{activeQueue.label}</h2>{effectiveQueue === 'due' && scoped.due.length ? <p className="mt-0.5 text-[12px] text-[#737c6b]">{scoped.due.filter(row => row.dueDays! < 0).length} overdue · {scoped.due.filter(row => row.dueDays === 0).length} today</p> : effectiveQueue === 'payments' ? <p className="mt-0.5 text-[12px] text-[#737c6b]">{paymentCoverage.known ? `${paymentCoverage.known} of ${paymentCoverage.accounts} accounts have recorded conditions · balances unavailable` : 'Payment conditions unavailable for this book'}</p> : effectiveQueue === 'ppp' ? <p className="mt-0.5 text-[12px] text-[#737c6b]">Current enrollment stage</p> : null}</div><label className="flex h-10 w-full items-center gap-2 rounded-lg border border-[#dfe4d7] bg-white px-3 sm:w-72"><Search className="h-4 w-4 shrink-0 text-[#737c6b]" /><span className="sr-only">Search this queue</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search this queue" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#8b9383]" /></label></div>
            {effectiveQueue === 'due' ? <label className="mb-3 flex items-center gap-2 text-[12px] text-[#737c6b]">Order<select aria-label="Due follow-up order" value={dueOrder} onChange={event => { setDueOrder(event.target.value as 'recent' | 'oldest'); setPage(0); }} className="h-9 rounded-lg border border-[#dfe4d7] bg-white px-2 text-[13px] text-[#30392a]"><option value="recent">Recent due</option><option value="oldest">Oldest first</option></select></label> : null}
            <div className="overflow-hidden rounded-xl border border-[#dfe4d7] bg-white">
              {rows.length ? rows.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE).map(row => <article key={row.id} className="flex flex-col gap-3 border-b border-[#e5e9df] p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Link href={`/territory?focus=${encodeURIComponent(row.id)}`} className="inline-flex min-w-0 items-center gap-1.5 text-[15px] font-semibold hover:text-[#c93412] hover:underline">{row.name}<ArrowRight className="h-3.5 w-3.5 shrink-0" /></Link>{row.followUpNeeded ? <span className={`text-[11px] font-semibold ${row.dueDays !== null && row.dueDays < 0 ? 'text-[#b44322]' : 'text-[#737c6b]'}`}>{dueLabel(row)}</span> : null}</div><p className="mt-1 truncate text-[12px] text-[#737c6b]">{[row.city || row.locationAddress, row.repNames.join(', ') || 'Unassigned'].filter(Boolean).join(' · ')}</p>{row.followUpReason ? <p className="mt-2 break-words text-[14px] leading-5 text-[#434b3d]">{followUpDisplayText(row.followUpReason)}</p> : null}
                  {effectiveQueue === 'ppp' ? <div className="mt-2 text-[13px] text-[#695625]"><p>{row.pppStatus}{row.pppAgeDays !== null ? ` · ${row.pppAgeDays}d in this stage` : ''}{row.waitingOn ? ` · Waiting on ${row.waitingOn}` : ''}</p>{row.pppNotes ? <p className="mt-1 whitespace-pre-line text-[#737c6b]">{row.pppNotes}</p> : null}</div> : null}
                  {row.paymentStatus && (effectiveQueue === 'payments' || effectiveQueue === 'due') ? <p className="mt-2 text-[12px] text-[#695625]">{row.paymentStatus}{row.paymentDaysAvg !== null && row.paymentDaysAvg !== undefined ? ` · Average ${Math.abs(row.paymentDaysAvg).toLocaleString('en-US', { maximumFractionDigits: 1 })}d ${row.paymentDaysAvg < 0 ? 'before' : 'after'} due` : ''}</p> : null}
                  {effectiveQueue === 'samples' && row.lastSampleDate ? <p className="mt-2 text-[12px] text-[#737c6b]">Sample {formatDay(row.lastSampleDate)}</p> : null}
                </div>
                {canEdit ? <div className="flex shrink-0 flex-wrap items-center gap-2">{row.followUpNeeded ? <><button type="button" aria-label={`Complete follow-up for ${row.name}`} disabled={savingId !== null} onClick={() => void patchFollowUp(row, followUpPatch('complete', data.today), 'Follow-up completed')} className={`${buttonClass} border-[#cfdcc8] text-[#426437]`}>{savingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Done</button><button type="button" aria-label={`Move ${row.name} follow-up to tomorrow`} disabled={savingId !== null} onClick={() => void patchFollowUp(row, followUpPatch('tomorrow', data.today), 'Moved to tomorrow')} className={buttonClass}><Clock3 className="h-3.5 w-3.5" />Tomorrow</button></> : null}<AccountFollowUpFlow accounts={accounts} initialAccountId={row.id} initialDate={row.followUpDate} initialReason={row.followUpReason} today={data.today} onSaved={refreshAccounts} trigger={<button type="button" disabled={savingId !== null} aria-label={`Edit follow-up for ${row.name}`} className={buttonClass}><Pencil className="h-3.5 w-3.5" />{row.followUpNeeded ? 'Edit' : 'Follow up'}</button>} /></div> : null}
              </article>) : <div className="px-4 py-12 text-center text-[14px] text-[#737c6b]">{search ? 'No accounts match this search.' : effectiveQueue === 'payments' && !paymentCoverage.known ? 'No payment conditions were available from the current source for these accounts.' : activeQueue.empty}{search ? <button type="button" onClick={() => setSearch('')} className="mt-3 block w-full font-semibold text-[#c93412]">Clear search</button> : null}</div>}
            </div>
            {rows.length > 0 ? <div className="mt-3 flex items-center justify-between text-[12px] text-[#737c6b]"><p>{visiblePage * PAGE_SIZE + 1}–{Math.min((visiblePage + 1) * PAGE_SIZE, rows.length)} of {rows.length} accounts</p><div className="flex gap-1"><button aria-label="Previous accounts" type="button" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#edf0e7] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button aria-label="Next accounts" type="button" disabled={visiblePage >= pageCount - 1} onClick={() => setPage(visiblePage + 1)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[#edf0e7] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div></div> : null}
          </section>
        </> : null}
      </div>
    </main>
  );
}
