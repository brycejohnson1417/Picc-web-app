'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MobileHeader } from '@/components/mobile/mobile-header';

const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const monthRows = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 31, null, null, null, null],
];

const aprilRows = [
  [null, null, null, 1, 2, 3, 4],
  [5, 6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17, 18],
];

export function CalendarMobile() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader
        title="March - 2026"
        left={
          <button type="button" onClick={() => router.back()} className="flex items-center gap-1 text-[22px]">
            <ChevronLeft className="h-8 w-8" />
            <span>Calendar</span>
          </button>
        }
      />

      <div className="grid grid-cols-7 border-b border-[#c8c9cf] bg-[#efeff2] px-2 py-1 text-center text-[18px] text-[#232428]">
        {days.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="border-b border-[#c8c9cf] px-6 py-5">
        <span className="text-[42px] font-semibold text-[#cc2f20]">MAR</span>
      </div>

      {monthRows.map((row, rowIndex) => (
        <div key={`mar-${rowIndex}`} className="grid grid-cols-7 border-b border-[#c8c9cf] px-3 py-4">
          {row.map((day, index) => {
            const isSelectedBlack = day === 2;
            const isSelectedBlue = day === 3;
            return (
              <span
                key={`${rowIndex}-${index}`}
                className={[
                  'mx-auto grid h-12 w-12 place-items-center rounded-full text-[22px]',
                  day === null ? 'opacity-0' : 'text-[#22242a]',
                  isSelectedBlack ? 'bg-black text-white' : '',
                  isSelectedBlue ? 'bg-[#4c8fdf] text-white' : '',
                  day === 1 || day === 7 || day === 8 || day === 14 || day === 15 || day === 21 || day === 22 || day === 28 || day === 29
                    ? 'text-[#8a8d94]'
                    : '',
                ].join(' ')}
              >
                {day ?? 0}
              </span>
            );
          })}
        </div>
      ))}

      <div className="border-b border-[#c8c9cf] px-6 py-5 text-center text-[42px] font-medium text-[#25272d]">APR</div>

      {aprilRows.map((row, rowIndex) => (
        <div key={`apr-${rowIndex}`} className="grid grid-cols-7 border-b border-[#c8c9cf] px-3 py-4">
          {row.map((day, index) => (
            <span
              key={`apr-${rowIndex}-${index}`}
              className={[
                'mx-auto grid h-12 w-12 place-items-center rounded-full text-[22px]',
                day === null ? 'opacity-0' : 'text-[#22242a]',
                day === 4 || day === 5 || day === 11 || day === 12 || day === 18 ? 'text-[#8a8d94]' : '',
              ].join(' ')}
            >
              {day ?? 0}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
