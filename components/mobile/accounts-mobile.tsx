'use client';

import { Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { StoreFilterSheet } from '@/components/mobile/store-filter-sheet';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import type { TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';

function firstLetter(name: string) {
  const normalized = name.trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

export function AccountsMobile() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'recent' | 'follow-ups'>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const routePlan = useRoutePlan();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const storesQuery = useQuery({
    queryKey: ['accounts-mobile', debouncedSearch, selectedStatuses.join('|'), selectedReps.join('|')],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      for (const status of selectedStatuses) params.append('status', status);
      for (const rep of selectedReps) params.append('rep', rep);
      const response = await fetch(`/api/territory/stores?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? 'Failed to load stores');
      }
      return (await response.json()) as TerritoryStoresResponse;
    },
    staleTime: 30000,
    placeholderData: (previousData) => previousData,
  });

  const stores = useMemo(() => {
    const source = storesQuery.data?.stores ?? [];
    if (scope === 'all') return source;
    if (scope === 'recent') {
      return source.filter((store) => {
        const editedAt = Date.parse(store.lastEditedTime);
        return Number.isFinite(editedAt) && Date.now() - editedAt < 1000 * 60 * 60 * 24 * 14;
      });
    }
    return source.filter((store) => (store.daysOverdue ?? 0) > 0 || /lead|proposal|in progress/i.test(store.status));
  }, [storesQuery.data?.stores, scope]);

  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);

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

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[#e6e6e9]">
      <MobileHeader title="Accounts" right={<span className="text-[22px] leading-none">+</span>}>
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

      <div className="px-4 pb-28 pt-3">
        <div className="flex items-center gap-2">
          <MobileSearch value={search} onChange={setSearch} placeholder="Search Accounts" className="flex-1" />
          <button type="button" onClick={() => setShowFilters(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#c8c9cf] bg-white">
            <Filter className="h-5 w-5 text-[#6c7078]" />
          </button>
        </div>
        <div className="mt-2 border-t border-[#c6c7cb]" />

        {grouped.map(([letter, list]) => (
          <section
            key={letter}
            ref={(element) => {
              sectionRefs.current[letter] = element;
            }}
          >
            <div className="border-b border-[#c6c7cb] px-1 py-1.5 text-[14px] font-semibold text-[#8a8d95]">{letter}</div>
            {list.map((store) => (
              <button key={store.id} type="button" onClick={() => setDetailStoreId(store.id)} className="w-full border-b border-[#d0d1d4] px-1 py-2.5 text-left">
                <p className="truncate text-[15px] text-[#15171c]">{store.name}</p>
                <p className="truncate text-[12px] text-[#8c8f97]">{store.status} · {store.repNames[0] ?? 'Unassigned'}</p>
              </button>
            ))}
          </section>
        ))}
      </div>

      <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      <StoreFilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        statuses={storesQuery.data?.filters.statuses ?? []}
        reps={storesQuery.data?.filters.reps ?? []}
        selectedStatuses={selectedStatuses}
        selectedReps={selectedReps}
        onToggleStatus={(value) => setSelectedStatuses((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))}
        onToggleRep={(value) => setSelectedReps((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))}
        onReset={() => {
          setSelectedStatuses([]);
          setSelectedReps([]);
        }}
      />

      <AccountDetailSheet
        store={detailStoreId ? storeById.get(detailStoreId) ?? null : null}
        onClose={() => setDetailStoreId(null)}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={detailStoreId ? routePlan.selectedStopIds.includes(detailStoreId) : false}
        onCenterOnMap={(id) => {
          router.push(`/territory?focus=${encodeURIComponent(id)}`);
        }}
      />
    </div>
  );
}
