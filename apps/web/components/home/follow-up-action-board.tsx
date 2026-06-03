'use client';

import Link from 'next/link';
import { useState } from 'react';

export type HomeFollowUpItem = {
  id: string;
  name: string;
  locationAddress: string | null;
  repNames: string[];
  status: string;
  followUpDate: string | null;
  followUpReason: string | null;
  lastCheckIn: string | null;
  mine: boolean;
  authoredByViewer: boolean;
};

type RepFilterOption = {
  value: string;
  label: string;
};

function formatDate(value: string | null) {
  if (!value) {
    return 'No due date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'No check-ins yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No check-ins yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isOverdue(item: HomeFollowUpItem) {
  if (!item.followUpDate) {
    return false;
  }

  const due = new Date(item.followUpDate);
  if (Number.isNaN(due.getTime())) {
    return false;
  }

  return due < startOfToday();
}

function sortByUrgency(left: HomeFollowUpItem, right: HomeFollowUpItem) {
  const leftTime = left.followUpDate ? new Date(left.followUpDate).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.followUpDate ? new Date(right.followUpDate).getTime() : Number.POSITIVE_INFINITY;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.name.localeCompare(right.name);
}

function FollowUpList({
  title,
  description,
  items,
  emptyLabel,
}: {
  title: string;
  description: string;
  items: HomeFollowUpItem[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#dce2eb] bg-[#fbfcfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#18212d]">{title}</h3>
          <p className="mt-1 text-sm text-[#5c6674]">{description}</p>
        </div>
        <span className="rounded-full bg-[#eef2f7] px-3 py-1 text-xs font-semibold text-[#304153]">
          {items.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[#d6dbe4] bg-white px-4 py-6 text-sm text-[#6b7280]">
            {emptyLabel}
          </div>
        ) : null}

        {items.map((item) => (
          <Link
            key={item.id}
            href={`/accounts/${encodeURIComponent(item.id)}`}
            className="block rounded-[18px] border border-[#dce2eb] bg-white p-4 transition hover:border-[#9db8f7] hover:bg-[#f6faff]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#18212d]">{item.name}</p>
                <p className="mt-1 truncate text-sm text-[#5c6674]">
                  {item.locationAddress || 'No address on file'}
                </p>
              </div>
              <div className="shrink-0 rounded-full border border-[#e4c0b6] bg-[#fff4f0] px-3 py-1 text-xs font-semibold text-[#a53a20]">
                Due {formatDate(item.followUpDate)}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#eef2f7] px-3 py-1 text-xs font-semibold text-[#304153]">
                Rep: {item.repNames.length > 0 ? item.repNames.join(', ') : 'Unassigned'}
              </span>
              <span className="rounded-full bg-[#f4f6fb] px-3 py-1 text-xs font-semibold text-[#425066]">
                {item.status}
              </span>
              {item.authoredByViewer ? (
                <span className="rounded-full border border-[#18212d] bg-[#18212d] px-3 py-1 text-xs font-semibold text-white">
                  Logged by you
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 text-sm text-[#324255]">
              <p>
                <span className="font-semibold text-[#18212d]">Reason:</span>{' '}
                {item.followUpReason?.trim() || 'No follow-up reason logged'}
              </p>
              <p>
                <span className="font-semibold text-[#18212d]">Last check-in:</span>{' '}
                {formatDateTime(item.lastCheckIn)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FollowUpActionBoard({
  items,
  repFilterOptions,
  defaultFilter,
  viewerHasAdminOverride,
}: {
  items: HomeFollowUpItem[];
  repFilterOptions: RepFilterOption[];
  defaultFilter: string;
  viewerHasAdminOverride: boolean;
}) {
  const [selectedFilter, setSelectedFilter] = useState(defaultFilter);

  const filteredItems =
    selectedFilter === 'mine'
      ? items.filter((item) => item.mine)
      : selectedFilter === 'all'
        ? items
        : items.filter((item) => item.repNames.includes(selectedFilter));

  const overdueItems = filteredItems.filter(isOverdue).sort(sortByUrgency);
  const currentItems = filteredItems.filter((item) => !isOverdue(item)).sort(sortByUrgency);
  const dueDatedCurrentCount = currentItems.filter((item) => item.followUpDate).length;
  const undatedCount = currentItems.length - dueDatedCurrentCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#18212d]">Overdue and current follow-ups</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#5c6674]">
            Follow-ups are driven by the synced CRM properties for follow-up needed, follow-up date, and follow-up reason.
          </p>
          {viewerHasAdminOverride ? (
            <p className="mt-2 text-sm text-[#5c6674]">
              Your admin view also includes stores you personally checked into, even when another rep owns the account.
            </p>
          ) : null}
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-[20px] border border-[#ead0c7] bg-[#fff5f1] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9d4b34]">Overdue</p>
          <p className="mt-2 text-3xl font-semibold text-[#7f2812]">{overdueItems.length}</p>
          <p className="mt-1 text-sm text-[#8a4d3c]">Past due and still marked as needing follow-up.</p>
        </div>
        <div className="rounded-[20px] border border-[#d6dbe4] bg-[#f8fafc] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5a6676]">Current Needed</p>
          <p className="mt-2 text-3xl font-semibold text-[#18212d]">{currentItems.length}</p>
          <p className="mt-1 text-sm text-[#5c6674]">Open follow-ups that are due today, upcoming, or still unscheduled.</p>
        </div>
        <div className="rounded-[20px] border border-[#d6dbe4] bg-[#f8fafc] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5a6676]">Undated</p>
          <p className="mt-2 text-3xl font-semibold text-[#18212d]">{undatedCount}</p>
          <p className="mt-1 text-sm text-[#5c6674]">Stores that still need follow-up but do not have a due date yet.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FollowUpList
          title="Overdue Follow-Ups"
          description="Start here first. These stores are already past the follow-up date."
          items={overdueItems}
          emptyLabel="No overdue follow-ups for this filter."
        />
        <FollowUpList
          title="Current Follow-Ups Needed"
          description="These stores still need attention and are either due now, upcoming, or missing a date."
          items={currentItems}
          emptyLabel="No current follow-ups needed for this filter."
        />
      </div>
    </div>
  );
}
