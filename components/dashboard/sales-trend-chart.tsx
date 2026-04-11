'use client';

import { useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProcessedNabisOrder } from '@/lib/dashboard/nabis-types';
import { formatCurrency, toDateKey } from '@/lib/dashboard/nabis-client';

type ViewMode = 'daily' | 'weekly';

export function SalesTrendChart({
  orders,
  selectedMonth,
}: {
  orders: ProcessedNabisOrder[];
  selectedMonth: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const chartData = useMemo(() => {
    if (!selectedMonth) {
      return [];
    }

    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (viewMode === 'daily') {
      const dataMap = new Map<string, number>();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dataMap.set(dateKey, 0);
      }

      for (const order of orders) {
        if (order.isCanceled) continue;
        const dateKey = toDateKey(order.createdDate);
        if (dataMap.has(dateKey)) {
          dataMap.set(dateKey, (dataMap.get(dateKey) || 0) + order.total);
        }
      }

      return [...dataMap.entries()].map(([date, total]) => ({
        date,
        label: new Date(`${date}T12:00:00`).getDate().toString(),
        fullDate: new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        total,
      }));
    }

    const weeksMap = new Map<string, number>();
    const getWeekStart = (date: Date) => {
      const next = new Date(date);
      const day = next.getDay();
      next.setDate(next.getDate() - day);
      return toDateKey(next);
    };

    const current = new Date(year, month, 1);
    const end = new Date(year, month, daysInMonth);
    while (current <= end) {
      const weekStart = getWeekStart(current);
      if (!weeksMap.has(weekStart)) {
        weeksMap.set(weekStart, 0);
      }
      current.setDate(current.getDate() + 1);
    }

    for (const order of orders) {
      if (order.isCanceled) continue;
      const weekStart = getWeekStart(order.createdDate);
      weeksMap.set(weekStart, (weeksMap.get(weekStart) || 0) + order.total);
    }

    return [...weeksMap.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, total]) => {
        const start = new Date(`${date}T12:00:00`);
        const endDate = new Date(start);
        endDate.setDate(start.getDate() + 6);
        return {
          date,
          label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: `Week of ${start.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
          })} - ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
          total,
        };
      });
  }, [orders, selectedMonth, viewMode]);

  return (
    <div id="sales-trend-section" className="rounded-[24px] border border-[#dfe3ea] bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-[#edf4ff] p-2">
            <BarChart2 className="h-5 w-5 text-[#1d5eea]" />
          </div>
          <h2 className="text-lg font-semibold text-[#18212d]">Sales Trend ({viewMode === 'daily' ? 'Daily' : 'Weekly'})</h2>
        </div>

        <div className="inline-flex rounded-xl bg-[#f3f5f8] p-1">
          {(['daily', 'weekly'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={mode === viewMode ? 'rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-[#1d5eea] shadow-sm' : 'rounded-lg px-3 py-1.5 text-sm font-medium text-[#6c7480]'}
            >
              {mode === 'daily' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nabis-sales-trend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1d5eea" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#1d5eea" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} minTickGap={30} />
            <YAxis tickFormatter={(value) => `$${value / 1000}k`} stroke="#64748b" fontSize={12} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)' }}
              labelFormatter={(label, payload) => {
                if (payload && payload.length > 0) {
                  return payload[0].payload.fullDate as string;
                }
                return label;
              }}
              formatter={(value: number) => [formatCurrency(value), 'Revenue']}
            />
            <Area type="monotone" dataKey="total" stroke="#1d5eea" strokeWidth={3} fillOpacity={1} fill="url(#nabis-sales-trend)" activeDot={{ r: 6, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
