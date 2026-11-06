'use client';

import type { MutableRefObject } from 'react';
import { Check, Filter, Route, Search, X } from 'lucide-react';
import { AlphabetRail } from '@/components/mobile/alphabet-rail';
import { cn } from '@/lib/utils';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { pinColorForStore, type PinColorMode } from '@/lib/territory/pin-colors';

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
  onToggleRouteStop?: (storeId: string) => void;
  compact?: boolean;
  selectedId?: string | null;
  area?: 'all' | 'visible';
  onAreaChange?: (area: 'all' | 'visible') => void;
}

export function TerritoryListPane({ storesQueryError, search, onSearchChange, activeFiltersCount, onOpenFilters,
  lassoSelectedCount, onClearLassoSelection, groupedStores, sectionRefs, routeSelectedIds, pinColorMode,
  repColorMap, onOpenStore, onToggleRouteStop, compact = false, selectedId, area = 'all', onAreaChange,
}: TerritoryListPaneProps) {
  const count = groupedStores.reduce((sum, [, stores]) => sum + stores.length, 0);
  return <section aria-label="Account browser" className="relative flex h-full min-h-0 flex-col bg-[#fbfcf9]">
    <div className="shrink-0 border-b border-[#e2e5dd] px-4 pb-3 pt-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold text-[#2b3228]">Accounts <span className="ml-1 text-[12px] font-normal tabular-nums text-[#7b8474]">{count.toLocaleString()}</span></h2>
        <button type="button" onClick={onOpenFilters} aria-label="Filter accounts" className={cn('flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium',activeFiltersCount ? 'border-[#c93412] text-[#b33217]' : 'border-[#dce0d5] text-[#59624f]')}><Filter className="h-3.5 w-3.5" />Filters{activeFiltersCount > 0 ? ` · ${activeFiltersCount}` : ''}</button>
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-[#8b9384]" /><input value={search} onChange={e=>onSearchChange(e.target.value)} aria-label="Search accounts" placeholder="Name, city or license" className="h-10 w-full rounded-md border border-[#dce1d5] bg-white pl-9 pr-8 text-[12px] outline-none focus:border-[#87977b]" />{search ? <button aria-label="Clear account search" onClick={()=>onSearchChange('')} className="absolute right-2 top-2.5"><X className="h-4 w-4 text-[#707b66]" /></button> : null}</div>
      {compact && onAreaChange ? <div className="mt-3 flex gap-4" aria-label="Account scope">{(['all','visible'] as const).map(value=><button key={value} onClick={()=>onAreaChange(value)} aria-pressed={area===value} className={cn('pb-1 text-[12px] font-medium',area===value ? 'border-b-2 border-[#c93412] text-[#a93218]' : 'text-[#7b8474]')}>{value==='all' ? 'All matching' : 'On map'}</button>)}</div> : null}
      {lassoSelectedCount>0 ? <div className="mt-2 flex justify-between text-[11px] text-[#375d93]"><span>{lassoSelectedCount} in lasso</span><button onClick={onClearLassoSelection}>Clear selection</button></div> : null}
      {storesQueryError ? <p className="mt-2 text-[11px] text-[#a53720]">{storesQueryError.message}</p> : null}
    </div>
    <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain',compact ? 'pb-2' : 'pb-24 pr-6 lg:pb-3')}>
      {count===0 ? <div className="px-4 py-8 text-[13px] text-[#65715d]">No matching accounts.{search ? <button onClick={()=>onSearchChange('')} className="mt-2 block font-medium text-[#b13b22]">Clear search</button> : null}</div> : null}
      {groupedStores.map(([letter,list])=><section key={letter} ref={el=>{sectionRefs.current[letter]=el;}}>
        {!compact ? <h3 className="sticky top-0 z-10 border-b border-[#e2e5dd] bg-[#f1f3ed] px-4 py-1.5 text-[11px] font-semibold text-[#748068]">{letter}</h3> : null}
        {list.map(store=>{
          const onRoute=routeSelectedIds.includes(store.id);
          const locality=[store.city,store.state].filter(Boolean).join(', ') || store.locationAddress || store.locationLabel;
          return <div key={store.id} className="picc-account-row flex items-center border-b border-[#e9ece4]" aria-selected={selectedId===store.id}>
            <button type="button" onClick={()=>onOpenStore(store.id)} className="flex min-w-0 flex-1 items-start gap-2.5 py-3 pl-4 pr-1 text-left" aria-label={`Open ${store.name}`}>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:pinColorForStore(store,pinColorMode,repColorMap)}} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold leading-[18px] text-[#30372b]">{store.name}</span>{locality ? <span className="mt-0.5 block truncate text-[11px] text-[#7b8474]">{locality}</span> : null}<span className="mt-1 flex items-center gap-2 text-[10px] text-[#66735b]"><span className="truncate">{store.status}</span>{store.repNames.length ? <><span className="text-[#ccd2c6]">·</span><span className="truncate">{store.repNames.join(', ')}</span></> : null}</span></span>
            </button>
            {onToggleRouteStop ? <button type="button" onClick={()=>onToggleRouteStop(store.id)} aria-label={`${onRoute?'Remove':'Add'} ${store.name} ${onRoute?'from':'to'} route`} aria-pressed={onRoute} className={cn('mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-md',onRoute ? 'bg-[#e8f0e1] text-[#427133]' : 'text-[#929c89] hover:bg-[#e9eee3]')}>
              {onRoute ? <Check className="h-4 w-4" /> : <Route className="h-4 w-4" />}</button> : onRoute ? <Check className="mr-4 h-4 w-4 text-[#427133]" /> : null}
          </div>;
        })}
      </section>)}
    </div>
    {!compact ? <AlphabetRail onSelect={letter=>sectionRefs.current[letter]?.scrollIntoView({behavior:'smooth',block:'start'})} /> : null}
  </section>;
}
