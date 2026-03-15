'use client';

import { Check, Eye, EyeOff, Layers3, Pencil, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import type { TerritoryBoundary } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

export interface TerritoryBoundaryEditorState {
  id: string | null;
  name: string;
  description: string;
  color: string;
  borderWidth: number;
  coordinates: [number, number][];
}

interface TerritoryBoundarySheetProps {
  open: boolean;
  onClose: () => void;
  boundaries: TerritoryBoundary[];
  showBoundaries: boolean;
  hiddenBoundaryIds: string[];
  onToggleAll: () => void;
  onToggleBoundary: (boundaryId: string) => void;
  isAdmin: boolean;
  onCreateBoundary: () => void;
  onEditBoundary: (boundary: TerritoryBoundary) => void;
  onDeleteBoundary: (boundary: TerritoryBoundary) => void;
}

export function TerritoryBoundarySheet({
  open,
  onClose,
  boundaries,
  showBoundaries,
  hiddenBoundaryIds,
  onToggleAll,
  onToggleBoundary,
  isAdmin,
  onCreateBoundary,
  onEditBoundary,
  onDeleteBoundary,
}: TerritoryBoundarySheetProps) {
  if (!open) {
    return null;
  }

  const hidden = new Set(hiddenBoundaryIds);

  return (
    <div className="fixed inset-0 z-[5400] bg-black/35">
      <div className="mx-auto flex h-full max-w-[var(--app-shell-max)] flex-col bg-[#e6e6e9]">
        <div className="flex items-center justify-between border-b border-[#c8c9cf] bg-[#c93412] px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5" />
            <h2 className="text-[17px] font-semibold">Territory Layers</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/10" aria-label="Close territory layers">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-[#c7c9cf] bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[#23262d]">Boundary visibility</h3>
                <p className="mt-1 text-[13px] text-[#6a6e77]">Toggle all boundaries or switch individual territories on and off.</p>
              </div>
              <button
                type="button"
                onClick={onToggleAll}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[13px] font-semibold',
                  showBoundaries ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c3c5cb] bg-white text-[#4a4c52]',
                )}
              >
                {showBoundaries ? 'Hide All' : 'Show All'}
              </button>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-[#c7c9cf] bg-white">
            <div className="flex items-center justify-between border-b border-[#e0e2e8] px-3 py-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[#23262d]">Saved territories</h3>
                <p className="mt-1 text-[13px] text-[#6a6e77]">{boundaries.length > 0 ? `${boundaries.length} boundary layer${boundaries.length === 1 ? '' : 's'}` : 'No boundaries saved yet'}</p>
              </div>
              {isAdmin ? (
                <button type="button" onClick={onCreateBoundary} className="inline-flex items-center gap-1 rounded-lg bg-[#cd3814] px-3 py-2 text-[13px] font-semibold text-white">
                  <Plus className="h-4 w-4" />
                  New
                </button>
              ) : null}
            </div>

            <div className="divide-y divide-[#eceef3]">
              {boundaries.length === 0 ? (
                <div className="px-3 py-4 text-[13px] text-[#6a6e77]">No territory boundaries have been saved yet.</div>
              ) : null}
              {boundaries.map((boundary) => {
                const isVisible = showBoundaries && !hidden.has(boundary.id);
                return (
                  <div key={boundary.id} className="px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ backgroundColor: boundary.color }} />
                          <p className="truncate text-[15px] font-semibold text-[#23262d]">{boundary.name}</p>
                        </div>
                        {boundary.description ? <p className="mt-1 text-[13px] text-[#6a6e77]">{boundary.description}</p> : null}
                        <p className="mt-1 text-[12px] text-[#8a8d95]">{boundary.coordinates.length} points • {boundary.borderWidth}px border</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleBoundary(boundary.id)}
                        className={cn(
                          'grid h-10 w-10 place-items-center rounded-lg border',
                          isVisible ? 'border-[#cd3814] bg-[#fdebe7] text-[#cd3814]' : 'border-[#c8c9cf] bg-white text-[#757984]',
                        )}
                        aria-label={isVisible ? `Hide ${boundary.name}` : `Show ${boundary.name}`}
                      >
                        {isVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                      </button>
                    </div>
                    {isAdmin ? (
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => onEditBoundary(boundary)} className="inline-flex items-center gap-1 rounded-lg border border-[#c8c9cf] bg-white px-3 py-2 text-[13px] font-medium text-[#3e4046]">
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button type="button" onClick={() => onDeleteBoundary(boundary)} className="inline-flex items-center gap-1 rounded-lg border border-[#e2b4ab] bg-[#fff4f1] px-3 py-2 text-[13px] font-medium text-[#b43819]">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

interface TerritoryBoundaryEditorProps {
  open: boolean;
  boundary: TerritoryBoundaryEditorState | null;
  drawingMode: boolean;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<TerritoryBoundaryEditorState>) => void;
  onSetDrawingMode: (value: boolean) => void;
  onUndoLastPoint: () => void;
  onDeletePoint: (index: number) => void;
  onClearPoints: () => void;
  onFinishDrawing: () => void;
  onSave: () => void;
}

export function TerritoryBoundaryEditor({
  open,
  boundary,
  drawingMode,
  saving,
  onClose,
  onChange,
  onSetDrawingMode,
  onUndoLastPoint,
  onDeletePoint,
  onClearPoints,
  onFinishDrawing,
  onSave,
}: TerritoryBoundaryEditorProps) {
  if (!open || !boundary) {
    return null;
  }

  const isNewBoundary = !boundary.id;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[96px] z-[5300] px-3">
      <div className="pointer-events-auto mx-auto max-w-[720px] rounded-2xl border border-[#d8b0a5] bg-[#fffaf8] shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between border-b border-[#f0d6ce] px-4 py-3">
          <div>
            <p className="text-[16px] font-semibold text-[#23262d]">{isNewBoundary ? 'Draw Territory Boundary' : 'Edit Territory Boundary'}</p>
            <p className="mt-1 text-[12px] text-[#7a5e56]">
              {drawingMode ? 'Tap the map to add points. Drag polygon handles to fine-tune the shape.' : 'You can resume drawing or drag existing polygon handles on the map.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#7a5e56] hover:bg-[#f6e3de]" aria-label="Close territory editor">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_140px]">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Name</span>
            <input
              value={boundary.name}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder="Queens East"
              className="w-full rounded-xl border border-[#c8c9cf] bg-white px-3 py-2 text-[14px] text-[#1f232a] outline-none focus:border-[#cd3814]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Color</span>
            <input
              type="color"
              value={boundary.color}
              onChange={(event) => onChange({ color: event.target.value })}
              className="h-[44px] w-full rounded-xl border border-[#c8c9cf] bg-white px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Border Width</span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={boundary.borderWidth}
              onChange={(event) => onChange({ borderWidth: Number(event.target.value) })}
              className="h-[44px] w-full"
            />
            <p className="mt-1 text-[12px] text-[#7b7e87]">{boundary.borderWidth}px</p>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Description</span>
            <input
              value={boundary.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="Optional note about this sales territory"
              className="w-full rounded-xl border border-[#c8c9cf] bg-white px-3 py-2 text-[14px] text-[#1f232a] outline-none focus:border-[#cd3814]"
            />
          </label>
        </div>

        <div className="border-t border-[#f0d6ce] px-4 py-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSetDrawingMode(!drawingMode)}
              className={cn(
                'rounded-lg border px-3 py-2 text-[13px] font-semibold',
                drawingMode ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c8c9cf] bg-white text-[#3e4046]',
              )}
            >
              {drawingMode ? 'Pause Drawing' : 'Resume Drawing'}
            </button>
            <button type="button" onClick={onUndoLastPoint} className="inline-flex items-center gap-1 rounded-lg border border-[#c8c9cf] bg-white px-3 py-2 text-[13px] font-medium text-[#3e4046]">
              <Undo2 className="h-4 w-4" />
              Undo Point
            </button>
            <button
              type="button"
              onClick={onFinishDrawing}
              disabled={boundary.coordinates.length < 3}
              className="inline-flex items-center gap-1 rounded-lg border border-[#9fd3aa] bg-[#effaf1] px-3 py-2 text-[13px] font-medium text-[#24703a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Finish Shape
            </button>
            <button type="button" onClick={onClearPoints} className="inline-flex items-center gap-1 rounded-lg border border-[#e2b4ab] bg-[#fff4f1] px-3 py-2 text-[13px] font-medium text-[#b43819]">
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>

          {boundary.coordinates.length > 0 ? (
            <div className="mb-3 rounded-xl border border-[#f0d6ce] bg-white px-3 py-3">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Points</p>
              <div className="grid gap-2 md:grid-cols-2">
                {boundary.coordinates.map((point, index) => (
                  <div key={`${point[0]}-${point[1]}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-[#ece7e4] px-2 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#23262d]">Point {index + 1}</p>
                      <p className="truncate text-[11px] text-[#7b7e87]">
                        {point[1].toFixed(5)}, {point[0].toFixed(5)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeletePoint(index)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#e2b4ab] bg-[#fff4f1] px-2 py-1 text-[11px] font-medium text-[#b43819]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#7b7e87]">{boundary.coordinates.length} point{boundary.coordinates.length === 1 ? '' : 's'} captured</p>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#cd3814] px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Boundary'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
