'use client';

import { X } from 'lucide-react';
import type { TerritoryFilterCount } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

interface StoreFilterSheetProps {
  open: boolean;
  onClose: () => void;
  statuses: TerritoryFilterCount[];
  reps: TerritoryFilterCount[];
  selectedStatuses: string[];
  selectedReps: string[];
  onToggleStatus: (value: string) => void;
  onToggleRep: (value: string) => void;
  onReset: () => void;
}

export function StoreFilterSheet({
  open,
  onClose,
  statuses,
  reps,
  selectedStatuses,
  selectedReps,
  onToggleStatus,
  onToggleRep,
  onReset,
}: StoreFilterSheetProps) {
  if (!open) {
    return null;
  }

  const activeFilters = selectedStatuses.length + selectedReps.length;
  const hasActiveFilters = activeFilters > 0;

  return (
    <div className="fixed inset-0 z-[5400] bg-black/35">
      <div className="mx-auto flex h-full max-w-[480px] flex-col bg-[#e6e6e9]">
        <div className="flex items-center justify-between border-b border-[#c8c9cf] bg-[#c93412] px-4 py-3 text-white">
          <h2 className="text-[17px] font-semibold">Filters</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/10" aria-label="Close filters">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <FilterSection
            title="Account Status"
            options={statuses.map((entry) => ({ label: entry.value, value: entry.value, count: entry.count }))}
            selected={selectedStatuses}
            onToggle={onToggleStatus}
          />
          <FilterSection
            title="Sales Rep"
            options={reps.map((entry) => ({ label: entry.value, value: entry.value, count: entry.count }))}
            selected={selectedReps}
            onToggle={onToggleRep}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[#c8c9cf] bg-[#f2f2f5] px-4 py-3">
          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="rounded-lg border border-[#c6c7cc] bg-white px-3 py-2 text-[14px] font-medium text-[#3e4046] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-[#cd3814] px-3 py-2 text-[14px] font-semibold text-white">
            {hasActiveFilters ? `Apply (${activeFilters})` : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ label: string; value: string; count: number }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {options.length === 0 ? <p className="text-[13px] text-[#7b7e87]">No options yet.</p> : null}
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                active ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
              )}
            >
              {option.label} <span className={cn(active ? 'text-white/80' : 'text-[#7f828b]')}>({option.count})</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
