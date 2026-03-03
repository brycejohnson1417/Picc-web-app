'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MobileHeader } from '@/components/mobile/mobile-header';

const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function buildMonthRows(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];

  for (let i = 0; i < firstDay; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: Array<Array<number | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }
  return rows;
}

export function CalendarMobile() {
  const now = useMemo(() => new Date(), []);
  const [monthCursor, setMonthCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  const monthRows = useMemo(() => buildMonthRows(monthCursor.getFullYear(), monthCursor.getMonth()), [monthCursor]);
  const monthTitle = monthCursor.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  const isCurrentMonth = monthCursor.getFullYear() === now.getFullYear() && monthCursor.getMonth() === now.getMonth();

  function shiftMonth(delta: number) {
    setMonthCursor((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + delta);
      return new Date(next.getFullYear(), next.getMonth(), 1);
    });
  }

  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader
        title={monthTitle}
        left={
          <button type="button" onClick={() => shiftMonth(-1)} className="flex items-center gap-1 text-[22px]">
            <ChevronLeft className="h-8 w-8" />
            <span>Month</span>
          </button>
        }
        right={
          <button type="button" onClick={() => shiftMonth(1)} className="text-[22px]">
            <ChevronRight className="h-8 w-8" />
          </button>
        }
      />

      <div className="grid grid-cols-7 border-b border-[#c8c9cf] bg-[#efeff2] px-2 py-1 text-center text-[18px] text-[#232428]">
        {days.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {monthRows.map((row, rowIndex) => (
        <div key={`month-${rowIndex}`} className="grid grid-cols-7 border-b border-[#c8c9cf] px-3 py-4">
          {row.map((day, index) => {
            const isSelected =
              day !== null &&
              selectedDate.getFullYear() === monthCursor.getFullYear() &&
              selectedDate.getMonth() === monthCursor.getMonth() &&
              selectedDate.getDate() === day;
            const isToday = day === now.getDate() && isCurrentMonth;
            const isMuted = index === 0 || index === 6;
            return (
              <button
                key={`${rowIndex}-${index}`}
                type="button"
                onClick={() => {
                  if (day) {
                    setSelectedDate(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
                  }
                }}
                className={[
                  'mx-auto grid h-12 w-12 place-items-center rounded-full text-[22px]',
                  day === null ? 'opacity-0' : 'text-[#22242a]',
                  isSelected ? 'bg-black text-white' : '',
                  isToday && !isSelected ? 'bg-[#4c8fdf] text-white' : '',
                  isMuted && !isSelected ? 'text-[#8a8d94]' : '',
                ].join(' ')}
              >
                {day ?? 0}
              </button>
            );
          })}
        </div>
      ))}

      <div className="border-b border-[#c8c9cf] px-6 py-5 text-center text-[42px] font-medium text-[#25272d]">
        {selectedDate.toLocaleString('en-US', { month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}
