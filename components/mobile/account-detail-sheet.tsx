'use client';

import { useState } from 'react';
import { MapPinned, Navigation, PencilLine, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { cn } from '@/lib/utils';

interface AccountDetailSheetProps {
  store: TerritoryStorePin | null;
  onClose: () => void;
  onAddToRoute: (storeId: string) => void;
  routeSelected: boolean;
}

type DetailTab = 'detail' | 'location' | 'notes' | 'history';

export function AccountDetailSheet({ store, onClose, onAddToRoute, routeSelected }: AccountDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('detail');

  if (!store) {
    return null;
  }

  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;

  return (
    <div className="fixed inset-0 z-[5000] bg-black/35">
      <div className="mx-auto h-full max-w-[480px] bg-[#e6e6e9]">
        <div className="bg-[#c93412] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white">
          <div className="mb-2 flex items-center justify-between text-sm opacity-90">
            <span className="font-semibold">12:20</span>
            <span className="font-semibold">100%</span>
          </div>
          <div className="relative flex items-center justify-between py-2">
            <button onClick={onClose} className="min-w-14 text-left" aria-label="Close">
              <X className="h-8 w-8" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[28px] font-semibold">Account Details</h1>
            <button type="button" className="min-w-14 text-right text-[24px]" onClick={() => toast.info('Account editing is currently available on desktop list views.')}>
              Edit
            </button>
          </div>
          <SegmentedControl
            value={activeTab}
            onChange={(value) => setActiveTab(value as DetailTab)}
            options={[
              { value: 'detail', label: 'Detail' },
              { value: 'location', label: 'Location' },
              { value: 'notes', label: 'Notes' },
              { value: 'history', label: 'History' },
            ]}
            className="bg-[#d4d4d8]"
          />
        </div>

        <div className="pb-[170px]">
          {activeTab === 'detail' ? (
            <>
              <div className="border-y border-[#c6c7cb] bg-[#e6e6e9] px-5 py-6">
                <h2 className="text-[50px] font-medium text-[#111217]">{store.name}</h2>
                <p className="text-[34px] text-[#8e9096]">{store.locationAddress ?? store.locationLabel ?? 'No address'}</p>
              </div>

              <DetailRow label="Phone" value="" />
              <DetailRow label="Email" value="" />
              <DetailRow label="Last check-in" value="No check-ins" strong />
              <DetailRow label="Follow-up Date" value="" />
              <DetailRow label="Account Owner" value={store.repNames[0] ?? 'Unassigned'} strong />
              <DetailRow label="Account Status" value={store.status} strong />
              <DetailRow label="PICC Rep" value={store.repNames.join(', ') || '—'} />
              <DetailRow label="License" value={store.licenseNumber ?? '—'} />
            </>
          ) : (
            <div className="px-5 py-6 text-[22px] text-[#75787f]">More account sections are coming soon.</div>
          )}
        </div>

        <div className="fixed bottom-[92px] left-0 right-0 z-[5100]">
          <div className="mx-auto grid max-w-[480px] grid-cols-4 border-t border-[#c6c7cb] bg-[#f2f2f5] py-3 text-[#5a96e8]">
            <ActionButton label={routeSelected ? 'remove' : 'add to...'} onClick={() => onAddToRoute(store.id)} icon={<MapPinned className="h-6 w-6" />} />
            <ActionButton
              label="check-in"
              onClick={() => toast.info('Check-in recording is available on desktop for now.')}
              icon={<PencilLine className="h-6 w-6" />}
            />
            <ActionButton
              label="center"
              onClick={() => toast.info('Map center controls are available in map mode.')}
              icon={<MapPinned className="h-6 w-6" />}
            />
            <a href={navigateUrl} target="_blank" rel="noreferrer" className={cn(actionBaseClass, 'text-center')}>
              <Navigation className="h-6 w-6" />
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
    <div className="border-b border-[#c6c7cb] px-5 py-4">
      <p className="text-[20px] text-[#a2a3a8]">{label}</p>
      <p className={cn('mt-1 text-[21px] text-[#1d1f23]', strong ? 'font-medium' : '')}>{value || ' '}</p>
    </div>
  );
}

const actionBaseClass = 'flex flex-col items-center justify-center gap-1 text-[14px] font-medium';

function ActionButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={actionBaseClass}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
