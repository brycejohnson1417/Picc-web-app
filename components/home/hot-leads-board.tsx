'use client';

import Link from 'next/link';
import { useState } from 'react';

export type HomeHotLeadItem = {
  id: string;
  name: string;
  locationAddress: string | null;
  repNames: string[];
  lastSampleDate: string | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return 'No sample date logged';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No sample date logged';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function sortByLastSampleDate(left: HomeHotLeadItem, right: HomeHotLeadItem) {
  const leftTime = left.lastSampleDate ? new Date(left.lastSampleDate).getTime() : 0;
  const rightTime = right.lastSampleDate ? new Date(right.lastSampleDate).getTime() : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.name.localeCompare(right.name);
}

export function HotLeadsBoard({
  items,
  repFilterOptions,
}: {
  items: HomeHotLeadItem[];
  repFilterOptions: Array<{ value: string; label: string }>;
}) {
  const [selectedFilter, setSelectedFilter] = useState('all');

  const filteredItems =
    selectedFilter === 'all'
      ? items
      : items.filter((item) => item.repNames.includes(selectedFilter));

  const sortedItems = [...filteredItems].sort(sortByLastSampleDate);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#18212d]">Hot leads sorted by last delivery date</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#5c6674]">
            Most recent sample activity appears first so you can jump straight into the accounts that should convert next.
          </p>
        </div>

        <label className="grid gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a7583]">Rep Filter</span>
          <select
            value={selectedFilter}
            onChange={(event) => setSelectedFilter(event.target.value)}
            className="h-11 min-w-[220px] rounded-xl border border-[#d6dbe4] bg-white px-3 text-[14px] text-[#18212d]"
          >
            {repFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[20px] border border-[#d6dbe4] bg-[#f8fafc] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a7583]">Visible Hot Leads</p>
        <p className="mt-2 text-3xl font-semibold text-[#18212d]">{sortedItems.length}</p>
        <p className="mt-1 text-sm text-[#5c6674]">Click any card to open the account detail page directly.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {sortedItems.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[#d6dbe4] bg-white px-4 py-6 text-sm text-[#6b7280]">
            No hot leads match this rep filter.
          </div>
        ) : null}

        {sortedItems.map((item) => (
          <Link
            key={item.id}
            href={`/accounts?storeId=${encodeURIComponent(item.id)}`}
            className="block rounded-[18px] border border-[#dce2eb] bg-white p-4 transition hover:border-[#9db8f7] hover:bg-[#f6faff]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#18212d]">{item.name}</p>
                <p className="mt-1 truncate text-sm text-[#5c6674]">
                  {item.locationAddress || 'No address on file'}
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-[#fff4e8] px-3 py-1 text-xs font-semibold text-[#b45309]">
                Last sample {formatDate(item.lastSampleDate)}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#eef2f7] px-3 py-1 text-xs font-semibold text-[#304153]">
                Rep: {item.repNames.length > 0 ? item.repNames.join(', ') : 'Unassigned'}
              </span>
              <span className="rounded-full border border-[#f59e0b] bg-[#fff7e8] px-3 py-1 text-xs font-semibold text-[#b45309]">
                Hot Lead
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
