'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { PinColorMode } from '@/lib/territory/pin-colors';
import type { TerritoryFilterCount } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

interface StoreFilterSheetProps {
  open: boolean;
  onClose: () => void;
  statuses: TerritoryFilterCount[];
  reps: TerritoryFilterCount[];
  referralSources: TerritoryFilterCount[];
  vendorDayStatuses: TerritoryFilterCount[];
  locationAvailabilityOptions: TerritoryFilterCount[];
  selectedStatuses: string[];
  selectedReps: string[];
  selectedReferralSources: string[];
  includeNoReferralSource: boolean;
  selectedVendorDayStatuses: string[];
  locationAvailability: 'all' | 'available' | 'unavailable';
  hasSampleOrderDate: boolean;
  noLastSampleDeliveryDate: boolean;
  sampleAccountTypeFilter: 'all' | 'customers' | 'non_customers';
  lastOrderDateFilter: 'all' | 'last_month' | 'last_2_months' | 'three_plus_months';
  onToggleStatus: (value: string) => void;
  onToggleRep: (value: string) => void;
  onToggleReferralSource: (value: string) => void;
  onSetIncludeNoReferralSource: (value: boolean) => void;
  onToggleVendorDayStatus: (value: string) => void;
  onSetLocationAvailability: (value: 'all' | 'available' | 'unavailable') => void;
  onSetHasSampleOrderDate: (value: boolean) => void;
  onSetNoLastSampleDeliveryDate: (value: boolean) => void;
  onSetSampleAccountTypeFilter: (value: 'all' | 'customers' | 'non_customers') => void;
  onSetLastOrderDateFilter: (value: 'all' | 'last_month' | 'last_2_months' | 'three_plus_months') => void;
  pinColorMode: PinColorMode;
  onSetPinColorMode: (mode: PinColorMode) => void;
  onApply: () => void;
  onSaveSelection: () => void;
  onClearAll: () => void;
  savedFiltersLabel?: string | null;
}

export function StoreFilterSheet({
  open,
  onClose,
  statuses,
  reps,
  referralSources,
  vendorDayStatuses,
  locationAvailabilityOptions,
  selectedStatuses,
  selectedReps,
  selectedReferralSources,
  includeNoReferralSource,
  selectedVendorDayStatuses,
  locationAvailability,
  hasSampleOrderDate,
  noLastSampleDeliveryDate,
  sampleAccountTypeFilter,
  lastOrderDateFilter,
  onToggleStatus,
  onToggleRep,
  onToggleReferralSource,
  onSetIncludeNoReferralSource,
  onToggleVendorDayStatus,
  onSetLocationAvailability,
  onSetHasSampleOrderDate,
  onSetNoLastSampleDeliveryDate,
  onSetSampleAccountTypeFilter,
  onSetLastOrderDateFilter,
  pinColorMode,
  onSetPinColorMode,
  onApply,
  onSaveSelection,
  onClearAll,
  savedFiltersLabel = null,
}: StoreFilterSheetProps) {
  const [referralSearch, setReferralSearch] = useState('');

  if (!open) {
    return null;
  }

  const activeFilters =
    selectedStatuses.length +
    selectedReps.length +
    selectedReferralSources.length +
    (includeNoReferralSource ? 1 : 0) +
    selectedVendorDayStatuses.length +
    (locationAvailability === 'all' ? 0 : 1) +
    (hasSampleOrderDate ? 1 : 0) +
    (noLastSampleDeliveryDate ? 1 : 0) +
    (sampleAccountTypeFilter === 'all' ? 0 : 1) +
    (lastOrderDateFilter === 'all' ? 0 : 1);
  const hasActiveFilters = activeFilters > 0;

  return (
    <div className="fixed inset-0 z-[5400] bg-black/35">
      <div className="mx-auto flex h-full max-w-[var(--app-shell-max)] flex-col bg-[#e6e6e9]">
        <div className="flex items-center justify-between border-b border-[#c8c9cf] bg-[#c93412] px-4 py-3 text-white">
          <h2 className="text-[17px] font-semibold">Filters & Visualization</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/10" aria-label="Close filters">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="mb-4 rounded-xl border border-[#c7c9cf] bg-white p-3">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Pin Colors</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  'rounded-lg border px-3 py-2 text-[13px] font-medium',
                  pinColorMode === 'status' ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                )}
                onClick={() => onSetPinColorMode('status')}
              >
                By Status
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg border px-3 py-2 text-[13px] font-medium',
                  pinColorMode === 'rep' ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                )}
                onClick={() => onSetPinColorMode('rep')}
              >
                By Rep
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[#72757d]">Filter results are still applied. This only changes pin coloring.</p>
          </section>

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
          <SearchableFilterSection
            title="Referral Source"
            searchValue={referralSearch}
            onSearchChange={setReferralSearch}
            options={referralSources.map((entry) => ({ label: entry.value, value: entry.value, count: entry.count }))}
            selected={selectedReferralSources}
            onToggle={onToggleReferralSource}
            emptyLabel="No referral sources yet."
          />
          <section className="mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSetIncludeNoReferralSource(!includeNoReferralSource)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                  includeNoReferralSource ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                )}
              >
                No referral source
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[#72757d]">Use this to show stores where the CRM referral source is blank.</p>
          </section>
          <FilterSection
            title="Vendor Day Status"
            options={vendorDayStatuses.map((entry) => ({ label: entry.value, value: entry.value, count: entry.count }))}
            selected={selectedVendorDayStatuses}
            onToggle={onToggleVendorDayStatus}
          />

          <section className="mb-4">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Location Availability</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'All locations' },
                { value: 'available', label: 'Available location' },
                { value: 'unavailable', label: 'Unavailable location' },
              ].map((option) => {
                const count = locationAvailabilityOptions.find((item) => item.value.toLowerCase() === option.label.toLowerCase())?.count ?? 0;
                const active = locationAvailability === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSetLocationAvailability(option.value as 'all' | 'available' | 'unavailable')}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                      active ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                    )}
                  >
                    {option.label} <span className={cn(active ? 'text-white/80' : 'text-[#7f828b]')}>({count})</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Sample Orders</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSetHasSampleOrderDate(!hasSampleOrderDate)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                  hasSampleOrderDate ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                )}
              >
                Has sample order date
              </button>
              <button
                type="button"
                onClick={() => onSetNoLastSampleDeliveryDate(!noLastSampleDeliveryDate)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                  noLastSampleDeliveryDate ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                )}
              >
                No last sample delivery date
              </button>
              {[
                { value: 'customers', label: 'Sampled customers' },
                { value: 'non_customers', label: 'Sampled non-customers' },
              ].map((option) => {
                const active = sampleAccountTypeFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onSetSampleAccountTypeFilter(
                        (active ? 'all' : option.value) as 'all' | 'customers' | 'non_customers',
                      )
                    }
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                      active ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-[#72757d]">Sampled non-customers excludes Customer and Customer Overdue.</p>
          </section>

          <section className="mb-4">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Last Order Date</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'last_month', label: 'Ordered in last month' },
                { value: 'last_2_months', label: 'Ordered in last 2 months' },
                { value: 'three_plus_months', label: 'Ordered 3+ months ago' },
              ].map((option) => {
                const active = lastOrderDateFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onSetLastOrderDateFilter(
                        (active ? 'all' : option.value) as 'all' | 'last_month' | 'last_2_months' | 'three_plus_months',
                      )
                    }
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] font-medium',
                      active ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="border-t border-[#c8c9cf] bg-[#f2f2f5] px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg border border-[#c6c7cc] bg-white px-2 py-2 text-[13px] font-medium text-[#3e4046]"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={onSaveSelection}
              className="rounded-lg border border-[#b95b45] bg-[#f8ede9] px-2 py-2 text-[13px] font-semibold text-[#9d2f12]"
            >
              Save Filters
            </button>
            <button type="button" onClick={onApply} className="rounded-lg bg-[#cd3814] px-2 py-2 text-[13px] font-semibold text-white">
              {hasActiveFilters ? `Apply (${activeFilters})` : 'Apply'}
            </button>
          </div>
          {savedFiltersLabel ? <p className="mt-2 text-center text-[12px] text-[#6d7078]">Saved filters: {savedFiltersLabel}</p> : null}
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

function SearchableFilterSection({
  title,
  searchValue,
  onSearchChange,
  options,
  selected,
  onToggle,
  emptyLabel,
}: {
  title: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  options: Array<{ label: string; value: string; count: number }>;
  selected: string[];
  onToggle: (value: string) => void;
  emptyLabel: string;
}) {
  const filteredOptions = useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    if (!needle) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, searchValue]);

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">{title}</h3>
        <p className="text-[12px] text-[#7b7e87]">
          {selected.length > 0 ? `${selected.length} selected` : 'Optional'}
        </p>
      </div>
      <input
        type="search"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search referral sources"
        className="mb-3 h-10 w-full rounded-lg border border-[#c3c5cb] bg-white px-3 text-[13px] text-[#2f3640] outline-none placeholder:text-[#8a8d95] focus:border-[#cd3814]"
      />
      <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-[#d7d8dd] bg-[#f7f7f9] p-2">
        {filteredOptions.length === 0 ? <p className="px-2 py-1 text-[13px] text-[#7b7e87]">{emptyLabel}</p> : null}
        {filteredOptions.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] font-medium',
                active ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#cfd2d8] bg-white text-[#42454c]',
              )}
            >
              <span className="pr-3">{option.label}</span>
              <span className={cn('shrink-0 text-[12px]', active ? 'text-white/80' : 'text-[#7f828b]')}>{option.count}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-[#72757d]">Leave this empty to show all referral sources.</p>
    </section>
  );
}
