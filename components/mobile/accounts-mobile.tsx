'use client';

import { AlertTriangle, Filter, Loader2, MapPin, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { NotionOptionChip } from '@/components/shared/notion-option-chip';
import { DataFreshnessBanner } from '@/components/shared/data-freshness';
import { buildTerritoryFreshness } from '@/lib/runtime/account-contact-contract';
import type { PreferredPartnerFilter } from '@/lib/territory/preferred-partner';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import type { TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';

function firstLetter(name: string) {
  const normalized = String(name ?? '').trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

export function AccountsMobile() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'recent' | 'follow-ups'>('all');
  const [repFilter, setRepFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pppStatusFilter, setPppStatusFilter] = useState('all');
  const [headsetConnectionFilter, setHeadsetConnectionFilter] = useState('all');
  const [preferredPartnerFilter, setPreferredPartnerFilter] = useState<PreferredPartnerFilter>('all');
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const unresolvedRouteStoreIdRef = useRef<string | null>(null);
  const routePlan = useRoutePlan();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const storesQuery = useQuery({
    queryKey: ['accounts-mobile', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      const response = await fetch(`/api/territory/stores?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load stores');
      }
      return (await response.json()) as TerritoryStoresResponse;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const allStores = useMemo(() => storesQuery.data?.stores ?? [], [storesQuery.data?.stores]);
  const accountFreshness = useMemo(
    () => (storesQuery.data ? buildTerritoryFreshness(storesQuery.data.meta) : null),
    [storesQuery.data],
  );
  const filterOptions = storesQuery.data?.filters;
  const stores = useMemo(() => {
    const source = allStores;
    const scoped = scope === 'all'
      ? source
      : scope === 'recent'
        ? source.filter((store) => {
        const editedAt = Date.parse(store.lastEditedTime);
        return Number.isFinite(editedAt) && Date.now() - editedAt < 1000 * 60 * 60 * 24 * 7;
          })
        : source.filter((store) => {
            const dueDate = store.followUpDate ? Date.parse(store.followUpDate) : Number.NaN;
            const dueNow = Number.isFinite(dueDate) ? dueDate <= Date.now() : true;
            const followUpFlag = typeof store.followUpNeeded === 'boolean' ? store.followUpNeeded : /lead|proposal|in progress/i.test(store.status);
            return Boolean(followUpFlag && dueNow);
          });

    return scoped.filter((store) => {
      if (repFilter !== 'all' && !store.repNames.includes(repFilter)) return false;
      if (statusFilter !== 'all' && store.status !== statusFilter) return false;
      if (pppStatusFilter !== 'all' && (store.pppStatus ?? '') !== pppStatusFilter) return false;
      if (headsetConnectionFilter !== 'all' && (store.headsetConnectionStatus ?? '') !== headsetConnectionFilter) return false;
      if (preferredPartnerFilter === 'preferred' && !store.isPreferredPartner) return false;
      if (preferredPartnerFilter === 'not_preferred' && store.isPreferredPartner) return false;
      return true;
    });
  }, [allStores, headsetConnectionFilter, pppStatusFilter, preferredPartnerFilter, repFilter, scope, statusFilter]);

  const allStoreById = useMemo(() => new Map(allStores.map((store) => [store.id, store])), [allStores]);
  const routeStoreId = searchParams.get('storeId');
  const activeDetailStoreId = detailStoreId ?? routeStoreId;

  useEffect(() => {
    if (!routeStoreId) return;

    setScope('all');
    if (allStoreById.has(routeStoreId)) {
      setDetailStoreId(routeStoreId);
      unresolvedRouteStoreIdRef.current = null;
      return;
    }

    if (allStores.length > 0 && unresolvedRouteStoreIdRef.current !== routeStoreId) {
      toast.error('Selected route account was not found in accounts list.');
      unresolvedRouteStoreIdRef.current = routeStoreId;
    }
  }, [allStoreById, allStores.length, routeStoreId]);

  const grouped = useMemo(() => {
    const groups = new Map<string, TerritoryStorePin[]>();
    for (const store of stores) {
      const letter = firstLetter(store.name);
      const list = groups.get(letter) ?? [];
      list.push(store);
      groups.set(letter, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stores]);
  const hasActiveFilters =
    repFilter !== 'all' ||
    statusFilter !== 'all' ||
    pppStatusFilter !== 'all' ||
    headsetConnectionFilter !== 'all' ||
    preferredPartnerFilter !== 'all';
  const activeFilterCount = [repFilter, statusFilter, pppStatusFilter, headsetConnectionFilter, preferredPartnerFilter].filter((value) => value !== 'all').length;
  const searching = search.trim() !== debouncedSearch;
  const resultLabel = storesQuery.isFetching && !storesQuery.data
    ? 'Loading accounts...'
    : `${stores.length.toLocaleString()} ${stores.length === 1 ? 'account' : 'accounts'}`;

  function clearFilters() {
    setRepFilter('all');
    setStatusFilter('all');
    setPppStatusFilter('all');
    setHeadsetConnectionFilter('all');
    setPreferredPartnerFilter('all');
  }

  if (storesQuery.isLoading && !storesQuery.data) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] items-center justify-center bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)]">
        <Loader2 className="h-8 w-8 animate-spin text-[#5f636d]" />
      </div>
    );
  }

  if (storesQuery.isError && !storesQuery.data) {
    return (
      <div className="min-h-[calc(100dvh-92px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)] px-5 py-8">
        <div className="rounded-xl border border-[#e0b4ab] bg-[#fbe8e4] p-4 text-[#8f2410]">
          <div className="mb-2 flex items-center gap-2 text-[18px] font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Accounts failed to load
          </div>
          <p className="text-[14px]">
            {storesQuery.error instanceof Error
              ? storesQuery.error.message
              : 'Unable to fetch live account data.'}
          </p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#ce6f5c] bg-white px-3 py-2 text-[14px] font-medium text-[#8f2410]"
            onClick={() => {
              void storesQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-92px)] bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f7_100%)]">
      <MobileHeader
        title="Accounts"
        right={null}
      >
        <SegmentedControl
          value={scope}
          onChange={(value) => setScope(value as 'all' | 'recent' | 'follow-ups')}
          options={[
            { value: 'all', label: 'All' },
            { value: 'recent', label: 'Recent' },
            { value: 'follow-ups', label: 'Follow-Ups' },
          ]}
        />
      </MobileHeader>

      <div className="mx-auto max-w-[var(--app-shell-max)] px-4 pb-28 pt-4 md:px-5 lg:px-6">
        <div className="sticky top-0 z-20 -mx-4 border-b border-[#dce2eb] bg-[#f7f9fc]/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-5 md:px-5 lg:-mx-6 lg:px-6">
          <div className="grid grid-cols-[minmax(0,1fr)_48px] gap-2">
            <MobileSearch value={search} onChange={setSearch} placeholder="Search Accounts" />
            <button
              type="button"
              className="relative grid h-12 w-12 place-items-center rounded-xl border border-[#d6dce7] bg-white text-[#243041] shadow-sm active:scale-[0.98]"
              onClick={() => setShowFilters(true)}
              aria-label="Open account filters"
            >
              <SlidersHorizontal className="h-5 w-5" />
              {activeFilterCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#c93412] px-1 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 text-[14px] font-semibold text-[#303947]">
              {searching || storesQuery.isFetching ? 'Refreshing...' : resultLabel}
              {debouncedSearch ? <span className="font-medium text-[#737d8c]"> for &quot;{debouncedSearch}&quot;</span> : null}
            </p>
            {hasActiveFilters ? (
              <button type="button" className="shrink-0 text-[13px] font-semibold text-[#c93412]" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <ScopeChip label={scope === 'all' ? 'All accounts' : scope === 'recent' ? 'Recent' : 'Follow-ups'} active />
            {repFilter !== 'all' ? <ScopeChip label={repFilter} onClear={() => setRepFilter('all')} /> : null}
            {statusFilter !== 'all' ? <ScopeChip label={statusFilter} onClear={() => setStatusFilter('all')} /> : null}
            {pppStatusFilter !== 'all' ? <ScopeChip label={`PPP: ${pppStatusFilter}`} onClear={() => setPppStatusFilter('all')} /> : null}
            {headsetConnectionFilter !== 'all' ? <ScopeChip label={`Headset: ${headsetConnectionFilter}`} onClear={() => setHeadsetConnectionFilter('all')} /> : null}
            {preferredPartnerFilter !== 'all' ? (
              <ScopeChip label={preferredPartnerFilter === 'preferred' ? 'Preferred Partner' : 'Not Preferred'} onClear={() => setPreferredPartnerFilter('all')} />
            ) : null}
          </div>
        </div>

        <div className="pt-3">
          {storesQuery.isError ? (
            <div className="mt-3 rounded-lg border border-[#e6b3a7] bg-[#fdebe7] px-3 py-2 text-[13px] text-[#8f2410]">
              Live sync warning: {storesQuery.error instanceof Error ? storesQuery.error.message : 'Failed to refresh accounts'}
            </div>
          ) : null}

          {accountFreshness ? (
            <DataFreshnessBanner
              freshness={{
                ...accountFreshness,
                syncing: accountFreshness.syncing || storesQuery.isFetching,
                state: storesQuery.isFetching && accountFreshness.state === 'fresh' ? 'syncing' : accountFreshness.state,
                detail:
                  storesQuery.isFetching && accountFreshness.state === 'fresh'
                    ? 'Refreshing account data in the background.'
                    : accountFreshness.detail,
              }}
              compact
              className="mt-3"
              action={
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-current/20 bg-white/70 px-3 text-[12px] font-semibold"
                  onClick={() => {
                    void storesQuery.refetch();
                  }}
                  disabled={storesQuery.isFetching}
                >
                  <RefreshCw className={storesQuery.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                  Refresh
                </button>
              }
            />
          ) : null}

          {grouped.length === 0 ? (
            <div className="mt-3 rounded-xl border border-[#d8dde7] bg-white p-5 text-center">
              <p className="text-[19px] font-semibold text-[#252933]">
                {debouncedSearch || hasActiveFilters ? 'No accounts match this view.' : 'No accounts available yet.'}
              </p>
              <p className="mt-2 text-[14px] leading-5 text-[#68707d]">
                {debouncedSearch || hasActiveFilters
                  ? 'Clear the search or filters to get back to the full account list.'
                  : 'Account data will appear here after the territory cache syncs.'}
              </p>
              {debouncedSearch || hasActiveFilters ? (
                <button
                  type="button"
                  className="mt-4 rounded-lg bg-[#276fd3] px-4 py-2 text-[14px] font-semibold text-white"
                  onClick={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    clearFilters();
                  }}
                >
                  Clear view
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-4">
            {grouped.map(([letter, list]) => (
              <section
                key={letter}
                ref={(element) => {
                  sectionRefs.current[letter] = element;
                }}
              >
                <div className="sticky top-[134px] z-10 border-b border-[#dce2eb] bg-[#eef2f7]/95 px-1 py-1 text-[18px] font-semibold text-[#6a7583] backdrop-blur">{letter}</div>
                <div className="mt-2 space-y-2">
                  {list.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => setDetailStoreId(store.id)}
                      className="w-full rounded-xl border border-[#e0e4eb] bg-white px-4 py-3 text-left shadow-[0_8px_24px_rgba(24,33,45,0.05)] transition hover:border-[#9db8f7] hover:bg-[#f5f9ff] active:scale-[0.995]"
                    >
                      <p className="truncate text-[20px] font-semibold text-[#15171c]">{store.name}</p>
                      <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-[14px] text-[#6b7280]">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{store.locationAddress ?? store.locationLabel ?? 'No address'}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#eef3fb] px-2.5 py-1 text-[12px] font-semibold text-[#304153]">
                          Rep: {store.repNames.length > 0 ? store.repNames.join(', ') : 'Unassigned'}
                        </span>
                        <NotionOptionChip
                          label={store.status || 'Status unknown'}
                          colorName={store.statusColorName}
                          fallbackHex={store.statusColor || '#5f6b7a'}
                        />
                        {store.isPreferredPartner ? (
                          <span className="rounded-full border border-black bg-black px-3 py-1 text-[12px] font-semibold text-white">
                            Preferred
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      {grouped.length > 0 ? <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} /> : null}

      {showFilters ? (
        <AccountFiltersSheet
          filterOptions={filterOptions}
          repFilter={repFilter}
          statusFilter={statusFilter}
          pppStatusFilter={pppStatusFilter}
          headsetConnectionFilter={headsetConnectionFilter}
          preferredPartnerFilter={preferredPartnerFilter}
          activeFilterCount={activeFilterCount}
          resultCount={stores.length}
          onRepFilterChange={setRepFilter}
          onStatusFilterChange={setStatusFilter}
          onPppStatusFilterChange={setPppStatusFilter}
          onHeadsetConnectionFilterChange={setHeadsetConnectionFilter}
          onPreferredPartnerFilterChange={(value) => setPreferredPartnerFilter(value as PreferredPartnerFilter)}
          onClear={clearFilters}
          onClose={() => setShowFilters(false)}
        />
      ) : null}

      <AccountDetailSheet
        store={activeDetailStoreId ? allStoreById.get(activeDetailStoreId) ?? null : null}
        accountFreshness={accountFreshness}
        onClose={() => {
          setDetailStoreId(null);
          if (searchParams.get('storeId')) {
            router.replace('/accounts');
          }
        }}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={activeDetailStoreId ? routePlan.selectedStopIds.includes(activeDetailStoreId) : false}
      />
    </div>
  );
}

function ScopeChip({ label, active = false, onClear }: { label: string; active?: boolean; onClear?: () => void }) {
  return (
    <span
      className={[
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold',
        active ? 'border-[#cdd7e6] bg-white text-[#303947]' : 'border-[#d8dde7] bg-[#eef3fb] text-[#445064]',
      ].join(' ')}
    >
      {label}
      {onClear ? (
        <button type="button" className="-mr-1 grid h-5 w-5 place-items-center rounded-full text-[#748093] hover:bg-white" onClick={onClear} aria-label={`Clear ${label} filter`}>
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function AccountFiltersSheet({
  filterOptions,
  repFilter,
  statusFilter,
  pppStatusFilter,
  headsetConnectionFilter,
  preferredPartnerFilter,
  activeFilterCount,
  resultCount,
  onRepFilterChange,
  onStatusFilterChange,
  onPppStatusFilterChange,
  onHeadsetConnectionFilterChange,
  onPreferredPartnerFilterChange,
  onClear,
  onClose,
}: {
  filterOptions: TerritoryStoresResponse['filters'] | undefined;
  repFilter: string;
  statusFilter: string;
  pppStatusFilter: string;
  headsetConnectionFilter: string;
  preferredPartnerFilter: PreferredPartnerFilter;
  activeFilterCount: number;
  resultCount: number;
  onRepFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onPppStatusFilterChange: (value: string) => void;
  onHeadsetConnectionFilterChange: (value: string) => void;
  onPreferredPartnerFilterChange: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[5200] bg-black/35 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close account filters" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[86dvh] max-w-[var(--app-shell-max)] overflow-hidden rounded-t-2xl border border-[#d9dee8] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)]">
        <div className="flex items-center justify-between border-b border-[#e0e5ed] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef3fb] text-[#276fd3]">
              <Filter className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1f2937]">Account filters</h2>
              <p className="text-[13px] text-[#6b7280]">
                {activeFilterCount > 0 ? `${activeFilterCount} active` : 'No filters active'} · {resultCount.toLocaleString()} results
              </p>
            </div>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-[#5f6673] hover:bg-[#f2f5f9]" onClick={onClose} aria-label="Close filters">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(86dvh-132px)] overflow-auto px-4 py-4">
          <div className="grid gap-3">
            <FilterSelect label="Sales Rep" value={repFilter} onChange={onRepFilterChange} options={filterOptions?.reps.map((entry) => entry.value) ?? []} />
            <FilterSelect label="Account Status" value={statusFilter} onChange={onStatusFilterChange} options={filterOptions?.statuses.map((entry) => entry.value) ?? []} />
            <FilterSelect label="PPP Status" value={pppStatusFilter} onChange={onPppStatusFilterChange} options={filterOptions?.pppStatuses.map((entry) => entry.value) ?? []} />
            <FilterSelect
              label="Headset Connection"
              value={headsetConnectionFilter}
              onChange={onHeadsetConnectionFilterChange}
              options={filterOptions?.headsetConnectionStatuses.map((entry) => entry.value) ?? []}
            />
            <FilterSelect
              label="Preferred Partner"
              value={preferredPartnerFilter}
              onChange={onPreferredPartnerFilterChange}
              options={[
                { value: 'preferred', label: 'Preferred Partner' },
                { value: 'not_preferred', label: 'Not a Preferred Partner' },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1.4fr] gap-2 border-t border-[#e0e5ed] bg-[#f8fafc] px-4 py-3">
          <button type="button" className="h-11 rounded-xl border border-[#d6dce7] bg-white text-[14px] font-semibold text-[#394255]" onClick={onClear}>
            Clear all
          </button>
          <button type="button" className="h-11 rounded-xl bg-[#276fd3] text-[14px] font-semibold text-white" onClick={onClose}>
            Show {resultCount.toLocaleString()} {resultCount === 1 ? 'account' : 'accounts'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  const normalizedOptions = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );

  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6a7583]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-[#d6dbe4] bg-[#fbfcfe] px-3 text-[14px] text-[#18212d]"
      >
        <option value="all">All</option>
        {normalizedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
