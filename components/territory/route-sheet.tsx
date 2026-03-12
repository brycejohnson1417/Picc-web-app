'use client';

import { Bike, Car, ExternalLink, Navigation2, Trash2, Train } from 'lucide-react';
import { Button } from '@/components/ui';
import type { RouteMode, TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';

interface RouteSheetProps {
  selectedStops: TerritoryStorePin[];
  orderedStops: TerritoryStorePin[];
  mode: RouteMode;
  optimizing: boolean;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  onSetMode: (mode: RouteMode) => void;
  onOptimize: () => void;
  onLaunchDirections: () => void;
  onRemoveStop: (storeId: string) => void;
  onClearStops: () => void;
}

export function RouteSheet({
  selectedStops,
  orderedStops,
  mode,
  optimizing,
  totalDurationSeconds,
  totalDistanceMeters,
  onSetMode,
  onOptimize,
  onLaunchDirections,
  onRemoveStop,
  onClearStops,
}: RouteSheetProps) {
  return (
    <div className="space-y-3 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
      <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-300" />

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Route Planner</p>
          <p className="text-xs text-slate-500">Tap pins to add stops, then optimize.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClearStops} disabled={selectedStops.length === 0}>
          <Trash2 className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="flex gap-2">
        <ModeButton icon={Car} label="Car" active={mode === 'car'} onClick={() => onSetMode('car')} />
        <ModeButton icon={Bike} label="Bike" active={mode === 'bike'} onClick={() => onSetMode('bike')} />
        <ModeButton icon={Train} label="Transit" active={mode === 'transit'} onClick={() => onSetMode('transit')} />
        <Button variant="outline" size="sm" className="h-9" onClick={onLaunchDirections} disabled={selectedStops.length < 2}>
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          Open Maps
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Travel Time</p>
          <p className="font-semibold">{formatDuration(totalDurationSeconds)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Distance</p>
          <p className="font-semibold">{formatDistance(totalDistanceMeters)}</p>
        </div>
      </div>

      <Button className="h-10 w-full" onClick={onOptimize} disabled={selectedStops.length < 2 || optimizing}>
        <Navigation2 className="mr-2 h-4 w-4" />
        {optimizing ? 'Optimizing...' : `Optimize ${mode === 'transit' ? 'Transit' : mode === 'bike' ? 'Bike' : 'Car'} Route`}
      </Button>

      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {orderedStops.length === 0 ? (
          <p className="text-xs text-slate-500">No stops selected yet.</p>
        ) : (
          orderedStops.map((stop, index) => (
            <div key={stop.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{stop.name}</p>
                <p className="truncate text-xs text-slate-500">{stop.status}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onRemoveStop(stop.id)}>
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium',
        active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0m';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return hours > 0 ? `${hours}h ${rem}m` : `${minutes}m`;
}

function formatDistance(meters: number) {
  if (!meters || meters < 0) return '0 mi';
  const miles = meters / 1609.34;
  return `${miles.toFixed(miles >= 100 ? 0 : 1)} mi`;
}
