'use client';

import type { ReactNode } from 'react';
import { Loader2, MapPinned, Navigation, PencilLine, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { cn } from '@/lib/utils';

interface AccountDetailSheetProps {
  store: TerritoryStorePin | null;
  onClose: () => void;
  onAddToRoute: (storeId: string) => void;
  routeSelected: boolean;
  onCenterOnMap?: (storeId: string) => void;
}

export function AccountDetailSheet({ store, onClose, onAddToRoute, routeSelected, onCenterOnMap }: AccountDetailSheetProps) {
  const [checkingIn, setCheckingIn] = useState(false);

  if (!store) {
    return null;
  }

  const currentStore = store;
  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${currentStore.lat},${currentStore.lng}`;
  const notionStoreUrl = `https://www.notion.so/${currentStore.notionPageId.replace(/-/g, '')}`;
  const fields = [
    ...(currentStore.detailFields ?? []),
    ...(currentStore.detailFields?.some((entry) => entry.label === 'Account Status') ? [] : [{ label: 'Account Status', value: currentStore.status }]),
    ...(currentStore.detailFields?.some((entry) => entry.label === 'PICC Rep') ? [] : [{ label: 'PICC Rep', value: currentStore.repNames.join(', ') || 'Unassigned' }]),
  ];

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const response = await fetch('/api/territory/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: {
            id: currentStore.id,
            name: currentStore.name,
            notionPageId: currentStore.notionPageId,
            lat: currentStore.lat,
            lng: currentStore.lng,
            address: currentStore.locationAddress ?? currentStore.locationLabel ?? '',
            repName: currentStore.repNames[0] ?? null,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? 'Failed to create meeting note check-in');
      }

      window.open(payload.url as string, '_blank', 'noopener,noreferrer');
      toast.success('Check-in note created in Notion');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[5000] bg-black/35">
      <div className="mx-auto h-full max-w-[480px] bg-[#e6e6e9]">
        <div className="bg-[#c93412] px-4 pb-2 pt-[max(10px,env(safe-area-inset-top))] text-white">
          <div className="relative flex items-center justify-between py-1.5">
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold">Account Details</h1>
            <a href={notionStoreUrl} target="_blank" rel="noreferrer" className="min-w-14 text-right text-[14px] font-medium">
              Open
            </a>
          </div>
          <SegmentedControl
            value="detail"
            onChange={() => {}}
            options={[
              { value: 'detail', label: 'Detail' },
              { value: 'location', label: 'Location' },
              { value: 'notes', label: 'Notes' },
              { value: 'history', label: 'History' },
            ]}
            className="bg-[#d4d4d8]"
          />
        </div>

        <div className="pb-[150px]">
          <div className="border-y border-[#c6c7cb] bg-[#e6e6e9] px-4 py-4">
            <h2 className="text-[24px] font-semibold text-[#111217]">{currentStore.name}</h2>
            <p className="mt-1 text-[14px] text-[#8e9096]">{currentStore.locationAddress ?? currentStore.locationLabel ?? 'No address'}</p>
          </div>

          <DetailRow label="Last check-in" value="Not yet recorded" strong />
          {fields.map((field) => (
            <DetailRow key={`${field.label}-${field.value}`} label={field.label} value={field.value} strong={field.label === 'Account Owner' || field.label === 'Account Status'} />
          ))}
        </div>

        <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-0 right-0 z-[5100]">
          <div className="mx-auto grid max-w-[480px] grid-cols-4 border-t border-[#c6c7cb] bg-[#f2f2f5] py-2 text-[#5a96e8]">
            <ActionButton
              label={routeSelected ? 'remove' : 'add to...'}
              onClick={() => onAddToRoute(currentStore.id)}
              icon={<MapPinned className="h-5 w-5" />}
            />
            <ActionButton
              label={checkingIn ? 'creating...' : 'check-in'}
              onClick={handleCheckIn}
              icon={checkingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <PencilLine className="h-5 w-5" />}
              disabled={checkingIn}
            />
            <ActionButton
              label="center"
              onClick={() => {
                if (onCenterOnMap) onCenterOnMap(currentStore.id);
              }}
              icon={<MapPinned className="h-5 w-5" />}
              disabled={!onCenterOnMap}
            />
            <a href={navigateUrl} target="_blank" rel="noreferrer" className={cn(actionBaseClass, 'text-center')}>
              <Navigation className="h-5 w-5" />
              <span>navigate</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="border-b border-[#c6c7cb] px-4 py-3">
      <p className="text-[12px] text-[#a2a3a8]">{label}</p>
      <p className={cn('mt-1 text-[15px] text-[#1d1f23]', strong ? 'font-medium' : '')}>{value || ' '}</p>
    </div>
  );
}

const actionBaseClass = 'flex min-h-[52px] flex-col items-center justify-center gap-1 text-[12px] font-medium';

function ActionButton({ label, icon, onClick, disabled = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn(actionBaseClass, disabled && 'opacity-50')} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
