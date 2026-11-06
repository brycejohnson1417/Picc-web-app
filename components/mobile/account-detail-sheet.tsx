'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Copy, ExternalLink, MapPinned, Navigation, PencilLine, PhoneCall, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { ContactCreateFlow } from '@/components/crm/contact-create-flow';
import { ContactQuickActions } from '@/components/crm/contact-quick-actions';
import { GmailConversations } from '@/components/crm/gmail-conversations';
import { StoreSalesContextPanel } from '@/components/crm/store-sales-context';
import type { StoreSalesContext } from '@/lib/proposals/store-opportunities';
import { DistruProposalPanel } from '@/components/crm/distru-proposal-panel';
import { NotionOptionChip } from '@/components/shared/notion-option-chip';
import { Button, Textarea } from '@/components/ui';
import { getContactEmailDeliveryStatus, type ContactEmailDeliveryFields } from '@/lib/contacts/email-delivery-status';
import type { RuntimeFreshness } from '@/lib/runtime/account-contact-contract';
import { getAccountUpdateVersion, notifyAccountUpdated } from '@/lib/territory/account-cache-events';
import type { TerritoryStoreContact, TerritoryStoreDetailResponse, TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

type StoreDetailContact = TerritoryStoreContact & ContactEmailDeliveryFields;
type AccountDetailResponse = Omit<TerritoryStoreDetailResponse, 'contacts'> & {
  contacts: StoreDetailContact[];
  salesContext?: StoreSalesContext;
  history: TerritoryStoreDetailResponse['history'] & { availability?: 'available' | 'unavailable' };
};

type DetailTab = 'detail' | 'location' | 'proposal' | 'orders' | 'history';
const STORE_DETAIL_CACHE_PREFIX = 'territory-store-detail:';
const STORE_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;

type StoreDetailCacheEntry = {
  fetchedAt: number;
  updateVersion?: number;
  detail: AccountDetailResponse;
};

type HistoryEntry = {
  id: string;
  occurredAt: string;
  title: string;
  description: string | null;
  badge: string;
};

const storeDetailMemoryCache = new Map<string, StoreDetailCacheEntry>();

function formatCheckInLabel(value: string | null | undefined) {
  if (!value) return 'No check-ins';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No check-ins';
  return date.toLocaleString();
}

function formatCheckInModeLabel(value: 'written' | 'voice' | 'unknown') {
  if (value === 'voice') return 'Voice';
  if (value === 'written') return 'Written';
  return 'Comment';
}

function formatDateLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}

function formatDateTimeLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function cleanContactField(value: string | null | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—') return undefined;
  return trimmed;
}

function toDialablePhone(value: string | null | undefined) {
  const trimmed = cleanContactField(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^+\d]/g, '');
  return normalized.length > 0 ? normalized : null;
}

function readCachedStoreDetail(storeId: string) {
  const updateVersion = getAccountUpdateVersion(storeId);
  const memoryValue = storeDetailMemoryCache.get(storeId);
  if (memoryValue && (memoryValue.updateVersion ?? 0) >= updateVersion) {
    return {
      detail: memoryValue.detail,
      isFresh: Date.now() - memoryValue.fetchedAt < STORE_DETAIL_CACHE_TTL_MS,
    };
  }
  if (memoryValue) storeDetailMemoryCache.delete(storeId);

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${STORE_DETAIL_CACHE_PREFIX}${storeId}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoreDetailCacheEntry | AccountDetailResponse;
    const entry: StoreDetailCacheEntry =
      'detail' in parsed
        ? parsed
        : {
            detail: parsed,
            fetchedAt: 0,
          };

    if (entry.detail?.store?.id !== storeId || (entry.updateVersion ?? 0) < updateVersion) {
      window.sessionStorage.removeItem(`${STORE_DETAIL_CACHE_PREFIX}${storeId}`);
      return null;
    }

    storeDetailMemoryCache.set(storeId, entry);
    return {
      detail: entry.detail,
      isFresh: Date.now() - entry.fetchedAt < STORE_DETAIL_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

function writeCachedStoreDetail(detail: AccountDetailResponse) {
  const entry = {
    detail,
    fetchedAt: Date.now(),
    updateVersion: getAccountUpdateVersion(detail.store.id),
  };
  storeDetailMemoryCache.set(detail.store.id, entry);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(`${STORE_DETAIL_CACHE_PREFIX}${detail.store.id}`, JSON.stringify(entry));
  } catch {
    // Ignore storage failures and keep the in-memory cache hot.
  }
}

interface AccountDetailSheetProps {
  includeAccountEmail?: boolean;
  store: TerritoryStorePin | null;
  onClose: () => void;
  onAddToRoute: (storeId: string) => void;
  routeSelected: boolean;
  onCenterStore?: (store: TerritoryStorePin) => void;
  accountFreshness?: RuntimeFreshness | null;
  presentation?: 'overlay' | 'docked';
}

export function AccountDetailSheet({ store, onClose, onAddToRoute, routeSelected, onCenterStore, accountFreshness, includeAccountEmail = false, presentation = 'overlay' }: AccountDetailSheetProps) {
  const appAccess = useAppAccess();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('detail');
  const [proposalProductId, setProposalProductId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountDetailResponse | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInDraft, setCheckInDraft] = useState('');
  const [checkInFollowUpDateDraft, setCheckInFollowUpDateDraft] = useState('');
  const [checkInFollowUpNeededDraft, setCheckInFollowUpNeededDraft] = useState<boolean | null>(null);
  const [checkInFollowUpReasonDraft, setCheckInFollowUpReasonDraft] = useState('');
  const [checkInContact, setCheckInContact] = useState<TerritoryStoreContact | null>(null);
  const [streetViewLoadError, setStreetViewLoadError] = useState(false);

  const selectedStoreId = store?.id;
  const selectedStoreIdRef = useRef(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;

  useEffect(() => {
    setTab('detail');
    setProposalProductId(null);
    setCheckInModalOpen(false);
    setCheckInDraft('');
    setCheckInFollowUpDateDraft('');
    setCheckInFollowUpNeededDraft(null);
    setCheckInFollowUpReasonDraft('');
    setCheckInContact(null);
    setStreetViewLoadError(false);
  }, [selectedStoreId]);

  useEffect(() => {
    const handleAccountUpdated = (event: Event) => {
      const storeId = (event as CustomEvent<{ storeId?: string }>).detail?.storeId;
      if (!storeId) return;
      storeDetailMemoryCache.delete(storeId);
      try {
        window.sessionStorage.removeItem(`${STORE_DETAIL_CACHE_PREFIX}${storeId}`);
      } catch {
        // The memory cache is still invalidated when session storage is unavailable.
      }
      if (storeId === selectedStoreId) setDetailRevision((revision) => revision + 1);
    };
    window.addEventListener('picc:account-updated', handleAccountUpdated);
    return () => window.removeEventListener('picc:account-updated', handleAccountUpdated);
  }, [selectedStoreId]);

  useEffect(() => {
    if (!store) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }

    const cachedDetail = readCachedStoreDetail(store.id);
    setDetail((previous) => cachedDetail?.detail ?? (previous?.store.id === store.id ? previous : null));

    if (cachedDetail?.isFresh) {
      setLoadingDetail(false);
      return;
    }

    const controller = new AbortController();

    const loadDetail = async () => {
      setLoadingDetail(true);
      try {
        const response = await fetch(`/api/territory/stores/${store.id}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? 'Failed to load account detail');
        }

        const payload = (await response.json()) as AccountDetailResponse;
        if (controller.signal.aborted) return;
        setDetail(payload);
        writeCachedStoreDetail(payload);

        const liveRepSignature = payload.store.repNames.join('|');
        const visibleRepSignature = store.repNames.join('|');
        if (
          liveRepSignature !== visibleRepSignature ||
          payload.store.status !== store.status ||
          payload.store.vendorDayStatus !== store.vendorDayStatus
        ) {
          void queryClient.invalidateQueries({ queryKey: ['territory-mobile'] });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!cachedDetail) {
          setDetail(null);
        }
        toast.error(error instanceof Error ? error.message : 'Failed to load account detail');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
        }
      }
    };

    void loadDetail();

    return () => controller.abort();
  }, [queryClient, store, detailRevision]);

  useEffect(() => {
    if (!store) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (checkInModalOpen) {
        if (!checkingIn) setCheckInModalOpen(false);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [store, onClose, checkInModalOpen, checkingIn]);

  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const entries: HistoryEntry[] = [];

    for (const checkIn of detail?.checkIns ?? []) {
      entries.push({
        id: `check-in-${checkIn.source}-${checkIn.id}`,
        occurredAt: checkIn.happenedAt,
        title: `${formatCheckInModeLabel(checkIn.mode)} check-in`,
        description: checkIn.notePreview || 'No notes captured.',
        badge: checkIn.createdByLabel ? `${checkIn.createdByLabel}` : 'Check-in',
      });
    }

    for (const update of detail?.history.accountUpdates ?? []) {
      entries.push({
        id: `activity-${update.id}`,
        occurredAt: update.createdAt,
        title: update.title,
        description: update.description,
        badge: 'Update',
      });
    }

    return entries.sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
  }, [detail?.checkIns, detail?.history.accountUpdates]);

  if (!store) {
    return null;
  }

  const activeStore = detail?.store ?? store;
  const contacts = detail?.contacts ?? [];
  const crm = detail?.crm;
  const primaryEmailRestriction = contacts.find((contact) =>
    Boolean(crm?.contactEmail) && contact.email.trim().toLowerCase() === crm?.contactEmail?.trim().toLowerCase() && getContactEmailDeliveryStatus(contact).blocked,
  );
  const hasCoordinates = activeStore.locationPrecision !== 'unavailable' && Number.isFinite(activeStore.lat) && Number.isFinite(activeStore.lng);
  const addressValue = activeStore.locationAddress ?? activeStore.locationLabel ?? '';
  const destination = hasCoordinates ? `${activeStore.lat},${activeStore.lng}` : addressValue;
  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  const notionUrl = `https://www.notion.so/${activeStore.notionPageId.replace(/-/g, '')}`;
  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${activeStore.lat},${activeStore.lng}`;
  const streetViewPreviewUrl = `https://maps.googleapis.com/maps/api/streetview?size=900x420&location=${activeStore.lat},${activeStore.lng}&fov=85&pitch=0`;
  const followUpDateLabel = formatDateLabel(activeStore.followUpDate, '');
  const followUpReasonLabel = (activeStore.followUpReason?.trim() || '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
  const hasActiveFollowUp = activeStore.followUpNeeded !== false && Boolean(activeStore.followUpDate || activeStore.followUpReason);
  const orderHistory = detail?.analytics.orders ?? detail?.analytics.recentOrders ?? [];
  const activeContacts = contacts.filter((contact) => contact.status !== 'INACTIVE');
  const otherContacts = contacts.filter((contact) => contact.status === 'INACTIVE');
  const overviewFields = [
    ['Sales rep', crm?.rep || activeStore.repNames.join(', ')],
    ['Account manager', crm?.accountManager],
    ['Credit', crm?.piccCreditStatus],
    ['Last contacted', crm?.lastContacted ? formatDateLabel(crm.lastContacted, '') : null],
    ['Last check-in', activeStore.lastCheckIn ? formatDateTimeLabel(activeStore.lastCheckIn, '') : null],
    ['Last sample', crm?.lastSampleOrderDate ? formatDateLabel(crm.lastSampleOrderDate, '') : null],
    ['Last order', crm?.lastOrderDate ? formatDateLabel(crm.lastOrderDate, '') : null],
    ['Last order amount', typeof crm?.lastOrderAmount === 'number' ? formatCurrency(crm.lastOrderAmount) : null],
    ['Referral', crm?.referralSource],
    ['Customer since', crm?.customerSince ? formatDateLabel(crm.customerSince, '') : null],
    ['License', activeStore.licenseNumber],
    ['Products', crm?.productTracking],
    ['Displays', crm?.displayTracking],
    ['Previous follow-up date', activeStore.followUpNeeded === false && activeStore.followUpDate ? formatDateLabel(activeStore.followUpDate, '') : null],
    ['Previous follow-up', activeStore.followUpNeeded === false ? followUpReasonLabel : null],
  ].filter((field): field is [string, string] => typeof field[1] === 'string' && Boolean(field[1].trim()));

  const persistedFollowUpDate = (activeStore.followUpDate ?? '').slice(0, 10);
  const persistedFollowUpNeeded = typeof activeStore.followUpNeeded === 'boolean' ? activeStore.followUpNeeded : null;
  const persistedFollowUpReason = (activeStore.followUpReason ?? '').trim();
  const normalizedCheckInNote = cleanContactField(checkInDraft) ?? '';
  const normalizedCheckInFollowUpDate = checkInFollowUpDateDraft.trim();
  const normalizedCheckInFollowUpReason = checkInFollowUpReasonDraft.trim();
  const checkInFollowUpChanged =
    normalizedCheckInFollowUpDate !== persistedFollowUpDate ||
    checkInFollowUpNeededDraft !== persistedFollowUpNeeded ||
    normalizedCheckInFollowUpReason !== persistedFollowUpReason;
  const canSubmitCheckIn = Boolean(normalizedCheckInNote || checkInFollowUpChanged);

  async function refreshDetailFromServer(storeId: string) {
    const response = await fetch(`/api/territory/stores/${storeId}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? 'Failed to refresh account detail');
    }

    const payload = (await response.json()) as AccountDetailResponse;
    if (selectedStoreIdRef.current === storeId) setDetail(payload);
    writeCachedStoreDetail(payload);
    return payload;
  }

  async function copyAddress() {
    if (!addressValue || addressValue === 'No address') {
      toast.message('No address available to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(addressValue);
      toast.success('Address copied');
    } catch {
      toast.error('Unable to copy address');
    }
  }

  function launchDial(value: string | null | undefined, fallbackLabel: string) {
    const dialable = toDialablePhone(value);
    if (!dialable) {
      toast.error(`No phone available for ${fallbackLabel}.`);
      return;
    }
    window.location.href = `tel:${dialable}`;
  }

  function callStore() {
    launchDial(activeStore.phoneNumber, activeStore.name);
  }

  function openCheckInModal(contact: TerritoryStoreContact | null = null) {
    if (!appAccess.canEdit) {
      toast.message('Guest access is read-only. Check-ins are disabled.');
      return;
    }

    setCheckInContact(contact);
    setCheckInDraft('');
    setCheckInFollowUpDateDraft(persistedFollowUpDate);
    setCheckInFollowUpNeededDraft(persistedFollowUpNeeded);
    setCheckInFollowUpReasonDraft(persistedFollowUpReason);
    setCheckInModalOpen(true);
  }

  async function handleCheckInSubmit() {
    if (!appAccess.canEdit || !canSubmitCheckIn) return;

    setCheckingIn(true);
    try {
      const followUpOnly = !normalizedCheckInNote && checkInFollowUpChanged;
      const response = await fetch(followUpOnly ? `/api/territory/stores/${activeStore.id}` : '/api/territory/check-in', {
        method: followUpOnly ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followUpOnly ? {
          followUpDate: normalizedCheckInFollowUpDate || null,
          followUpNeeded: checkInFollowUpNeededDraft,
          followUpReason: normalizedCheckInFollowUpReason || null,
        } : {
          store: {
            id: activeStore.id,
            name: activeStore.name,
            notionPageId: activeStore.notionPageId,
            lat: activeStore.lat,
            lng: activeStore.lng,
            address: activeStore.locationAddress ?? activeStore.locationLabel ?? undefined,
            repName: activeStore.repNames[0] ?? null,
          },
          noteText: normalizedCheckInNote || undefined,
          ...(checkInFollowUpChanged
            ? {
                followUpDate: normalizedCheckInFollowUpDate || null,
                followUpNeeded: checkInFollowUpNeededDraft,
                followUpReason: normalizedCheckInFollowUpReason || null,
              }
            : {}),
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

      try {
        await refreshDetailFromServer(activeStore.id);
      } catch {
        setDetail((previousDetail) => {
          if (!previousDetail || previousDetail.store.id !== activeStore.id) return previousDetail;
          const checkedInAt = !followUpOnly && typeof payload?.checkedInAt === 'string' ? payload.checkedInAt : null;
          const nextDetail = {
            ...previousDetail,
            store: {
              ...previousDetail.store,
              lastCheckIn: checkedInAt ?? previousDetail.store.lastCheckIn,
              lastEditedTime: checkedInAt ?? previousDetail.store.lastEditedTime,
              followUpDate:
                typeof payload?.followUpDate === 'string'
                  ? payload.followUpDate
                  : payload?.followUpDate === null
                    ? null
                    : previousDetail.store.followUpDate,
              followUpNeeded:
                typeof payload?.followUpNeeded === 'boolean'
                  ? payload.followUpNeeded
                  : payload?.followUpNeeded === null
                    ? null
                    : previousDetail.store.followUpNeeded,
              followUpReason:
                typeof payload?.followUpReason === 'string'
                  ? payload.followUpReason
                  : payload?.followUpReason === null
                    ? null
                    : previousDetail.store.followUpReason,
            },
          };
          writeCachedStoreDetail(nextDetail);
          return nextDetail;
        });
      }

      if (typeof payload?.syncWarning === 'string' && payload.syncWarning) {
        toast.warning(payload.syncWarning);
      }

      void queryClient.invalidateQueries({ queryKey: ['territory-mobile'] });
      notifyAccountUpdated(activeStore.id);

      const contactLabelSuffix = checkInContact ? ` with ${checkInContact.name}` : '';
      toast.success(normalizedCheckInNote ? `Note saved${contactLabelSuffix}` : 'Follow-up saved');
      if (selectedStoreIdRef.current !== activeStore.id) return;
      setCheckInModalOpen(false);
      setCheckInContact(null);
      setCheckInDraft('');
      setCheckInFollowUpDateDraft('');
      setCheckInFollowUpNeededDraft(null);
      setCheckInFollowUpReasonDraft('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create check-in');
    } finally {
      setCheckingIn(false);
    }
  }

  function handleCenter() {
    if (onCenterStore) {
      onCenterStore(activeStore);
      if (presentation !== 'docked' || !window.matchMedia('(min-width: 1024px)').matches) onClose();
      return;
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${activeStore.lat},${activeStore.lng}`, '_blank', 'noopener,noreferrer');
  }

  const renderContact = (contact: StoreDetailContact) => {
    const emailStatus = getContactEmailDeliveryStatus(contact);
    return (
    <div key={contact.id} className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/contacts/${encodeURIComponent(contact.id)}`} className="text-sm font-semibold text-[#252724] underline-offset-4 hover:underline">
            {contact.name}
          </Link>
          {contact.roleTitle ? <p className="mt-0.5 text-xs text-[#74766f]">{contact.roleTitle}</p> : null}
          {contact.status === 'INACTIVE' ? <p className="mt-0.5 text-xs text-[#74766f]">Archived</p> : null}
        </div>
        {appAccess.canEdit ? (
          <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#74766f] hover:bg-[#f2f2ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c93412]" aria-label={`Add note for ${contact.name}`} onClick={() => openCheckInModal(contact)} disabled={checkingIn}>
            <PencilLine className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {contact.email ? <p className="mt-1 break-all text-xs text-[#74766f]">{contact.email}</p> : null}
      {contact.phone ? <p className="mt-0.5 text-xs tabular-nums text-[#74766f]">{contact.phone}</p> : null}
      {emailStatus.labels.length ? <p className={cn('mt-1 text-[10px] leading-relaxed', emailStatus.blocked ? 'text-[#a7321b]' : 'text-[#8a8d84]')}>Email: {emailStatus.labels.join(' · ')}</p> : null}
      <ContactQuickActions contact={emailStatus.blocked ? { ...contact, email: '' } : contact} accounts={[{ id: activeStore.notionPageId, name: activeStore.name }]} className="mt-2 [&_a]:h-8 [&_a]:min-w-8 [&_a]:rounded-md [&_a]:px-2 [&_a_span]:inline [&_a_span]:text-xs" />
    </div>
  );
  };

  return (
    <div className={cn(
      'fixed inset-x-0 top-0 bottom-[var(--picc-bottom-nav-clearance)] z-[5000] bg-[#20231f]/35',
      presentation === 'docked' && 'lg:absolute lg:inset-x-auto lg:bottom-0 lg:left-0 lg:top-14 lg:z-[2000] lg:w-[396px] lg:bg-transparent',
    )}>
      <section className="mx-auto flex h-full min-h-0 w-full max-w-[720px] flex-col border-r border-[#e5e6e1] bg-[#fdfdfb] text-[#252724]" aria-label={`Store brief: ${activeStore.name}`}>
        <header className="shrink-0 border-b border-[#e5e6e1] px-5 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={onClose} className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-[#74766f] hover:text-[#252724] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c93412]">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to accounts
            </button>
            <a href={notionUrl} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-md text-[#74766f] hover:bg-[#f2f2ef]" aria-label="Open account in Notion">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <h2 className="text-[21px] font-semibold leading-tight">{activeStore.name}</h2>
          {addressValue ? <button type="button" onClick={() => setTab('location')} className="mt-1.5 block text-left text-xs leading-relaxed text-[#74766f] hover:text-[#252724]">{addressValue}</button> : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <NotionOptionChip label={crm?.accountStatus || activeStore.status} colorName={crm?.accountStatusColorName ?? activeStore.statusColorName} fallbackHex={activeStore.statusColor} />
            {(crm?.pppStatus || activeStore.pppStatus) ? <NotionOptionChip label={crm?.pppStatus || activeStore.pppStatus || ''} colorName={crm?.pppStatusColorName ?? activeStore.pppStatusColorName} /> : null}
          </div>
          <div className="-mx-1 mt-4 flex items-center gap-0.5 overflow-x-auto" role="tablist" aria-label="Account sections">
            {([
              ['detail', 'Overview'],
              ['orders', 'Orders'],
              ['history', 'Activity'],
              ['location', 'Location'],
              ['proposal', 'Proposal'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn('min-h-10 shrink-0 border-b-2 px-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c93412]', tab === value ? 'border-[#c93412] text-[#252724]' : 'border-transparent text-[#74766f] hover:text-[#252724]')}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingDetail && !detail ? <div className="space-y-3 p-5" aria-label="Loading account"><div className="h-4 w-24 animate-pulse rounded bg-[#eeefea]" /><div className="h-10 animate-pulse rounded bg-[#eeefea]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[#eeefea]" /></div> : null}
          {tab === 'detail' ? (
            <>
              <div className="border-b border-[#e5e6e1] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-[#74766f]">Next action</h3>
                  {appAccess.canEdit ? <button type="button" onClick={() => {
                    openCheckInModal();
                    if (!hasActiveFollowUp) {
                      setCheckInFollowUpDateDraft('');
                      setCheckInFollowUpNeededDraft(true);
                      setCheckInFollowUpReasonDraft('');
                    }
                  }} className="text-xs font-medium text-[#a7321b] hover:underline">{hasActiveFollowUp ? 'Edit' : 'Set follow-up'}</button> : null}
                </div>
                {hasActiveFollowUp && followUpReasonLabel ? <p className="mt-2 text-sm font-medium leading-relaxed">{followUpReasonLabel}</p> : null}
                {hasActiveFollowUp && followUpDateLabel ? <p className={cn('mt-1.5 text-xs tabular-nums', activeStore.followUpDate && activeStore.followUpDate.slice(0, 10) < new Date().toLocaleDateString('en-CA') ? 'text-[#a7321b]' : 'text-[#74766f]')}>{followUpDateLabel}</p> : null}
              </div>

              {detail?.salesContext ? <StoreSalesContextPanel context={detail.salesContext} onSelectProduct={(productId) => { setProposalProductId(productId); setTab('proposal'); }} /> : null}

              <div className="border-b border-[#e5e6e1] px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-[#74766f]">Contacts{contacts.length ? <span className="ml-1.5 tabular-nums text-[#a0a199]">{contacts.length}</span> : null}</h3>
                  {appAccess.canEdit ? <ContactCreateFlow triggerVariant="compact" accounts={[{ notionPageId: activeStore.notionPageId, name: activeStore.name, city: activeStore.city ?? null, state: activeStore.state ?? null }]} /> : null}
                </div>
                <div className="divide-y divide-[#eeefea]">{activeContacts.slice(0, 2).map(renderContact)}</div>
                {!activeContacts.length && crm?.contact ? (
                  <div className="py-3">
                    <p className="text-sm font-medium">{crm.contact}</p>
                    {crm.contactEmail ? primaryEmailRestriction ? <><p className="mt-1 break-all text-xs text-[#74766f]">{crm.contactEmail}</p><p className="mt-1 text-[10px] text-[#a7321b]">Email: {getContactEmailDeliveryStatus(primaryEmailRestriction).labels.join(' · ')}</p></> : <a href={`mailto:${crm.contactEmail}`} className="mt-1 block break-all text-xs text-[#74766f] hover:underline">{crm.contactEmail}</a> : null}
                    {crm.contactPhone ? <a href={`tel:${toDialablePhone(crm.contactPhone)}`} className="mt-1 block text-xs text-[#74766f] hover:underline">{crm.contactPhone}</a> : null}
                  </div>
                ) : null}
                {activeContacts.length > 2 || otherContacts.length ? (
                  <details className="group border-t border-[#eeefea]">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-medium text-[#74766f] [&::-webkit-details-marker]:hidden">
                      {activeContacts.length > 2 ? `All ${contacts.length} contacts` : `${otherContacts.length} archived ${otherContacts.length === 1 ? 'contact' : 'contacts'}`}
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="divide-y divide-[#eeefea]">{activeContacts.slice(2).map(renderContact)}{otherContacts.map(renderContact)}</div>
                  </details>
                ) : null}
              </div>

              {(crm?.lastOrderDate || typeof crm?.lastOrderAmount === 'number') ? (
                <div className="border-b border-[#e5e6e1] px-5 py-4">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-[#74766f]">Latest order</h3><button type="button" onClick={() => setTab('orders')} className="text-xs font-medium text-[#a7321b] hover:underline">View orders</button></div>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    {typeof crm?.lastOrderAmount === 'number' ? <span className="text-xl font-semibold tabular-nums">{formatCurrency(crm.lastOrderAmount)}</span> : null}
                    {crm?.lastOrderDate ? <span className="text-xs tabular-nums text-[#74766f]">{formatDateLabel(crm.lastOrderDate, '')}</span> : null}
                  </div>
                </div>
              ) : null}

              {activeStore.notes?.trim() ? <DetailSection title="Notes"><p className="whitespace-pre-wrap text-sm leading-relaxed">{activeStore.notes.trim()}</p></DetailSection> : null}
              {overviewFields.length ? (
                <details className="group border-b border-[#e5e6e1] px-5 py-1">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-xs font-semibold text-[#74766f] [&::-webkit-details-marker]:hidden">Account details<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
                  <div className="space-y-3 pb-4">{overviewFields.map(([label, value]) => <SectionRow key={label} label={label} value={value} />)}</div>
                </details>
              ) : null}
            </>
          ) : null}

          {tab === 'location' ? (
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm leading-relaxed">{addressValue || 'Address unavailable'}</p>
                {addressValue ? <button type="button" onClick={copyAddress} aria-label="Copy address" className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#e5e6e1] hover:bg-[#f2f2ef]"><Copy className="h-3.5 w-3.5" /></button> : null}
              </div>
              {hasCoordinates ? (
                <>
                  <div className="overflow-hidden rounded-lg border border-[#e5e6e1] bg-[#f2f2ef]">
                    {streetViewLoadError ? <a href={streetViewUrl} target="_blank" rel="noreferrer" className="flex min-h-24 items-center justify-center gap-2 px-4 text-sm text-[#74766f]"><ExternalLink className="h-4 w-4" />Open Street View</a> : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={streetViewPreviewUrl} alt={`Street view near ${activeStore.name}`} className="h-44 w-full object-cover" loading="lazy" onError={() => setStreetViewLoadError(true)} />
                    )}
                  </div>
                  <a href={streetViewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#74766f] hover:underline">Street View<ExternalLink className="h-3 w-3" /></a>
                  <SectionRow label="Coordinates" value={`${activeStore.lat.toFixed(5)}, ${activeStore.lng.toFixed(5)}`} />
                </>
              ) : null}
              {activeStore.phoneNumber ? <Button type="button" variant="secondary" className="h-10 w-full" onClick={callStore}><PhoneCall className="mr-2 h-4 w-4" />Call store</Button> : null}
            </div>
          ) : null}

          {tab === 'proposal' ? <div className="p-5"><DistruProposalPanel accountId={activeStore.notionPageId} focusProductId={proposalProductId} /></div> : null}

          {tab === 'orders' ? (
            <div className="px-5 py-4">
              {orderHistory.length > 0 ? <p className="mb-1 text-xs font-semibold text-[#74766f]">{orderHistory.length} orders</p> : <p className="text-sm text-[#74766f]">{loadingDetail ? 'Loading orders…' : 'No linked orders available'}</p>}
              <div className="divide-y divide-[#e5e6e1]">
                {orderHistory.map((order) => (
                  <div key={order.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="text-sm font-semibold">{order.orderNumber}<span className="ml-2 text-[10px] font-normal text-[#74766f]">{'source' in order ? String(order.source) : 'Nabis'}</span></p><p className="mt-1 text-xs text-[#74766f]">{formatDateLabel(order.createdDate, '')}{order.createdDate ? ' · ' : ''}{order.status}</p></div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(order.total)}</p>
                    </div>
                    {order.deliveryDate || order.salesRep ? <p className="mt-1 text-xs text-[#74766f]">{order.deliveryDate ? `Delivery ${formatDateLabel(order.deliveryDate, '')}` : ''}{order.deliveryDate && order.salesRep ? ' · ' : ''}{order.salesRep || ''}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'history' ? (
            <div className="px-5 py-4">
              {includeAccountEmail ? <GmailConversations kind="account" recordId={activeStore.notionPageId} /> : null}
              {activeStore.lastCheckIn ? <div className="mb-4"><SectionRow label="Last check-in" value={formatCheckInLabel(activeStore.lastCheckIn)} /></div> : null}
              {historyEntries.length === 0 ? <p className="text-sm text-[#74766f]">{loadingDetail ? 'Loading activity…' : detail?.history.availability === 'available' ? 'No recorded activity' : 'History unavailable'}</p> : null}
              <div className="divide-y divide-[#e5e6e1]">
                {historyEntries.slice(0, 40).map((entry) => (
                  <div key={entry.id} className="py-3">
                    <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{entry.title}</p><span className="text-xs text-[#74766f]">{entry.badge}</span></div>
                    <p className="mt-1 text-xs tabular-nums text-[#74766f]">{formatDateTimeLabel(entry.occurredAt, '')}</p>
                    {entry.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{entry.description}</p> : null}
                  </div>
                ))}
              </div>
              {activeStore.notes?.trim() ? <div className="mt-4 border-t border-[#e5e6e1] pt-4"><p className="text-xs font-semibold text-[#74766f]">Account notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{activeStore.notes.trim()}</p></div> : null}
            </div>
          ) : null}
          <AccountDetailConfidence store={activeStore} detail={detail} loadingDetail={loadingDetail} accountFreshness={accountFreshness} />
        </div>

        {checkInModalOpen && appAccess.canEdit ? (
          <div className="fixed inset-0 z-[5200] bg-black/40" onClick={() => !checkingIn && setCheckInModalOpen(false)}>
            <div className="absolute inset-x-3 bottom-[calc(var(--picc-bottom-nav-clearance)+12px)] mx-auto max-h-[calc(100dvh-var(--picc-bottom-nav-clearance)-24px)] max-w-[480px] overflow-y-auto rounded-xl bg-[#fdfdfb] lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#252724]">Update account</h3>
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

              <div className="mt-3">
                <Textarea
                  value={checkInDraft}
                  onChange={(event) => setCheckInDraft(event.target.value)}
                  className="min-h-[130px] border-[#c6c8d0] bg-white text-[16px] text-[#1d1f23] placeholder:text-[#7c8089] caret-[#cd3814]"
                  placeholder={
                    checkInContact
                      ? `Capture notes from your check-in with ${checkInContact.name}...`
                      : 'Add a note (optional)'
                  }
                />
              </div>

              <label className="mt-4 block text-[16px] text-[#4f525a]">Follow-up Date</label>
              <input
                type="date"
                value={checkInFollowUpDateDraft}
                onChange={(event) => setCheckInFollowUpDateDraft(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-[#c6c8d0] bg-white px-3 text-[17px] text-[#23262c]"
              />

              <label className="mt-3 block text-[16px] text-[#4f525a]">Follow-up Needed</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    'h-10 rounded-md border text-[14px] font-medium',
                    checkInFollowUpNeededDraft === true ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c6c8d0] bg-white text-[#23262c]',
                  )}
                  onClick={() => setCheckInFollowUpNeededDraft(true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={cn(
                    'h-10 rounded-md border text-[14px] font-medium',
                    checkInFollowUpNeededDraft === false ? 'border-[#cd3814] bg-[#cd3814] text-white' : 'border-[#c6c8d0] bg-white text-[#23262c]',
                  )}
                  onClick={() => setCheckInFollowUpNeededDraft(false)}
                >
                  No
                </button>
              </div>

              <label className="mt-3 block text-[16px] text-[#4f525a]">Follow-up Reason</label>
              <Textarea
                value={checkInFollowUpReasonDraft}
                onChange={(event) => setCheckInFollowUpReasonDraft(event.target.value)}
                className="mt-1 min-h-[90px] border-[#c6c8d0] bg-white text-[16px] text-[#1d1f23] placeholder:text-[#7c8089] caret-[#cd3814]"
                placeholder="Why this follow-up is needed..."
              />

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" className="h-11 bg-[#24324f] text-white hover:bg-[#1c2840]" onClick={() => setCheckInModalOpen(false)} disabled={checkingIn}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="h-11 bg-[#cd3814] text-white hover:bg-[#b52f10] disabled:bg-[#d7b1a7] disabled:text-white/80"
                  onClick={handleCheckInSubmit}
                  disabled={checkingIn || !canSubmitCheckIn}
                >
                  {checkingIn ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <footer className={cn('grid shrink-0 gap-1 border-t border-[#e5e6e1] bg-[#fdfdfb] px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]', appAccess.canEdit ? 'grid-cols-4' : 'grid-cols-3')}>
          <ActionButton label={routeSelected ? 'In route' : 'Add to route'} onClick={() => onAddToRoute(activeStore.id)} icon={<MapPinned className="h-4 w-4" />} selected={routeSelected} />
          {appAccess.canEdit ? <ActionButton label="Add note" onClick={() => openCheckInModal()} icon={<PencilLine className="h-4 w-4" />} disabled={checkingIn} /> : null}
          <ActionButton label="Locate" onClick={handleCenter} icon={<MapPinned className="h-4 w-4" />} disabled={!hasCoordinates} />
          {destination ? <a href={navigateUrl} target="_blank" rel="noreferrer" className={actionBaseClass}><Navigation className="h-4 w-4" /><span>Navigate</span></a> : <ActionButton label="Navigate" onClick={() => undefined} icon={<Navigation className="h-4 w-4" />} disabled />}
        </footer>
      </section>
    </div>
  );
}

function AccountDetailConfidence({ store, detail, loadingDetail, accountFreshness }: {
  store: TerritoryStorePin;
  detail: TerritoryStoreDetailResponse | null;
  loadingDetail: boolean;
  accountFreshness?: RuntimeFreshness | null;
}) {
  const status = loadingDetail ? 'Updating' : accountFreshness?.state === 'error' ? 'Sync issue' : accountFreshness?.state === 'stale' ? 'Stale data' : null;
  return (
    <details className="group mx-5 border-t border-[#eeefea] py-2 text-[11px] text-[#8a8d84]">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>{status || 'Record details'}</span>
        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-1 pb-2">
        <p>Updated {formatDateTimeLabel(store.lastEditedTime, 'date unavailable')}</p>
        {accountFreshness?.syncedAt ? <p>Synced {formatDateTimeLabel(accountFreshness.syncedAt, '')}</p> : null}
        {detail ? <p>{detail.contacts.length} linked contacts</p> : null}
        {accountFreshness?.error ? <p className="text-[#a7321b]">{accountFreshness.error}</p> : null}
      </div>
    </details>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-b border-[#e5e6e1] px-5 py-4"><h3 className="text-xs font-semibold text-[#74766f]">{title}</h3><div className="mt-2">{children}</div></section>;
}

function SectionRow({ label, value }: { label: string; value: string }) {
  return <dl className="grid grid-cols-[110px_1fr] gap-3 text-xs leading-relaxed"><dt className="text-[#74766f]">{label}</dt><dd className="min-w-0 break-words text-[#252724]">{value}</dd></dl>;
}

const actionBaseClass = 'flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-md px-1 text-center text-[10px] font-medium text-[#63675d] transition-colors hover:bg-[#f2f2ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c93412]';

function ActionButton({ label, icon, onClick, disabled = false, selected = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; selected?: boolean }) {
  return <button type="button" onClick={onClick} className={cn(actionBaseClass, selected && 'bg-[#edf3ed] text-[#346a3c]', disabled && 'opacity-40')} disabled={disabled}>{icon}<span>{label}</span></button>;
}
