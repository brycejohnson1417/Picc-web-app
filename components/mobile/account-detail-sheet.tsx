'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { MapPinned, Navigation, PencilLine, X } from 'lucide-react';
import { toast } from 'sonner';
import type { TerritoryStoreContact, TerritoryStoreDetailResponse, TerritoryStorePin } from '@/lib/territory/types';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { Button, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

type DetailTab = 'detail' | 'location' | 'notes' | 'history';
type CheckInMode = 'written' | 'voice';

function formatCheckInLabel(value: string | null | undefined) {
  if (!value) return 'No check-ins';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No check-ins';
  return date.toLocaleString();
}

function formatDateLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}

function cleanContactField(value: string | null | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—') return undefined;
  return trimmed;
}

interface AccountDetailSheetProps {
  store: TerritoryStorePin | null;
  onClose: () => void;
  onAddToRoute: (storeId: string) => void;
  routeSelected: boolean;
  onCenterStore?: (store: TerritoryStorePin) => void;
}

export function AccountDetailSheet({ store, onClose, onAddToRoute, routeSelected, onCenterStore }: AccountDetailSheetProps) {
  const [tab, setTab] = useState<DetailTab>('detail');
  const [detail, setDetail] = useState<TerritoryStoreDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInMode, setCheckInMode] = useState<CheckInMode>('written');
  const [checkInDraft, setCheckInDraft] = useState('');
  const [checkInContact, setCheckInContact] = useState<TerritoryStoreContact | null>(null);

  useEffect(() => {
    if (!store) {
      setDetail(null);
      setNotesDraft('');
      setCheckInModalOpen(false);
      setCheckInMode('written');
      setCheckInDraft('');
      setCheckInContact(null);
      return;
    }

    setTab('detail');
    setCheckInModalOpen(false);
    setCheckInMode('written');
    setCheckInDraft('');
    setCheckInContact(null);

    const controller = new AbortController();

    const loadDetail = async () => {
      setLoadingDetail(true);
      try {
        const response = await fetch(`/api/territory/stores/${store.id}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Failed to load account detail');
        }

        const payload = (await response.json()) as TerritoryStoreDetailResponse;
        setDetail(payload);
        setNotesDraft(payload.store.notes ?? '');
      } catch (error) {
        if (controller.signal.aborted) return;
        setDetail(null);
        setNotesDraft(store.notes ?? '');
        toast.error(error instanceof Error ? error.message : 'Failed to load account detail');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
        }
      }
    };

    void loadDetail();

    return () => controller.abort();
  }, [store]);

  if (!store) {
    return null;
  }

  const activeStore = detail?.store ?? store;
  const contacts = detail?.contacts ?? [];
  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${activeStore.lat},${activeStore.lng}`;
  const notionUrl = `https://www.notion.so/${activeStore.notionPageId.replace(/-/g, '')}`;
  const persistedNotes = (detail?.store.notes ?? store.notes ?? '').trim();
  const canSaveNotes = notesDraft.trim() !== persistedNotes;

  function openCheckInModal(contact: TerritoryStoreContact | null = null) {
    setCheckInContact(contact);
    setCheckInMode('written');
    setCheckInDraft('');
    setCheckInModalOpen(true);
  }

  async function handleCheckInSubmit() {
    setCheckingIn(true);
    try {
      const response = await fetch('/api/territory/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: {
            id: activeStore.id,
            name: activeStore.name,
            notionPageId: activeStore.notionPageId,
            lat: activeStore.lat,
            lng: activeStore.lng,
            address: activeStore.locationAddress ?? activeStore.locationLabel ?? undefined,
            repName: activeStore.repNames[0] ?? null,
          },
          mode: checkInMode,
          noteText: cleanContactField(checkInDraft),
          associatedContact: checkInContact
            ? {
                id: checkInContact.id,
                name: checkInContact.name,
                roleTitle: cleanContactField(checkInContact.roleTitle),
                email: cleanContactField(checkInContact.email),
                phone: cleanContactField(checkInContact.phone),
              }
            : undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to create check-in');
      }

      const checkedInAt = typeof payload?.checkedInAt === 'string' ? payload.checkedInAt : new Date().toISOString();

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          store: {
            ...prev.store,
            lastCheckIn: checkedInAt,
            lastEditedTime: checkedInAt,
          },
        };
      });

      if (checkInMode === 'voice' && typeof payload?.url === 'string') {
        window.open(payload.url, '_blank', 'noopener,noreferrer');
      }

      const contactLabel = checkInContact ? ` with ${checkInContact.name}` : '';
      toast.success(`${checkInMode === 'voice' ? 'Voice' : 'Written'} check-in saved${contactLabel}`);
      setCheckInModalOpen(false);
      setCheckInContact(null);
      setCheckInDraft('');
      setCheckInMode('written');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create check-in');
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleSaveNotes() {
    if (!canSaveNotes) return;

    setSavingNotes(true);
    try {
      const response = await fetch(`/api/territory/stores/${activeStore.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to save notes');
      }

      const updatedAt = typeof payload?.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString();
      const nextNotes = typeof payload?.notes === 'string' ? payload.notes : notesDraft.trim();

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          store: {
            ...prev.store,
            notes: nextNotes,
            lastEditedTime: updatedAt,
          },
        };
      });

      setNotesDraft(nextNotes);
      toast.success('Notes synced to Notion');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  }

  function handleCenter() {
    if (onCenterStore) {
      onCenterStore(activeStore);
      onClose();
      return;
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${activeStore.lat},${activeStore.lng}`, '_blank', 'noopener,noreferrer');
  }

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
            <button type="button" onClick={() => window.open(notionUrl, '_blank', 'noopener,noreferrer')} className="min-w-14 text-right text-[24px]" aria-label="Open account in Notion">
              Edit
            </button>
          </div>
          <SegmentedControl
            value={tab}
            onChange={(value) => setTab(value as DetailTab)}
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
          <div className="border-y border-[#c6c7cb] bg-[#e6e6e9] px-5 py-6">
            <h2 className="text-[50px] font-medium text-[#111217]">{activeStore.name}</h2>
            <p className="text-[34px] text-[#8e9096]">{activeStore.locationAddress ?? activeStore.locationLabel ?? 'No address'}</p>
            {loadingDetail ? <p className="mt-2 text-[15px] text-[#6e7078]">Syncing account details...</p> : null}
          </div>

          {tab === 'detail' ? (
            <>
              <DetailRow label="Phone" value={activeStore.phoneNumber || 'No phone on file'} />
              <DetailRow label="Email" value={activeStore.email || activeStore.repEmails[0] || 'No email on file'} />
              <DetailRow label="Last check-in" value={formatCheckInLabel(activeStore.lastCheckIn)} strong />
              <DetailRow label="Follow-up Date" value={formatDateLabel(activeStore.followUpDate, 'No follow-up set')} />
              <DetailRow label="Account Owner" value={activeStore.repNames[0] ?? 'Unassigned'} strong />
              <DetailRow label="Account Status" value={activeStore.status} strong />
              <DetailRow label="PICC Rep" value={activeStore.repNames.join(', ') || '—'} />
              <DetailRow label="License" value={activeStore.licenseNumber ?? '—'} />

              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[20px] text-[#a2a3a8]">Associated Contacts</p>
                {contacts.length === 0 ? <p className="mt-1 text-[21px] text-[#1d1f23]">No contacts linked.</p> : null}
                {contacts.map((contact) => (
                  <div key={contact.id} className="mt-2 rounded-lg border border-[#c7c8cd] bg-[#f3f3f6] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/contacts/${encodeURIComponent(contact.id)}`} className="text-[19px] font-medium text-[#1f4e9f] underline-offset-2 hover:underline">
                        {contact.name}
                      </Link>
                      <button
                        type="button"
                        className="rounded-md border border-[#b4b7bf] px-2.5 py-1 text-[13px] font-medium text-[#27303f] hover:bg-[#e8eaf0]"
                        onClick={() => openCheckInModal(contact)}
                        disabled={checkingIn}
                      >
                        Check-in
                      </button>
                    </div>
                    <p className="text-[16px] text-[#5e6169]">{contact.roleTitle || '—'}</p>
                    <p className="text-[16px] text-[#5e6169]">{contact.email || '—'} · {contact.phone || '—'}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {tab === 'location' ? (
            <>
              <DetailRow label="Address" value={activeStore.locationAddress ?? activeStore.locationLabel ?? 'No address'} strong />
              <DetailRow label="Coordinates" value={`${activeStore.lat.toFixed(5)}, ${activeStore.lng.toFixed(5)}`} />
              <DetailRow label="City / State" value={activeStore.city && activeStore.state ? `${activeStore.city}, ${activeStore.state}` : 'Not available'} />
              <DetailRow label="Location Source" value={activeStore.locationSource} />
            </>
          ) : null}

          {tab === 'notes' ? (
            <div className="border-b border-[#c6c7cb] px-5 py-5 text-[#5f6269]">
              <p className="text-[22px] font-medium text-[#1d1f23]">Account Notes</p>
              <p className="mt-1 text-[17px]">Notes save directly to Notion.</p>
              <Textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                className="mt-3 min-h-[160px] bg-white text-[18px]"
                placeholder="Add visit notes, next steps, or key blockers..."
              />
              <Button type="button" className="mt-3 h-11 px-5" onClick={handleSaveNotes} disabled={!canSaveNotes || savingNotes}>
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </Button>
            </div>
          ) : null}

          {tab === 'history' ? (
            <>
              <DetailRow label="Last edited" value={new Date(activeStore.lastEditedTime).toLocaleString()} />
              <DetailRow label="Last check-in" value={formatCheckInLabel(activeStore.lastCheckIn)} strong />
              <DetailRow label="Route status" value={routeSelected ? 'In current route' : 'Not in current route'} />
              <DetailRow label="Sync source" value="Notion live cache" />
            </>
          ) : null}
        </div>

        {checkInModalOpen ? (
          <div className="fixed inset-0 z-[5200] bg-black/40" onClick={() => !checkingIn && setCheckInModalOpen(false)}>
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[480px] rounded-t-2xl bg-[#f8f8fb] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[20px] font-semibold text-[#1d1f23]">Create Check-in</h3>
                  <p className="text-[14px] text-[#5f6269]">
                    {checkInContact ? `${checkInContact.name} · ${activeStore.name}` : activeStore.name}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-[#5f6269] hover:bg-[#ececf1]"
                  onClick={() => setCheckInModalOpen(false)}
                  disabled={checkingIn}
                  aria-label="Close check-in modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium',
                    checkInMode === 'written' ? 'border-[#1f4e9f] bg-[#dce8ff] text-[#123a7c]' : 'border-[#c3c5cc] bg-white text-[#3f4249]',
                  )}
                  onClick={() => setCheckInMode('written')}
                  disabled={checkingIn}
                >
                  Written
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium',
                    checkInMode === 'voice' ? 'border-[#1f4e9f] bg-[#dce8ff] text-[#123a7c]' : 'border-[#c3c5cc] bg-white text-[#3f4249]',
                  )}
                  onClick={() => setCheckInMode('voice')}
                  disabled={checkingIn}
                >
                  Voice
                </button>
              </div>

              {checkInMode === 'written' ? (
                <div className="mt-3">
                  <Textarea
                    value={checkInDraft}
                    onChange={(event) => setCheckInDraft(event.target.value)}
                    className="min-h-[130px] bg-white text-[16px]"
                    placeholder={
                      checkInContact
                        ? `Capture notes from your check-in with ${checkInContact.name}...`
                        : 'Capture notes from this check-in...'
                    }
                  />
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-[#cfd2d9] bg-white px-3 py-2 text-[14px] text-[#5f6269]">
                  A voice check-in note will open in Notion so you can capture details quickly.
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" className="h-11" onClick={() => setCheckInModalOpen(false)} disabled={checkingIn}>
                  Cancel
                </Button>
                <Button type="button" className="h-11" onClick={handleCheckInSubmit} disabled={checkingIn}>
                  {checkingIn ? 'Saving...' : checkInMode === 'voice' ? 'Start Voice' : 'Save Check-in'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="fixed bottom-[92px] left-0 right-0 z-[5100]">
          <div className="mx-auto grid max-w-[480px] grid-cols-4 border-t border-[#c6c7cb] bg-[#f2f2f5] py-3 text-[#5a96e8]">
            <ActionButton label={routeSelected ? 'remove' : 'add to...'} onClick={() => onAddToRoute(activeStore.id)} icon={<MapPinned className="h-6 w-6" />} />
            <ActionButton label={checkingIn ? 'saving...' : 'check-in'} onClick={() => openCheckInModal()} icon={<PencilLine className="h-6 w-6" />} disabled={checkingIn} />
            <ActionButton label="center" onClick={handleCenter} icon={<MapPinned className="h-6 w-6" />} />
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

function ActionButton({ label, icon, onClick, disabled = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn(actionBaseClass, disabled ? 'opacity-60' : '')} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
