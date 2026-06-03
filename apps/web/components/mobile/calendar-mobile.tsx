'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import type { TerritoryStorePin } from '@/lib/territory/types';

type CalendarMode = 'follow-ups' | 'vendor-days';

type FollowUpEntry = Pick<TerritoryStorePin, 'id' | 'name' | 'followUpDate' | 'followUpReason' | 'status'> & {
  salesRep: string | null;
};

type VendorDayEntry = {
  id: string;
  eventDate: string;
  repName: string | null;
  ambassadorName: string | null;
  account: {
    id?: string | null;
    name: string;
  } | null;
  source?: 'local_assignment' | 'local_request' | 'notion_archive';
};

const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CALENDAR_SNAPSHOT_KEY = 'picc:calendar-mobile:v1';
const CALENDAR_SNAPSHOT_TTL_MS = 1000 * 60 * 5;

type CalendarSnapshot = {
  fetchedAt: number;
  mode: CalendarMode;
  viewDate: string;
  selectedDayKey: string;
  followUps: FollowUpEntry[];
  vendorDays: VendorDayEntry[];
  salesRepFilter: string;
  vendorDayRepFilter: string;
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dayKey(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === 'string') {
    const literalDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (literalDate) {
      return literalDate;
    }
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildCalendarDays(viewDate: Date) {
  const monthStart = startOfMonth(viewDate);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const next = new Date(gridStart);
    next.setDate(gridStart.getDate() + index);
    return next;
  });
}

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time not set';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function readCalendarSnapshot() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CALENDAR_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CalendarSnapshot | null;
    if (!parsed || typeof parsed.fetchedAt !== 'number') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCalendarSnapshot(snapshot: CalendarSnapshot) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(CALENDAR_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function CalendarMobile() {
  const router = useRouter();
  const [mode, setMode] = useState<CalendarMode>('follow-ups');
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState(() => dayKey(new Date()) ?? '');
  const [followUps, setFollowUps] = useState<FollowUpEntry[]>([]);
  const [vendorDays, setVendorDays] = useState<VendorDayEntry[]>([]);
  const [salesRepFilter, setSalesRepFilter] = useState('all');
  const [vendorDayRepFilter, setVendorDayRepFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    const cachedSnapshot = readCalendarSnapshot();
    if (cachedSnapshot) {
      setMode(cachedSnapshot.mode);
      setViewDate(startOfMonth(new Date(cachedSnapshot.viewDate)));
      setSelectedDayKey(cachedSnapshot.selectedDayKey);
      setFollowUps(cachedSnapshot.followUps);
      setVendorDays(cachedSnapshot.vendorDays);
      setSalesRepFilter(cachedSnapshot.salesRepFilter);
      setVendorDayRepFilter(cachedSnapshot.vendorDayRepFilter);
      setLastFetchedAt(cachedSnapshot.fetchedAt);
      if (Date.now() - cachedSnapshot.fetchedAt < CALENDAR_SNAPSHOT_TTL_MS) {
        setLoading(false);
        setLoadError(null);
        return;
      }
    }

    const controller = new AbortController();

    const loadCalendar = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [storesResponse, vendorDaysResponse] = await Promise.all([
          fetch('/api/territory/stores', { signal: controller.signal }),
          fetch('/api/vendor-days/calendar', { signal: controller.signal }),
        ]);

        if (!storesResponse.ok || !vendorDaysResponse.ok) {
          throw new Error('Failed to load calendar data');
        }

        const storesPayload = (await storesResponse.json()) as { stores?: TerritoryStorePin[] };
        const vendorDaysPayload = (await vendorDaysResponse.json()) as { entries?: VendorDayEntry[] };

        setFollowUps(
          (storesPayload.stores ?? [])
            .filter((store) => Boolean(store.followUpDate) && store.followUpNeeded !== false)
            .map((store) => ({
              id: store.id,
              name: store.name,
              followUpDate: store.followUpDate ?? null,
              followUpReason: store.followUpReason ?? null,
              status: store.status,
              salesRep: store.repNames[0] ?? null,
            })),
        );
        setVendorDays(vendorDaysPayload.entries ?? []);
        setLastFetchedAt(Date.now());
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load calendar data');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadCalendar();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (lastFetchedAt == null || loading) {
      return;
    }

    writeCalendarSnapshot({
      fetchedAt: lastFetchedAt,
      mode,
      viewDate: viewDate.toISOString(),
      selectedDayKey,
      followUps,
      vendorDays,
      salesRepFilter,
      vendorDayRepFilter,
    });
  }, [followUps, lastFetchedAt, loading, mode, salesRepFilter, selectedDayKey, vendorDayRepFilter, vendorDays, viewDate]);

  useEffect(() => {
    const monthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
    if (!selectedDayKey.startsWith(monthPrefix)) {
      setSelectedDayKey(dayKey(viewDate) ?? '');
    }
  }, [selectedDayKey, viewDate]);

  const monthDays = buildCalendarDays(viewDate);
  const monthKeyPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const salesRepOptions = ['all', ...new Set(followUps.map((entry) => entry.salesRep?.trim()).filter((value): value is string => Boolean(value)))];
  const vendorDayRepOptions = [
    'all',
    ...new Set(
      vendorDays
        .map((entry) => entry.repName?.trim() || entry.ambassadorName?.trim() || null)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const filteredFollowUps = salesRepFilter === 'all' ? followUps : followUps.filter((entry) => (entry.salesRep || 'Unassigned') === salesRepFilter);
  const filteredVendorDays =
    vendorDayRepFilter === 'all'
      ? vendorDays
      : vendorDays.filter((entry) => (entry.repName || entry.ambassadorName || 'Unassigned') === vendorDayRepFilter);

  const followUpsByDay = filteredFollowUps.reduce<Record<string, FollowUpEntry[]>>((acc, entry) => {
    const key = dayKey(entry.followUpDate);
    if (!key) return acc;
    acc[key] = [...(acc[key] ?? []), entry];
    return acc;
  }, {});

  const vendorDaysByDay = filteredVendorDays.reduce<Record<string, VendorDayEntry[]>>((acc, entry) => {
    const key = dayKey(entry.eventDate);
    if (!key) return acc;
    acc[key] = [...(acc[key] ?? []), entry];
    return acc;
  }, {});

  const activeEntries = mode === 'follow-ups' ? followUpsByDay[selectedDayKey] ?? [] : vendorDaysByDay[selectedDayKey] ?? [];
  const selectedDayDate = selectedDayKey ? new Date(`${selectedDayKey}T12:00:00`) : null;

  return (
    <div className="min-h-[calc(100dvh-92px)] bg-[#e6e6e9]">
      <MobileHeader
        title={formatMonthLabel(viewDate)}
        left={
          <button type="button" onClick={() => router.push('/dashboard')} className="flex items-center gap-1 text-[22px]" aria-label="Back to dashboard">
            <ChevronLeft className="h-8 w-8" />
            <span>Calendar</span>
          </button>
        }
      >
        <div className="space-y-3 px-1 pb-1">
          <SegmentedControl
            value={mode}
            onChange={(value) => {
              setMode(value as CalendarMode);
              setSelectedDayKey(dayKey(viewDate) ?? '');
            }}
            options={[
              { value: 'follow-ups', label: 'Follow Ups' },
              { value: 'vendor-days', label: 'Vendor Days' },
            ]}
            className="bg-[#e3b3a8]/45 [&_button]:text-[14px]"
          />
          <div className="rounded-xl bg-[#f9d7cf] px-3 py-2">
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#8f2f1d]">
              {mode === 'follow-ups' ? 'Sales Rep' : 'Vendor Day Rep'}
            </label>
            <select
              value={mode === 'follow-ups' ? salesRepFilter : vendorDayRepFilter}
              onChange={(event) => {
                if (mode === 'follow-ups') {
                  setSalesRepFilter(event.target.value);
                } else {
                  setVendorDayRepFilter(event.target.value);
                }
              }}
              className="mt-1 h-10 w-full rounded-lg border border-[#dfb4a8] bg-white px-3 text-[15px] font-medium text-[#1d1f23]"
            >
              {(mode === 'follow-ups' ? salesRepOptions : vendorDayRepOptions).map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All reps' : option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#b92f10] px-2 py-1.5">
            <button type="button" onClick={() => setViewDate((current) => addMonths(current, -1))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10" aria-label="Previous month">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-[15px] font-medium text-white">{formatMonthLabel(viewDate)}</span>
            <button type="button" onClick={() => setViewDate((current) => addMonths(current, 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10" aria-label="Next month">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </MobileHeader>

      <div className="grid grid-cols-7 border-b border-[#c8c9cf] bg-[#efeff2] px-2 py-1 text-center text-[15px] font-medium text-[#232428]">
        {days.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {loading ? <p className="px-5 py-4 text-[15px] text-[#5d6470]">Loading calendar…</p> : null}
      {loadError ? <p className="px-5 py-4 text-[15px] text-[#a23b22]">{loadError}</p> : null}

      <div className="grid grid-cols-7 border-b border-[#c8c9cf] bg-white">
        {monthDays.map((date) => {
          const key = dayKey(date) ?? '';
          const isCurrentMonth = key.startsWith(monthKeyPrefix);
          const isSelected = key === selectedDayKey;
          const count = mode === 'follow-ups' ? (followUpsByDay[key] ?? []).length : (vendorDaysByDay[key] ?? []).length;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDayKey(key)}
              className={[
                'min-h-[88px] border-b border-r border-[#d5d6db] px-2 py-2 text-left transition',
                isCurrentMonth ? 'bg-white' : 'bg-[#f4f4f7]',
                isSelected ? 'bg-[#fff1ed]' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={['text-[18px] font-semibold', isCurrentMonth ? 'text-[#22242a]' : 'text-[#a5a8af]'].join(' ')}>{date.getDate()}</span>
                {count > 0 ? (
                  <span className={['rounded-full px-2 py-0.5 text-[11px] font-semibold', mode === 'follow-ups' ? 'bg-[#fde2da] text-[#b12f11]' : 'bg-[#e3ebff] text-[#3659b0]'].join(' ')}>
                    {count}
                  </span>
                ) : null}
              </div>
              {count > 0 ? (
                <div className="mt-3 space-y-1">
                  {(mode === 'follow-ups' ? followUpsByDay[key] ?? [] : vendorDaysByDay[key] ?? []).slice(0, 2).map((entry) => (
                    <div
                      key={entry.id}
                      className={['truncate rounded-md px-2 py-1 text-[11px] font-medium', mode === 'follow-ups' ? 'bg-[#fff4f0] text-[#7b2d1d]' : 'bg-[#edf3ff] text-[#2f4d9a]'].join(' ')}
                    >
                      {'name' in entry ? entry.name : entry.account?.name ?? 'Vendor day'}
                    </div>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="border-t border-[#c8c9cf] bg-[#f8f8fa] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[19px] font-semibold text-[#1d1f23]">
              {selectedDayDate ? selectedDayDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Select a day'}
            </p>
            <p className="text-[14px] text-[#666b75]">
              {mode === 'follow-ups' ? 'Stores that need follow-up on this day.' : 'Scheduled vendor days for this day.'}
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#4f5661]">{activeEntries.length} item{activeEntries.length === 1 ? '' : 's'}</span>
        </div>

        {activeEntries.length === 0 ? <p className="mt-4 text-[14px] text-[#666b75]">Nothing scheduled for this day.</p> : null}

        <div className="mt-4 space-y-3">
          {mode === 'follow-ups'
            ? (activeEntries as FollowUpEntry[]).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[#d4d6dc] bg-white px-4 py-3">
                  <p className="text-[16px] font-semibold text-[#1d1f23]">{entry.name}</p>
                  <p className="mt-1 text-[13px] text-[#4f5661]">{entry.salesRep || 'Unassigned rep'}</p>
                  <p className="mt-1 text-[13px] uppercase tracking-wide text-[#8b9099]">{entry.status}</p>
                  <p className="mt-2 text-[14px] text-[#4f5661]">{entry.followUpReason?.trim() || 'No follow-up reason logged.'}</p>
                </div>
              ))
            : (activeEntries as VendorDayEntry[]).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    if (entry.account?.id) {
                      router.push(`/accounts?storeId=${encodeURIComponent(entry.account.id)}`);
                      return;
                    }
                    router.push('/vendor-days?view=history');
                  }}
                  className="w-full rounded-2xl border border-[#d4d6dc] bg-white px-4 py-3 text-left transition hover:border-[#bfd0ff] hover:bg-[#f7f9ff]"
                >
                  <p className="text-[16px] font-semibold text-[#1d1f23]">{entry.account?.name ?? 'Unknown store'}</p>
                  <p className="mt-1 text-[14px] text-[#4f5661]">{entry.repName || entry.ambassadorName || 'Rep not assigned'}</p>
                  <p className="mt-2 text-[13px] uppercase tracking-wide text-[#8b9099]">
                    {formatTimeLabel(entry.eventDate)}
                    {entry.source === 'notion_archive' ? ' · archive' : ''}
                  </p>
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}
