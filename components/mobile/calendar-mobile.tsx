'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MobileHeader } from '@/components/mobile/mobile-header';

interface VendorDayRow {
  id: string;
  eventDate: string;
  repName?: string | null;
  ambassadorName?: string | null;
  notes?: string | null;
  account?: {
    id: string;
    name: string;
  };
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthGrid(month: Date) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const startDay = first.getDay();
  const rows: Array<Array<Date | null>> = [];
  let cursor = 1 - startDay;

  while (cursor <= last.getDate()) {
    const row: Array<Date | null> = [];
    for (let i = 0; i < 7; i += 1) {
      if (cursor < 1 || cursor > last.getDate()) {
        row.push(null);
      } else {
        row.push(new Date(month.getFullYear(), month.getMonth(), cursor));
      }
      cursor += 1;
    }
    rows.push(row);
  }

  return rows;
}

export function CalendarMobile() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));

  const eventsQuery = useQuery({
    queryKey: ['mobile-vendor-days'],
    queryFn: async () => {
      const response = await fetch('/api/workflows/vendor-days');
      if (!response.ok) {
        throw new Error('Failed to load vendor day calendar');
      }
      return (await response.json()) as VendorDayRow[];
    },
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, VendorDayRow[]>();
    for (const event of eventsQuery.data ?? []) {
      const dayKey = event.eventDate.slice(0, 10);
      const list = map.get(dayKey) ?? [];
      list.push(event);
      map.set(dayKey, list);
    }
    return map;
  }, [eventsQuery.data]);

  const rows = useMemo(() => monthGrid(month), [month]);
  const selectedEvents = eventsByDay.get(selectedDate) ?? [];

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[#e6e6e9]">
      <MobileHeader
        title={month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        left={
          <button
            type="button"
            className="grid h-9 w-9 place-items-center"
            onClick={() => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        }
        right={
          <button
            type="button"
            className="grid h-9 w-9 place-items-center"
            onClick={() => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        }
      />

      <div className="grid grid-cols-7 border-b border-[#c8c9cf] bg-[#efeff2] px-2 py-1 text-center text-[12px] font-medium text-[#232428]">
        {DAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {rows.map((row, rowIndex) => (
        <div key={`month-row-${rowIndex}`} className="grid grid-cols-7 border-b border-[#c8c9cf] px-2 py-1.5">
          {row.map((date, index) => {
            const key = date ? formatDateKey(date) : `empty-${rowIndex}-${index}`;
            const isSelected = date ? key === selectedDate : false;
            const isToday = date ? key === formatDateKey(new Date()) : false;
            const count = date ? eventsByDay.get(key)?.length ?? 0 : 0;

            return (
              <button
                key={key}
                type="button"
                disabled={!date}
                onClick={() => date && setSelectedDate(formatDateKey(date))}
                className="mx-auto my-0.5 flex h-10 w-10 flex-col items-center justify-center rounded-full text-[13px] text-[#22242a] disabled:opacity-0"
              >
                <span className={isSelected ? 'grid h-7 w-7 place-items-center rounded-full bg-black text-white' : isToday ? 'grid h-7 w-7 place-items-center rounded-full bg-[#4c8fdf] text-white' : ''}>
                  {date?.getDate()}
                </span>
                {count > 0 ? <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#cd3814]" /> : <span className="mt-0.5 h-1.5 w-1.5" />}
              </button>
            );
          })}
        </div>
      ))}

      <div className="border-t border-[#c8c9cf] px-4 py-3">
        <h3 className="text-[13px] font-semibold text-[#5b5f67]">Vendor Day Calendar · {selectedDate}</h3>
        {eventsQuery.isLoading ? <p className="mt-2 text-[13px] text-[#7a7d84]">Loading events...</p> : null}
        {!eventsQuery.isLoading && selectedEvents.length === 0 ? <p className="mt-2 text-[13px] text-[#7a7d84]">No vendor day events on this date.</p> : null}
        <div className="mt-2 space-y-2 pb-24">
          {selectedEvents.map((event) => (
            <div key={event.id} className="rounded-lg border border-[#c8c9cf] bg-white px-3 py-2">
              <p className="text-[14px] font-semibold text-[#22242a]">{event.account?.name ?? 'Unlinked account'}</p>
              <p className="text-[12px] text-[#6f737b]">
                {new Date(event.eventDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Rep: {event.repName ?? 'Unassigned'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
