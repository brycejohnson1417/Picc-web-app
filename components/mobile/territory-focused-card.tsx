'use client';

import { Navigation, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TerritoryStorePin } from '@/lib/territory/types';
import type { PinColorMode } from '@/lib/territory/pin-colors';
import { pinColorForStore } from '@/lib/territory/pin-colors';

interface TerritoryFocusedCardProps {
  store: TerritoryStorePin;
  selectedOnRoute: boolean;
  pinColorMode: PinColorMode;
  repColorMap: Map<string, string>;
  onOpenDetails: (storeId: string) => void;
  onMessageRep: (store: TerritoryStorePin) => void;
  onToggleRouteStop: (storeId: string) => void;
  notionPageUrl: string;
}

export function TerritoryFocusedCard({
  store,
  selectedOnRoute,
  pinColorMode,
  repColorMap,
  onOpenDetails,
  onMessageRep,
  onToggleRouteStop,
  notionPageUrl,
}: TerritoryFocusedCardProps) {
  return (
    <div className="fixed bottom-[86px] left-0 right-0 z-[2500]">
      <div className="mx-auto max-w-[720px] bg-[#1d1f24]/95 text-white shadow-[0_-2px_8px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <button type="button" onClick={() => onOpenDetails(store.id)} className="w-full border-b border-[#30333b] px-3 py-2 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold leading-tight">{store.name}</p>
              <p className="truncate text-[13px] text-[#b6bac3]">{store.locationAddress ?? store.locationLabel ?? 'No address'}</p>
              {store.isApproximate ? (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#f1cc78]">Approximate ({store.locationPrecision})</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                {store.pinKind === 'lead' ? 'Lead Status' : 'Status'}
              </p>
              <span className="mt-1 inline-flex max-w-[132px] truncate rounded-full border border-[#39a9ff]/45 bg-[#0f3654] px-2.5 py-1 text-[11px] font-semibold text-[#8fd5ff]">
                {store.status}
              </span>
            </div>
          </div>
        </button>
        <div className="grid grid-cols-[1fr_56px_56px_56px] border-b border-[#30333b]">
          <button type="button" className="flex items-center gap-2 px-3 py-2 text-[14px] text-[#d5d9e1]" onClick={() => onMessageRep(store)}>
            <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ backgroundColor: pinColorForStore(store, pinColorMode, repColorMap) }} />
            {store.repNames[0] ?? 'Unassigned'}
          </button>
          <a
            href={notionPageUrl}
            target="_blank"
            rel="noreferrer"
            className="grid place-items-center border-l border-[#30333b] text-[20px] font-semibold text-[#d8dde6]"
            aria-label="Open in Notion"
            title="Open in Notion"
          >
            N
          </a>
          <button type="button" onClick={() => onToggleRouteStop(store.id)} className="grid place-items-center border-l border-[#30333b]">
            <Plus className={cn('h-6 w-6', selectedOnRoute ? 'text-[#4fb649]' : 'text-[#d8dde6]')} />
          </button>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`}
            target="_blank"
            rel="noreferrer"
            className="grid place-items-center border-l border-[#30333b]"
          >
            <Navigation className="h-5 w-5 text-[#d8dde6]" />
          </a>
        </div>
      </div>
    </div>
  );
}
