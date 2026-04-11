'use client';

import type { MutableRefObject } from 'react';
import { Filter } from 'lucide-react';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { MobileSearch } from '@/components/mobile/mobile-search';
import { cn } from '@/lib/utils';
import type { TerritoryStorePin } from '@/lib/territory/types';
import type { PinColorMode } from '@/lib/territory/pin-colors';
import { pinColorForStore } from '@/lib/territory/pin-colors';

interface TerritoryListPaneProps {
  storesQueryError: Error | null;
  search: string;
  onSearchChange: (value: string) => void;
  activeFiltersCount: number;
  onOpenFilters: () => void;
  lassoSelectedCount: number;
  onClearLassoSelection: () => void;
  groupedStores: Array<[string, TerritoryStorePin[]]>;
  sectionRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  routeSelectedIds: string[];
  pinColorMode: PinColorMode;
  repColorMap: Map<string, string>;
  onOpenStore: (storeId: string) => void;
}

export function TerritoryListPane({
  storesQueryError,
  search,
  onSearchChange,
  activeFiltersCount,
  onOpenFilters,
  lassoSelectedCount,
  onClearLassoSelection,
  groupedStores,
  sectionRefs,
  routeSelectedIds,
  pinColorMode,
  repColorMap,
  onOpenStore,
}: TerritoryListPaneProps) {
  return (
    <div className="px-3 pb-28 pt-2">
      {storesQueryError ? (
        <div className="mb-3 rounded-lg border border-[#e6b3a7] bg-[#fdebe7] px-3 py-2 text-[13px] text-[#8f2410]">
          Live sync warning: {storesQueryError.message}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <MobileSearch value={search} onChange={onSearchChange} placeholder="Search Locations" className="flex-1" />
        <button
          type="button"
          onClick={onOpenFilters}
          className={cn('relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white', activeFiltersCount > 0 ? 'border-[#cd3814]' : 'border-[#c8c9cf]')}
        >
          <Filter className={cn('h-5 w-5', activeFiltersCount > 0 ? 'text-[#cd3814]' : 'text-[#6c7078]')} />
          {activeFiltersCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#cd3814] px-1 text-[11px] font-semibold text-white">{activeFiltersCount}</span> : null}
        </button>
      </div>
      {lassoSelectedCount > 0 ? (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-[#c9d7ff] bg-[#eef4ff] px-3 py-2 text-[12px] text-[#20439b]">
          <span>Lasso selection: {lassoSelectedCount} accounts</span>
          <button type="button" className="font-semibold" onClick={onClearLassoSelection}>
            Clear
          </button>
        </div>
      ) : null}
      <div className="mt-2 border-t border-[#c6c7cb]" />
      {groupedStores.map(([letter, list]) => (
        <section
          key={letter}
          ref={(element) => {
            sectionRefs.current[letter] = element;
          }}
        >
          <div className="border-b border-[#c6c7cb] px-1 py-1.5 text-[26px] text-[#8a8d95]">{letter}</div>
          {list.map((store) => {
            const selected = routeSelectedIds.includes(store.id);
            const pinColor = pinColorForStore(store, pinColorMode, repColorMap);
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => onOpenStore(store.id)}
                className="flex w-full items-center gap-2 border-b border-[#d0d1d4] px-1 py-2 text-left"
              >
                <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: pinColor }} />
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-sm',
                    selected ? 'border-[#4fb649] text-[#4fb649]' : 'border-[#b8bac0] text-transparent',
                  )}
                >
                  ✓
                </span>
                <span className="truncate text-[16px] text-[#15171c]">{store.name}</span>
              </button>
            );
          })}
        </section>
      ))}
      <AlphabetRail onSelect={(letter) => sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
    </div>
  );
}
