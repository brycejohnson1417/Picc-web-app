'use client';

import type { ReactNode } from 'react';
import { Loader2, MapPinned, Navigation, PencilLine, RotateCw, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

type DetailTab = 'detail' | 'contacts' | 'history' | 'location';
type CheckInMode = 'written' | 'voice';

interface AssociatedContact {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
  status: string;
  linkedWork: string;
}

interface CheckInHistoryRow {
  id: string;
  url: string | null;
  title: string;
  createdTime: string;
  mode: CheckInMode | 'unknown';
  notePreview: string | null;
}

export function AccountDetailSheet({ store, onClose, onAddToRoute, routeSelected, onCenterOnMap }: AccountDetailSheetProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>('detail');
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<CheckInMode>('written');
  const [writtenDraft, setWrittenDraft] = useState('');
  const [savingMode, setSavingMode] = useState<CheckInMode | null>(null);
  const [refreshingAccount, setRefreshingAccount] = useState(false);

  useEffect(() => {
    setActiveTab('detail');
    setCheckInModalOpen(false);
    setDraftMode('written');
    setWrittenDraft('');
    setSavingMode(null);
  }, [store?.id]);

  const contactsQuery = useQuery({
    queryKey: ['account-associated-contacts', store?.notionPageId],
    enabled: Boolean(store?.notionPageId),
    queryFn: async () => {
      if (!store) return [] as AssociatedContact[];
      const response = await fetch(`/api/territory/account-contacts?storePageId=${encodeURIComponent(store.notionPageId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load associated contacts');
      }
      return (payload.contacts ?? []) as AssociatedContact[];
    },
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  const historyQuery = useQuery({
    queryKey: ['account-check-in-history', store?.notionPageId],
    enabled: Boolean(store?.notionPageId),
    queryFn: async () => {
      if (!store) return [] as CheckInHistoryRow[];
      const params = new URLSearchParams({
        storePageId: store.notionPageId,
        storeName: store.name,
        limit: '20',
      });
      const response = await fetch(`/api/territory/check-in?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load check-in history');
      }
      return (payload.history ?? []) as CheckInHistoryRow[];
    },
    staleTime: 15_000,
    placeholderData: (previousData) => previousData,
  });

  const lastCheckInText = useMemo(() => {
    const latest = historyQuery.data?.[0];
    if (!latest) return 'Not yet recorded';
    return new Date(latest.createdTime).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [historyQuery.data]);

  if (!store) {
    return null;
  }

  const currentStore = store;
  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${currentStore.lat},${currentStore.lng}`;
  const notionStoreUrl = `https://www.notion.so/${currentStore.notionPageId.replace(/-/g, '')}`;

  const fieldMap = new Map<string, { label: string; value: string }>();
  for (const field of currentStore.detailFields ?? []) {
    const key = field.label.trim().toLowerCase();
    if (!fieldMap.has(key) && field.value.trim()) {
      fieldMap.set(key, {
        label: field.label.trim(),
        value: field.value.trim(),
      });
    }
  }
  if (!fieldMap.has('account status')) {
    fieldMap.set('account status', {
      label: 'Account Status',
      value: currentStore.status,
    });
  }
  if (!fieldMap.has('picc rep') && !fieldMap.has('rep')) {
    fieldMap.set('picc rep', {
      label: 'PICC Rep',
      value: currentStore.repNames.join(', ') || 'Unassigned',
    });
  }

  const fields = [...fieldMap.values()];

  async function submitCheckIn(mode: CheckInMode) {
    if (mode === 'written' && !writtenDraft.trim()) {
      toast.error('Add a written note before saving');
      return;
    }

    setSavingMode(mode);
    try {
      const response = await fetch('/api/territory/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          noteText: mode === 'written' ? writtenDraft.trim() : undefined,
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

      if (mode === 'voice') {
        window.open(payload.url as string, '_blank', 'noopener,noreferrer');
        toast.success('Voice check-in opened in Notion');
      } else {
        toast.success('Written check-in saved');
      }

      setCheckInModalOpen(false);
      setWrittenDraft('');
      setActiveTab('history');
      await historyQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Check-in failed');
    } finally {
      setSavingMode(null);
    }
  }

  async function refreshAccountFromNotion() {
    setRefreshingAccount(true);
    try {
      const response = await fetch('/api/territory/account-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storePageId: currentStore.notionPageId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to refresh account');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['territory-mobile'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts-mobile'] }),
        queryClient.invalidateQueries({ queryKey: ['territory-stores'] }),
        queryClient.invalidateQueries({ queryKey: ['route-mobile-stores'] }),
      ]);
      toast.success('Account refreshed from Notion');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setRefreshingAccount(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[5000] bg-black/35">
      <div className="mx-auto flex h-full max-w-[480px] flex-col bg-[#e6e6e9]">
        <div className="bg-[#c93412] px-4 pb-2 pt-[max(10px,env(safe-area-inset-top))] text-white">
          <div className="relative flex items-center justify-between py-1.5">
            <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold">Account Details</h1>
            <a href={notionStoreUrl} target="_blank" rel="noreferrer" className="min-w-14 text-right text-[14px] font-medium">
              Open
            </a>
          </div>
          <SegmentedControl
            value={activeTab}
            onChange={(value) => setActiveTab(value as DetailTab)}
            options={[
              { value: 'detail', label: 'Detail' },
              { value: 'contacts', label: 'Contacts' },
              { value: 'history', label: 'Check-ins' },
              { value: 'location', label: 'Location' },
            ]}
            className="bg-[#d4d4d8]"
          />
        </div>

        <div className="border-y border-[#c6c7cb] bg-[#e6e6e9] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[24px] font-semibold text-[#111217]">{currentStore.name}</h2>
              <p className="mt-1 truncate text-[14px] text-[#8e9096]">{currentStore.locationAddress ?? currentStore.locationLabel ?? 'No address'}</p>
            </div>
            <button
              type="button"
              onClick={refreshAccountFromNotion}
              disabled={refreshingAccount}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#c6c7cc] bg-white px-2.5 text-[12px] font-semibold text-[#33363d] disabled:opacity-60"
            >
              {refreshingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          {activeTab === 'detail' ? (
            <>
              <DetailRow label="Last check-in" value={lastCheckInText} strong />
              {fields.map((field) => (
                <DetailRow key={`${field.label}-${field.value}`} label={field.label} value={field.value} strong={field.label === 'Account Status' || field.label === 'Account Owner'} />
              ))}
            </>
          ) : null}

          {activeTab === 'contacts' ? (
            <div className="p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#7b7e87]">Associated Contacts</p>
              {contactsQuery.isLoading ? <p className="text-[14px] text-[#686c74]">Loading contacts...</p> : null}
              {!contactsQuery.isLoading && (contactsQuery.data?.length ?? 0) === 0 ? (
                <p className="text-[14px] text-[#686c74]">No linked contacts found for this account.</p>
              ) : null}
              <div className="space-y-2 pb-20">
                {(contactsQuery.data ?? []).map((contact) => (
                  <div key={contact.id} className="rounded-lg border border-[#c9cbd1] bg-white px-3 py-2">
                    <p className="text-[15px] font-semibold text-[#1d1f23]">{contact.name}</p>
                    <p className="text-[12px] text-[#6c7077]">{contact.roleTitle || '—'} · {contact.status}</p>
                    <p className="mt-1 text-[12px] text-[#6c7077]">{contact.email !== '—' ? contact.email : contact.phone}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'history' ? (
            <div className="p-4">
              <div className="mb-3 rounded-xl border border-[#c9cbd1] bg-white p-3">
                <p className="text-[13px] font-semibold text-[#33363d]">New Check-in</p>
                <p className="mt-1 text-[12px] text-[#6f727a]">Choose written note or voice note. Both create a live Meeting Note in Notion.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="rounded-lg border border-[#c6c7cc] bg-white px-3 py-2 text-[13px] font-semibold text-[#2f3238]" onClick={() => { setDraftMode('written'); setCheckInModalOpen(true); }}>
                    Written note
                  </button>
                  <button type="button" className="rounded-lg bg-[#cd3814] px-3 py-2 text-[13px] font-semibold text-white" onClick={() => { setDraftMode('voice'); setCheckInModalOpen(true); }}>
                    Voice note
                  </button>
                </div>
              </div>

              {historyQuery.isLoading ? <p className="text-[14px] text-[#686c74]">Loading check-in history...</p> : null}
              {!historyQuery.isLoading && (historyQuery.data?.length ?? 0) === 0 ? <p className="text-[14px] text-[#686c74]">No check-ins recorded yet.</p> : null}

              <div className="space-y-2 pb-20">
                {(historyQuery.data ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-[#c9cbd1] bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[14px] font-semibold text-[#1d1f23]">{entry.title}</p>
                      <span className="rounded-full bg-[#edf0f6] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#4e5562]">{entry.mode}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#6c7077]">{new Date(entry.createdTime).toLocaleString()}</p>
                    {entry.notePreview ? <p className="mt-1 line-clamp-3 text-[13px] text-[#32353c]">{entry.notePreview}</p> : null}
                    {entry.url ? (
                      <a href={entry.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-[#3a7dd5]">
                        Open in Notion
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'location' ? (
            <div className="p-4 pb-24">
              <DetailCard label="Address" value={currentStore.locationAddress ?? currentStore.locationLabel ?? 'No address available'} />
              <DetailCard label="Coordinates" value={`${currentStore.lat.toFixed(6)}, ${currentStore.lng.toFixed(6)}`} />
              <DetailCard label="Location Source" value={currentStore.locationSource} />
              <a href={navigateUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[#cd3814] px-4 text-[14px] font-semibold text-white">
                Navigate in Google Maps
              </a>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-4 border-t border-[#c6c7cb] bg-[#f2f2f5] py-2 text-[#5a96e8]">
          <ActionButton
            label={routeSelected ? 'remove' : 'add to...'}
            onClick={() => onAddToRoute(currentStore.id)}
            icon={<MapPinned className="h-5 w-5" />}
          />
          <ActionButton
            label="check-in"
            onClick={() => {
              setDraftMode('written');
              setCheckInModalOpen(true);
            }}
            icon={<PencilLine className="h-5 w-5" />}
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

      {checkInModalOpen ? (
        <div className="absolute inset-0 grid place-items-end bg-black/35 p-4">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#d0d1d6] bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#1d1f23]">Create Check-in</h3>
              <button
                type="button"
                onClick={() => {
                  setCheckInModalOpen(false);
                  setWrittenDraft('');
                }}
                className="grid h-8 w-8 place-items-center rounded-full bg-[#f1f2f5] text-[#4f5562]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  'rounded-lg border px-3 py-2 text-[13px] font-semibold',
                  draftMode === 'written' ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#d0d2d8] bg-white text-[#2f3238]',
                )}
                onClick={() => setDraftMode('written')}
              >
                Written note
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-lg border px-3 py-2 text-[13px] font-semibold',
                  draftMode === 'voice' ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#d0d2d8] bg-white text-[#2f3238]',
                )}
                onClick={() => setDraftMode('voice')}
              >
                Voice note
              </button>
            </div>

            {draftMode === 'written' ? (
              <textarea
                value={writtenDraft}
                onChange={(event) => setWrittenDraft(event.target.value)}
                placeholder="Type check-in notes..."
                className="h-36 w-full resize-none rounded-lg border border-[#d0d2d8] px-3 py-2 text-[13px] text-[#1f2229] outline-none focus:border-[#cd3814]"
              />
            ) : (
              <div className="rounded-lg border border-[#d0d2d8] bg-[#f8f8fb] p-3 text-[13px] text-[#50545d]">
                This creates a meeting note and opens it in Notion so you can start instant voice transcription.
              </div>
            )}

            <button
              type="button"
              onClick={() => submitCheckIn(draftMode)}
              disabled={savingMode !== null}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#cd3814] text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {savingMode ? <Loader2 className="h-4 w-4 animate-spin" /> : draftMode === 'voice' ? <Users className="h-4 w-4" /> : null}
              {savingMode ? 'Creating...' : draftMode === 'voice' ? 'Create + Open Voice Note' : 'Save Written Check-in'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 rounded-lg border border-[#c9cbd1] bg-white px-3 py-2">
      <p className="text-[12px] text-[#8c9098]">{label}</p>
      <p className="mt-1 text-[14px] text-[#1d1f23]">{value}</p>
    </div>
  );
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="border-b border-[#c6c7cb] px-4 py-3">
      <p className="text-[12px] text-[#a2a3a8]">{label}</p>
      <p className={cn('mt-1 text-[15px] text-[#1d1f23]', strong ? 'font-medium' : '')}>{value || '—'}</p>
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
