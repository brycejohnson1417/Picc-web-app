'use client';

import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AccountDetailSheet } from '@/components/mobile/account-detail-sheet';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { MobileHeader } from '@/components/mobile/mobile-header';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { useRoutePlan } from '@/lib/territory/route-plan-client';
import type { TerritoryStorePin, TerritoryStoresResponse } from '@/lib/territory/types';

function firstLetter(name: string) {
  const normalized = name.trim().toUpperCase();
  const char = normalized[0] ?? '#';
  return /[A-Z]/.test(char) ? char : '#';
}

export function AccountsMobile() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'recent' | 'follow-ups'>('all');
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
    staleTime: 30000,
    placeholderData: (previousData) => previousData,
  });

  const stores = useMemo(() => {
    const source = storesQuery.data?.stores ?? [];
    if (scope === 'all') return source;
    if (scope === 'recent') {
      return source.filter((store) => {
        const editedAt = Date.parse(store.lastEditedTime);
        return Number.isFinite(editedAt) && Date.now() - editedAt < 1000 * 60 * 60 * 24 * 7;
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
    <div className="min-h-[calc(100vh-92px)] bg-[#e6e6e9]">
      <MobileHeader
        title="Accounts"
        right={
          <button
            type="button"
            className="text-[42px] leading-none"
            onClick={() => toast.info('Create account flow is available on desktop for now.')}
          >
            <Plus className="ml-auto h-9 w-9" />
          </button>
        }
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

      <div className="px-4 pb-28 pt-3">
        <MobileSearch value={search} onChange={setSearch} placeholder="Search Accounts" />
        <div className="mt-2 border-t border-[#c6c7cb]" />

        {grouped.map(([letter, list]) => (
          <section
            key={letter}
            ref={(element) => {
              sectionRefs.current[letter] = element;
            }}
          >
            <div className="border-b border-[#c6c7cb] px-1 py-2 text-[38px] text-[#8a8d95]">{letter}</div>
            {list.map((store) => (
              <button key={store.id} type="button" onClick={() => setDetailStoreId(store.id)} className="w-full border-b border-[#d0d1d4] px-1 py-3 text-left">
                <p className="truncate text-[22px] text-[#15171c]">{store.name}</p>
                <p className="truncate text-[17px] text-[#8c8f97]">{store.locationAddress ?? store.locationLabel ?? 'No address'}</p>
              </button>
            ))}
          </section>
        ))}
      </div>

      <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      <AccountDetailSheet
        store={detailStoreId ? storeById.get(detailStoreId) ?? null : null}
        onClose={() => setDetailStoreId(null)}
        onAddToRoute={(id) => routePlan.toggleStop(id)}
        routeSelected={detailStoreId ? routePlan.selectedStopIds.includes(detailStoreId) : false}
      />
    </div>
  );
}
