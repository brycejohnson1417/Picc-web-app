'use client';

import { Crosshair, Download, Filter, Layers3, RefreshCw, Search } from 'lucide-react';
import { MobileSearch } from '@/components/mobile/mobile-search';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';
import type { PinColorMode } from '@/lib/territory/pin-colors';

interface TerritoryRepLegendEntry {
  label: string;
  color: string;
  count: number;
}

interface TerritoryMapOverlayControlsProps {
  canVisualizeRoute: boolean;
  showRouteOnly: boolean;
  onToggleRouteVisualization: () => void;
  lassoActive: boolean;
  lassoDrawingMode: boolean;
  onToggleLassoMode: () => void;
  onFinishLasso: () => void;
  showMapSearch: boolean;
  mapSearch: string;
  onMapSearchChange: (value: string) => void;
  onClearMapSearch: () => void;
  searchSuggestions: TerritoryStorePin[];
  onSelectSearchSuggestion: (storeId: string) => void;
  selectedSearchStoreId: string | null;
  hasRoadRouteGeometry: boolean;
  routeModeLabel: string | null;
  pinColorMode: PinColorMode;
  repLegend: TerritoryRepLegendEntry[];
  showRepLegend: boolean;
  onToggleRepLegend: () => void;
  focusedStoreVisible: boolean;
  onCenterCurrentLocation: () => void;
  onRefreshData: () => void;
  onToggleMapSearch: () => void;
  onOpenBoundarySheet: () => void;
  onOpenMyMapsExport: () => void;
  showBoundaries: boolean;
  onOpenFilters: () => void;
  activeFiltersCount: number;
}

export function TerritoryMapOverlayControls({
  canVisualizeRoute,
  showRouteOnly,
  onToggleRouteVisualization,
  lassoActive,
  lassoDrawingMode,
  onToggleLassoMode,
  onFinishLasso,
  showMapSearch,
  mapSearch,
  onMapSearchChange,
  onClearMapSearch,
  searchSuggestions,
  onSelectSearchSuggestion,
  selectedSearchStoreId,
  hasRoadRouteGeometry,
  routeModeLabel,
  pinColorMode,
  repLegend,
  showRepLegend,
  onToggleRepLegend,
  focusedStoreVisible,
  onCenterCurrentLocation,
  onRefreshData,
  onToggleMapSearch,
  onOpenBoundarySheet,
  onOpenMyMapsExport,
  showBoundaries,
  onOpenFilters,
  activeFiltersCount,
}: TerritoryMapOverlayControlsProps) {
  return (
    <>
      <div className="absolute left-1/2 top-3 z-[1500] -translate-x-1/2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canVisualizeRoute}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow',
              !canVisualizeRoute
                ? 'cursor-not-allowed border-white/40 bg-white/65 text-[#80848d]'
                : showRouteOnly
                  ? 'border-[#39a9ff] bg-[#12344b]/90 text-[#8fd5ff]'
                  : 'border-white/70 bg-white/92 text-[#25313d]',
            )}
            onClick={onToggleRouteVisualization}
          >
            {showRouteOnly ? 'Hide Route' : 'Visualize Route'}
          </button>
          {lassoActive ? (
            <>
              <button
                type="button"
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow',
                  lassoDrawingMode ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-white/70 bg-white/92 text-[#25313d]',
                )}
                onClick={onToggleLassoMode}
              >
                {lassoDrawingMode ? 'Pause Lasso' : 'Resume Lasso'}
              </button>
              <button
                type="button"
                className="rounded-full border border-[#2563eb] bg-white/92 px-3 py-1.5 text-[12px] font-semibold text-[#1d4ed8] shadow"
                onClick={onFinishLasso}
              >
                Finish Lasso
              </button>
            </>
          ) : null}
        </div>
      </div>

      {showMapSearch || mapSearch.trim().length > 0 ? (
        <div className="absolute left-1/2 top-16 z-[1500] w-[min(calc(100%-16px),420px)] -translate-x-1/2">
          <div className="rounded-2xl bg-white/92 p-2 shadow-[0_12px_24px_rgba(0,0,0,0.16)] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <MobileSearch
                value={mapSearch}
                onChange={onMapSearchChange}
                placeholder="Search dispensaries on the map"
                className="flex-1 bg-[#eef0f3]"
              />
              <button
                type="button"
                onClick={onClearMapSearch}
                className="rounded-xl border border-[#d0d3d9] bg-white px-3 py-2 text-[13px] font-medium text-[#4b4f57]"
              >
                Clear
              </button>
            </div>
            {mapSearch.trim().length > 0 ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-[#e1e3e8] bg-white">
                {searchSuggestions.length > 0 ? (
                  <div role="listbox" aria-label="Matching stores" className="max-h-[260px] overflow-y-auto">
                    {searchSuggestions.map((store) => {
                      const selected = selectedSearchStoreId === store.id;
                      return (
                        <button
                          key={store.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => onSelectSearchSuggestion(store.id)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 active:bg-[#f3f5f8]',
                            selected ? 'border-[#cfe2ff] bg-[#f4f8ff]' : 'border-[#eef0f3]',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-semibold text-[#24272f]">{store.name}</span>
                            <span className="mt-0.5 block truncate text-[12px] text-[#62666f]">
                              {[store.city, store.state].filter(Boolean).join(', ') || store.locationLabel || store.locationAddress || 'No location'}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold',
                              selected ? 'bg-[#1d5eea] text-white' : 'bg-[#eef6ff] text-[#1d5eea]',
                            )}
                          >
                            {selected ? 'Selected' : 'Select'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-3 py-2.5 text-[12px] text-[#62666f]">No dispensaries match this search yet.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showRouteOnly && hasRoadRouteGeometry ? (
        <div className={cn('absolute left-3 z-[1500] rounded-xl bg-black/70 px-2.5 py-1.5 text-[11px] text-white', focusedStoreVisible ? 'bottom-[108px]' : 'bottom-3')}>
          {routeModeLabel ?? 'Driving'} route on roads
        </div>
      ) : showRouteOnly ? (
        <div className={cn('absolute left-3 z-[1500] rounded-xl bg-black/70 px-2.5 py-1.5 text-[11px] text-white', focusedStoreVisible ? 'bottom-[108px]' : 'bottom-3')}>
          Add 2+ stops and tap Optimize in Route view
        </div>
      ) : null}

      {pinColorMode === 'rep' && repLegend.length > 0 ? (
        <div className={cn('absolute left-3 z-[1500]', focusedStoreVisible ? 'bottom-[148px]' : 'bottom-12')}>
          <button
            type="button"
            className="rounded-full bg-black/70 px-3 py-2 text-[12px] font-semibold text-white shadow"
            onClick={onToggleRepLegend}
          >
            {showRepLegend ? 'Hide rep colors' : `Rep colors (${repLegend.length})`}
          </button>
          {showRepLegend ? (
            <div className="mt-2 max-h-[40vh] max-w-[240px] overflow-y-auto rounded-xl bg-black/70 px-2.5 py-2 text-white">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-white/70">Rep Colors</p>
              <div className="space-y-1">
                {repLegend.map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.label}</span>
                    </span>
                    <span className="text-white/70">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="absolute left-2 top-3 z-[1500] flex flex-col gap-2">
        <button
          type="button"
          aria-label="Center on your current location"
          title="Current location"
          className="grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow"
          onClick={onCenterCurrentLocation}
        >
          <Crosshair className="h-5 w-5 text-[#7f828a]" />
        </button>
        <button
          type="button"
          aria-label="Refresh territory data"
          title="Refresh territory data"
          className="grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow"
          onClick={onRefreshData}
        >
          <RefreshCw className="h-5 w-5 text-[#7f828a]" />
        </button>
        <button
          type="button"
          aria-label={lassoActive ? 'Clear lasso selection' : 'Start lasso selection'}
          title={lassoActive ? 'Clear lasso selection' : 'Lasso accounts'}
          className={cn('grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', lassoActive ? 'ring-2 ring-[#2563eb]' : '')}
          onClick={onToggleLassoMode}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn('h-5 w-5', lassoActive ? 'text-[#2563eb]' : 'text-[#7f828a]')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 7.5c0-2.8 2.9-4.5 6.2-4.5 4.4 0 7.8 2.4 7.8 5.9 0 3-2.4 4.9-5.4 5.5" />
            <path d="M10.5 13.3c-3.9-.1-6.5-2-6.5-5 0-1.5.8-2.8 2.1-3.8" />
            <path d="M14.5 16.2c0 1.3-1.1 2.3-2.5 2.3s-2.5-1-2.5-2.3 1.1-2.3 2.5-2.3 2.5 1 2.5 2.3Z" />
            <path d="M12 18.5v2.5" />
          </svg>
        </button>
      </div>

      <div className="absolute right-2 top-3 z-[1500] flex flex-col gap-2">
        <button
          type="button"
          aria-label="Search dispensaries on the map"
          title="Search map"
          className={cn('grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', showMapSearch || mapSearch.trim().length > 0 ? 'ring-2 ring-[#cd3814]' : '')}
          onClick={onToggleMapSearch}
        >
          <Search className={cn('h-5 w-5', showMapSearch || mapSearch.trim().length > 0 ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
        </button>
        <button
          type="button"
          aria-label="Open territory layers"
          title="Territory layers"
          className={cn('grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', showBoundaries ? 'ring-2 ring-[#cd3814]' : '')}
          onClick={onOpenBoundarySheet}
        >
          <Layers3 className={cn('h-5 w-5', showBoundaries ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
        </button>
        <button
          type="button"
          aria-label="Open filters"
          title="Filters"
          className={cn('relative grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow', activeFiltersCount > 0 ? 'ring-2 ring-[#cd3814]' : '')}
          onClick={onOpenFilters}
        >
          <Filter className={cn('h-5 w-5', activeFiltersCount > 0 ? 'text-[#cd3814]' : 'text-[#7f828a]')} />
          {activeFiltersCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#cd3814] px-1 text-[11px] font-semibold text-white">{activeFiltersCount}</span> : null}
        </button>
        <button
          type="button"
          aria-label="Export current map view to Google My Maps"
          title="Export to My Maps"
          className="grid h-10 w-10 place-items-center rounded-lg bg-white/90 shadow"
          onClick={onOpenMyMapsExport}
        >
          <Download className="h-5 w-5 text-[#7f828a]" />
        </button>
      </div>
    </>
  );
}
