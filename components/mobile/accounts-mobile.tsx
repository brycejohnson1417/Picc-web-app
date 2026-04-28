'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
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

  useEffect(() => {
    const routeStoreId = searchParams.get('storeId');
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
  }, [allStoreById, allStores.length, searchParams]);

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
        <div className="rounded-[24px] border border-[#d6dbe4] bg-white p-4 shadow-[0_16px_40px_rgba(24,33,45,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6a7583]">Accounts</p>
          <h2 className="mt-1 text-xl font-semibold text-[#18212d]">Find and open store context fast.</h2>
          <div className="mt-3">
            <MobileSearch value={search} onChange={setSearch} placeholder="Search Accounts" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <FilterSelect label="Sales Rep" value={repFilter} onChange={setRepFilter} options={filterOptions?.reps.map((entry) => entry.value) ?? []} />
            <FilterSelect label="Account Status" value={statusFilter} onChange={setStatusFilter} options={filterOptions?.statuses.map((entry) => entry.value) ?? []} />
            <FilterSelect label="PPP Status" value={pppStatusFilter} onChange={setPppStatusFilter} options={filterOptions?.pppStatuses.map((entry) => entry.value) ?? []} />
            <FilterSelect
              label="Headset Connection"
              value={headsetConnectionFilter}
              onChange={setHeadsetConnectionFilter}
              options={filterOptions?.headsetConnectionStatuses.map((entry) => entry.value) ?? []}
            />
            <FilterSelect
              label="Preferred Partner"
              value={preferredPartnerFilter}
              onChange={(value) => setPreferredPartnerFilter(value as PreferredPartnerFilter)}
              options={[
                { value: 'preferred', label: 'Preferred Partner' },
                { value: 'not_preferred', label: 'Not a Preferred Partner' },
              ]}
            />
          </div>
          {hasActiveFilters ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="text-[12px] font-semibold text-[#c93412]"
                onClick={() => {
                  setRepFilter('all');
                  setStatusFilter('all');
                  setPppStatusFilter('all');
                  setHeadsetConnectionFilter('all');
                  setPreferredPartnerFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
          <div className="mt-3 border-t border-[#e2e8f0]" />

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
            <div className="px-1 py-5 text-[17px] text-[#6a6d75]">
              {debouncedSearch ? 'No accounts match your search.' : 'No accounts available yet.'}
            </div>
          ) : null}

          <div className="mt-4 space-y-5">
            {grouped.map(([letter, list]) => (
              <section
                key={letter}
                ref={(element) => {
                  sectionRefs.current[letter] = element;
                }}
              >
                <div className="px-1 py-1 text-[24px] font-semibold text-[#6a7583]">{letter}</div>
                <div className="mt-2 space-y-2">
                  {list.map((store) => (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => setDetailStoreId(store.id)}
                      className="w-full rounded-[18px] border border-[#e0e4eb] bg-[#fbfcfe] px-4 py-3 text-left transition hover:border-[#9db8f7] hover:bg-[#f5f9ff]"
                    >
                      <p className="truncate text-[20px] font-semibold text-[#15171c]">{store.name}</p>
                      <p className="mt-1 truncate text-[15px] text-[#6b7280]">{store.locationAddress ?? store.locationLabel ?? 'No address'}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#eef3fb] px-3 py-1 text-[12px] font-semibold text-[#304153]">
                          Rep: {store.repNames.length > 0 ? store.repNames.join(', ') : 'Unassigned'}
                        </span>
                        <NotionOptionChip
                          label={store.status || 'Status unknown'}
                          colorName={store.statusColorName}
                          fallbackHex={store.statusColor || '#5f6b7a'}
                        />
                        {store.isPreferredPartner ? (
                          <span className="rounded-full border border-black bg-black px-3 py-1 text-[12px] font-semibold text-white">
                            Preferred Partner
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

      <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      <AccountDetailSheet
        store={detailStoreId ? allStoreById.get(detailStoreId) ?? null : null}
        onClose={() => {
          setDetailStoreId(null);
          if (searchParams.get('storeId')) {
            router.replace('/accounts');
          }
        }}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={detailStoreId ? routePlan.selectedStopIds.includes(detailStoreId) : false}
      />
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
