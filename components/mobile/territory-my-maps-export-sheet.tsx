'use client';

import { Download, ExternalLink, Layers3, MapPinned, Pin, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  buildGoogleMyMapsKml,
  googleMyMapsExportFilename,
  selectGoogleMyMapsExportData,
  type GoogleMyMapsExportScope,
  type GoogleMyMapsViewportBounds,
} from '@/lib/territory/google-my-maps-export';
import type { TerritoryBoundary, TerritoryMarker, TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

interface TerritoryMyMapsExportSheetProps {
  open: boolean;
  onClose: () => void;
  stores: TerritoryStorePin[];
  boundaries: TerritoryBoundary[];
  markers: TerritoryMarker[];
  showBoundaries: boolean;
  hiddenBoundaryIds: string[];
  showMarkers: boolean;
  hiddenMarkerIds: string[];
  viewportBounds: GoogleMyMapsViewportBounds | null;
  activeFiltersCount: number;
  showRouteOnly: boolean;
}

export function TerritoryMyMapsExportSheet({
  open,
  onClose,
  stores,
  boundaries,
  markers,
  showBoundaries,
  hiddenBoundaryIds,
  showMarkers,
  hiddenMarkerIds,
  viewportBounds,
  activeFiltersCount,
  showRouteOnly,
}: TerritoryMyMapsExportSheetProps) {
  const [scope, setScope] = useState<GoogleMyMapsExportScope>('viewport');
  const [includePins, setIncludePins] = useState(true);
  const [includeBoundaries, setIncludeBoundaries] = useState(true);
  const [includeMarkers, setIncludeMarkers] = useState(true);
  const [lastExportLabel, setLastExportLabel] = useState('');
  const viewportReady = Boolean(viewportBounds);
  const effectiveScope: GoogleMyMapsExportScope = scope === 'viewport' && !viewportReady ? 'filtered' : scope;

  const exportData = useMemo(
    () =>
      selectGoogleMyMapsExportData({
        stores,
        boundaries,
        markers,
        showBoundaries,
        hiddenBoundaryIds,
        showMarkers,
        hiddenMarkerIds,
        scope: effectiveScope,
        viewportBounds,
        includePins,
        includeBoundaries,
        includeMarkers,
      }),
    [
      boundaries,
      hiddenBoundaryIds,
      hiddenMarkerIds,
      includeBoundaries,
      includeMarkers,
      includePins,
      markers,
      effectiveScope,
      showBoundaries,
      showMarkers,
      stores,
      viewportBounds,
    ],
  );

  const totalExportItems = exportData.stores.length + exportData.boundaries.length + exportData.markers.length;

  function downloadKml() {
    if (totalExportItems === 0) {
      toast.message('Nothing visible to export. Adjust the map, filters, or export options first.');
      return;
    }

    const generatedAt = new Date();
    const kml = buildGoogleMyMapsKml({
      name: `PICC territory ${effectiveScope === 'viewport' ? 'current map view' : 'filtered view'}`,
      generatedAt: generatedAt.toISOString(),
      ...exportData,
    });
    const blob = new Blob([kml], {
      type: 'application/vnd.google-earth.kml+xml;charset=utf-8',
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = googleMyMapsExportFilename(generatedAt);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 1000);

    const label = `${exportData.stores.length} pins, ${exportData.boundaries.length} territories, ${exportData.markers.length} home markers`;
    setLastExportLabel(label);
    toast.success(`KML export ready: ${label}`);
  }

  function openGoogleMyMaps() {
    window.open('https://www.google.com/maps/d/u/0/', '_blank', 'noopener,noreferrer');
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[5000] flex items-end bg-black/35">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close Google My Maps export" onClick={onClose} />
      <section className="relative mx-auto max-h-[86dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-white shadow-[0_-16px_40px_rgba(0,0,0,0.22)]">
        <div className="sticky top-0 z-10 border-b border-[#e5e7eb] bg-white/95 px-4 pb-3 pt-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#c93412]">Google My Maps</p>
              <h2 className="mt-1 text-[18px] font-semibold text-[#1f2937]">Export current map view</h2>
              <p className="mt-1 text-[13px] leading-5 text-[#667085]">
                Download a KML file, import it into My Maps, then share that Google map.
              </p>
            </div>
            <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#667085] hover:bg-[#f2f4f7]" onClick={onClose} aria-label="Close export">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-2">
            <Stat label="Pins" value={exportData.stores.length} icon={<Pin className="h-4 w-4" />} />
            <Stat label="Territories" value={exportData.boundaries.length} icon={<Layers3 className="h-4 w-4" />} />
            <Stat label="Homes" value={exportData.markers.length} icon={<MapPinned className="h-4 w-4" />} />
          </div>

          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
            <p className="text-[13px] font-semibold text-[#1f2937]">Export range</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <OptionButton
                active={effectiveScope === 'viewport'}
                disabled={!viewportReady}
                title="Current viewport"
                description={viewportReady ? 'Only what is inside the map bounds.' : 'Move or load the map first.'}
                onClick={() => setScope('viewport')}
              />
              <OptionButton
                active={effectiveScope === 'filtered'}
                title="Filtered results"
                description="Everything matching active filters."
                onClick={() => setScope('filtered')}
              />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#667085]">
              {showRouteOnly ? 'Route-only mode is active, so pins are limited to selected route stops. ' : null}
              {activeFiltersCount > 0 ? `${activeFiltersCount} active filter${activeFiltersCount === 1 ? '' : 's'} are applied. ` : 'No account filters are applied. '}
              Hidden territory layers stay hidden in the export.
            </p>
          </div>

          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
            <p className="text-[13px] font-semibold text-[#1f2937]">Include layers</p>
            <div className="mt-3 space-y-2">
              <ToggleRow checked={includePins} onChange={setIncludePins} label="Dispensary pins" count={exportData.stores.length} />
              <ToggleRow checked={includeBoundaries} onChange={setIncludeBoundaries} label="Visible territories" count={exportData.boundaries.length} disabled={!showBoundaries} />
              <ToggleRow checked={includeMarkers} onChange={setIncludeMarkers} label="Visible home markers" count={exportData.markers.length} disabled={!showMarkers} />
            </div>
          </div>

          {totalExportItems === 0 ? (
            <div className="rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-[13px] leading-5 text-[#9a3412]">
              This export is empty. Pan back to the accounts, switch to filtered results, or turn on at least one layer.
            </div>
          ) : null}

          {lastExportLabel ? (
            <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-[13px] leading-5 text-[#166534]">
              Last export included {lastExportLabel}. Open My Maps and import the downloaded KML file.
            </div>
          ) : null}

          <div className="sticky bottom-0 -mx-4 grid grid-cols-[1fr_auto] gap-2 border-t border-[#e5e7eb] bg-white/95 px-4 py-3 backdrop-blur">
            <button
              type="button"
              onClick={downloadKml}
              disabled={totalExportItems === 0}
              className={cn(
                'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold shadow-sm',
                totalExportItems === 0 ? 'cursor-not-allowed bg-[#e5e7eb] text-[#98a2b3]' : 'bg-[#c93412] text-white active:bg-[#a72b10]',
              )}
            >
              <Download className="h-4 w-4" />
              Download KML
            </button>
            <button
              type="button"
              onClick={openGoogleMyMaps}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#d0d5dd] bg-white px-3 text-[14px] font-semibold text-[#344054]"
            >
              <ExternalLink className="h-4 w-4" />
              My Maps
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2 text-center shadow-sm">
      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-[#f2f4f7] text-[#667085]">{icon}</div>
      <p className="mt-1 text-[18px] font-semibold text-[#1f2937]">{value.toLocaleString()}</p>
      <p className="text-[11px] font-medium text-[#667085]">{label}</p>
    </div>
  );
}

function OptionButton({
  active,
  disabled = false,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-[76px] rounded-xl border px-3 py-2 text-left',
        active ? 'border-[#c93412] bg-[#fff4f0] text-[#1f2937]' : 'border-[#d0d5dd] bg-white text-[#344054]',
        disabled ? 'cursor-not-allowed opacity-50' : 'active:bg-[#f9fafb]',
      )}
    >
      <span className="block text-[13px] font-semibold">{title}</span>
      <span className="mt-1 block text-[12px] leading-4 text-[#667085]">{description}</span>
    </button>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  count,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  count: number;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#edf0f3] px-3 py-2', disabled ? 'opacity-50' : '')}>
      <span>
        <span className="block text-[14px] font-medium text-[#1f2937]">{label}</span>
        <span className="block text-[12px] text-[#667085]">{disabled ? 'Layer is hidden on the map' : `${count.toLocaleString()} selected`}</span>
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[#c93412]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}
