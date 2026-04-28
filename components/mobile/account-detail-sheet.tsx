'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Copy, Mail, MapPinned, MessageSquare, Navigation, PencilLine, Phone, PhoneCall, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppAccess } from '@/components/auth/app-access-provider';
import { MockOrderProposalPanel } from '@/components/crm/mock-order-proposal-panel';
import { PreferredPartnerProposalPanel } from '@/components/crm/preferred-partner-proposal-panel';
import { PreferredPartnerSavingsPanel } from '@/components/crm/preferred-partner-savings-panel';
import { SegmentedControl } from '@/components/mobile/segmented-control';
import { NotionOptionChip } from '@/components/shared/notion-option-chip';
import { Button, Textarea } from '@/components/ui';
import type { RuntimeFreshness } from '@/lib/runtime/account-contact-contract';
import type { TerritoryStoreContact, TerritoryStoreDetailResponse, TerritoryStorePin } from '@/lib/territory/types';
import { cn } from '@/lib/utils';

type DetailTab = 'detail' | 'location' | 'ai' | 'orders' | 'history';
const STORE_DETAIL_CACHE_PREFIX = 'territory-store-detail:';
const STORE_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;

type StoreDetailCacheEntry = {
  fetchedAt: number;
  detail: TerritoryStoreDetailResponse;
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
  const memoryValue = storeDetailMemoryCache.get(storeId);
  if (memoryValue) {
    return {
      detail: memoryValue.detail,
      isFresh: Date.now() - memoryValue.fetchedAt < STORE_DETAIL_CACHE_TTL_MS,
    };
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${STORE_DETAIL_CACHE_PREFIX}${storeId}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoreDetailCacheEntry | TerritoryStoreDetailResponse;
    const entry: StoreDetailCacheEntry =
      'detail' in parsed
        ? parsed
        : {
            detail: parsed,
            fetchedAt: 0,
          };

    if (entry.detail?.store?.id !== storeId) {
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

function writeCachedStoreDetail(detail: TerritoryStoreDetailResponse) {
  const entry = {
    detail,
    fetchedAt: Date.now(),
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
  store: TerritoryStorePin | null;
  onClose: () => void;
  onAddToRoute: (storeId: string) => void;
  routeSelected: boolean;
  onCenterStore?: (store: TerritoryStorePin) => void;
  accountFreshness?: RuntimeFreshness | null;
}

export function AccountDetailSheet({ store, onClose, onAddToRoute, routeSelected, onCenterStore, accountFreshness }: AccountDetailSheetProps) {
  const appAccess = useAppAccess();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('detail');
  const [detail, setDetail] = useState<TerritoryStoreDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInDraft, setCheckInDraft] = useState('');
  const [checkInFollowUpDateDraft, setCheckInFollowUpDateDraft] = useState('');
  const [checkInFollowUpNeededDraft, setCheckInFollowUpNeededDraft] = useState<boolean | null>(null);
  const [checkInFollowUpReasonDraft, setCheckInFollowUpReasonDraft] = useState('');
  const [checkInContact, setCheckInContact] = useState<TerritoryStoreContact | null>(null);
  const [contactActionTarget, setContactActionTarget] = useState<TerritoryStoreContact | null>(null);
  const [streetViewLoadError, setStreetViewLoadError] = useState(false);

  useEffect(() => {
    if (!store) {
      setDetail(null);
      setCheckInModalOpen(false);
      setCheckInDraft('');
      setCheckInFollowUpDateDraft('');
      setCheckInFollowUpNeededDraft(null);
      setCheckInFollowUpReasonDraft('');
      setCheckInContact(null);
      setContactActionTarget(null);
      setStreetViewLoadError(false);
      return;
    }

    setTab('detail');
    setCheckInModalOpen(false);
    setCheckInDraft('');
    setCheckInFollowUpDateDraft('');
    setCheckInFollowUpNeededDraft(null);
    setCheckInFollowUpReasonDraft('');
    setCheckInContact(null);
    setContactActionTarget(null);
    setStreetViewLoadError(false);

    const cachedDetail = readCachedStoreDetail(store.id);
    setDetail(cachedDetail?.detail ?? null);

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

        const payload = (await response.json()) as TerritoryStoreDetailResponse;
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
  }, [queryClient, store]);

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
  const isPreferredPartner = Boolean(activeStore.isPreferredPartner);
  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${activeStore.lat},${activeStore.lng}`;
  const notionUrl = `https://www.notion.so/${activeStore.notionPageId.replace(/-/g, '')}`;
  const addressValue = activeStore.locationAddress ?? activeStore.locationLabel ?? 'No address';
  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${activeStore.lat},${activeStore.lng}`;
  const streetViewPreviewUrl = `https://maps.googleapis.com/maps/api/streetview?size=900x420&location=${activeStore.lat},${activeStore.lng}&fov=85&pitch=0`;
  const latestVendorDay = detail?.vendorDays.recent[0] ?? null;
  const followUpDateLabel = formatDateLabel(activeStore.followUpDate, 'No follow-up set');
  const followUpReasonLabel = activeStore.followUpReason?.trim() || 'No follow-up reason logged';
  const followUpNeededLabel =
    typeof activeStore.followUpNeeded === 'boolean' ? (activeStore.followUpNeeded ? 'Yes' : 'No') : 'Not set';
  const combinedLastTouchpoints = [
    `Last Contacted: ${formatDateLabel(crm?.lastContacted ?? null, '—')}`,
    `Last Check-in: ${formatDateTimeLabel(activeStore.lastCheckIn, 'No check-ins')}`,
  ].join(' · ');
  const lastVendorDayLabel = latestVendorDay
    ? `${formatDateLabel(latestVendorDay.eventDate, '—')}${latestVendorDay.repName || latestVendorDay.ambassadorName ? ` · ${latestVendorDay.repName || latestVendorDay.ambassadorName}` : ''}`
    : 'No vendor days logged';
  const customerSinceLabel = crm?.customerSince ? formatDateLabel(crm.customerSince, crm.customerSince) : '—';
  const contactLabel = crm?.contact || contacts.map((contact) => contact.name).join(', ') || '—';
  const contactEmailLabel = crm?.contactEmail || crm?.primaryContactEmail || contacts[0]?.email || '—';
  const contactPhoneLabel = crm?.contactPhone || crm?.primaryContactPhone || contacts[0]?.phone || '—';
  const orderHistory = detail?.analytics.orders ?? detail?.analytics.recentOrders ?? [];
  const orderCount = orderHistory.length;
  const orderSourceLabel =
    detail?.analytics.matchedBy === 'account'
      ? 'Matched to CRM account'
      : detail?.analytics.matchedBy === 'name'
        ? 'Matched by store name'
        : 'Matched by identifier';
  const savingsYear = new Date().getFullYear();
  const aiAccountId = detail?.analytics.matchedAccountId ?? activeStore.notionPageId;
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

    const payload = (await response.json()) as TerritoryStoreDetailResponse;
    setDetail(payload);
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

  function callFromContactCard(contact: TerritoryStoreContact) {
    launchDial(cleanContactField(contact.phone), contact.name);
  }

  function hasContactEmail(contact: TerritoryStoreContact) {
    return Boolean(cleanContactField(contact.email));
  }

  function hasContactPhone(contact: TerritoryStoreContact) {
    return Boolean(cleanContactField(contact.phone));
  }

  function openContactActions(contact: TerritoryStoreContact) {
    if (!hasContactEmail(contact) && !hasContactPhone(contact)) {
      toast.message(`No contact method is available for ${contact.name}.`);
      return;
    }
    setContactActionTarget(contact);
  }

  function contactViaEmail(contact: TerritoryStoreContact) {
    const email = cleanContactField(contact.email);
    if (!email) {
      toast.error(`No email available for ${contact.name}.`);
      return;
    }
    const subject = encodeURIComponent(`PICC follow-up: ${activeStore.name}`);
    window.location.href = `mailto:${email}?subject=${subject}`;
    setContactActionTarget(null);
  }

  function contactViaText(contact: TerritoryStoreContact) {
    const phone = toDialablePhone(contact.phone);
    if (!phone) {
      toast.error(`No phone available for ${contact.name}.`);
      return;
    }
    window.location.href = `sms:${phone}`;
    setContactActionTarget(null);
  }

  function contactViaCall(contact: TerritoryStoreContact) {
    callFromContactCard(contact);
    setContactActionTarget(null);
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
          if (!previousDetail) return previousDetail;
          const checkedInAt = typeof payload?.checkedInAt === 'string' ? payload.checkedInAt : previousDetail.store.lastCheckIn;
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

      const contactLabelSuffix = checkInContact ? ` with ${checkInContact.name}` : '';
      toast.success(`Check-in saved${contactLabelSuffix}`);
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
      onClose();
      return;
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${activeStore.lat},${activeStore.lng}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-[5000] bg-black/35">
      <div className="mx-auto flex h-full max-w-[720px] flex-col bg-[#e6e6e9]">
        <div className="bg-[#c93412] px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] text-white">
          <div className="grid grid-cols-[48px_1fr_56px] items-center gap-2 py-1">
            <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-start" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
            <h1 className="truncate text-center text-[18px] font-semibold leading-tight">Account Details</h1>
            <button
              type="button"
              onClick={() => window.open(notionUrl, '_blank', 'noopener,noreferrer')}
              className="text-right text-[16px] font-medium"
              aria-label="Open account in Notion"
            >
              Open
            </button>
          </div>
          <SegmentedControl
            value={tab}
            onChange={(value) => setTab(value as DetailTab)}
            options={[
              { value: 'detail', label: 'Detail' },
              { value: 'location', label: 'Location' },
              { value: 'ai', label: 'AI' },
              { value: 'orders', label: 'Orders' },
              { value: 'history', label: 'History' },
            ]}
            className="bg-[#d4d4d8] [&_button]:py-1.5 [&_button]:text-[13px]"
          />
        </div>

        <div className="flex-1 overflow-y-auto pb-[132px]">
          <div className="border-y border-[#c6c7cb] bg-[#e6e6e9] px-5 py-4">
            <h2 className="text-[24px] font-semibold leading-tight text-[#111217]">{activeStore.name}</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <StatusField
                label="Account Status"
                value={crm?.accountStatus || activeStore.status}
                colorName={crm?.accountStatusColorName}
                fallbackHex={activeStore.statusColor}
              />
              <StatusField
                label="PPP Status"
                value={crm?.pppStatus || activeStore.pppStatus || '—'}
                colorName={crm?.pppStatusColorName ?? activeStore.pppStatusColorName}
              />
              <StatusField
                label="Headset Connection"
                value={crm?.headsetConnectionStatus || activeStore.headsetConnectionStatus || '—'}
                colorName={crm?.headsetConnectionStatusColorName ?? activeStore.headsetConnectionStatusColorName}
              />
              {isPreferredPartner ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c9098]">Program</p>
                  <span className="inline-flex rounded-full border border-black bg-black px-3 py-1 text-[12px] font-semibold text-white">
                    Preferred Partner
                  </span>
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-[15px] text-[#7c8089]">{addressValue}</p>
            <AccountDetailConfidence
              store={activeStore}
              detail={detail}
              loadingDetail={loadingDetail}
              accountFreshness={accountFreshness}
            />
          </div>

          {tab === 'detail' ? (
            <>
              <FollowUpSection>
                <SectionRow label="Date" value={followUpDateLabel} strong />
                <SectionRow label="Needed" value={followUpNeededLabel} />
                <SectionRow label="Reason" value={followUpReasonLabel} />
              </FollowUpSection>

              <DetailSection title="Account Overview">
                <SectionRow label="Sales Rep" value={crm?.rep || activeStore.repNames.join(', ') || '—'} strong />
                <SectionRow label="Account Manager" value={crm?.accountManager || '—'} />
                <SectionRow label="Credit Status" value={crm?.piccCreditStatus || '—'} />
                <SectionRow label="Last Contacted / Last Check-in" value={combinedLastTouchpoints} />
                <SectionRow label="Last Sample Order Date" value={formatDateLabel(crm?.lastSampleOrderDate ?? null, '—')} />
                <SectionRow label="Last Order Date" value={formatDateLabel(crm?.lastOrderDate ?? null, '—')} />
                <SectionRow label="Last Order Amount" value={formatCurrency(crm?.lastOrderAmount)} />
                <SectionRow label="Referral Source" value={crm?.referralSource || '—'} />
                <SectionRow label="Contact" value={contactLabel} />
                <SectionRow label="Contact Email" value={contactEmailLabel} />
                <SectionRow label="Contact Phone" value={contactPhoneLabel} />
                <SectionRow label="Last Vendor Day" value={lastVendorDayLabel} />
                <SectionRow label="Penny Bundle Promo Status" value={crm?.pennyBundlePromoStatus || crm?.pppStatus || '—'} />
                <SectionRow label="PPP Status" value={crm?.pppStatus || '—'} />
                <SectionRow label="Headset Connection Status" value={crm?.headsetConnectionStatus || '—'} />
                <SectionRow label="License #" value={activeStore.licenseNumber ?? '—'} />
                <SectionRow label="Address" value={addressValue} />
                <SectionRow label="Display Tracking" value={crm?.displayTracking || '—'} />
                <SectionRow label="Product Tracking" value={crm?.productTracking || '—'} />
                <SectionRow label="Customer Since" value={customerSinceLabel} />
              </DetailSection>

              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Associated Contacts</p>
                {contacts.length === 0 ? <p className="mt-1 text-[16px] text-[#1d1f23]">No contacts linked.</p> : null}
                {contacts.map((contact) => (
                  <div key={contact.id} className="mt-2 rounded-lg border border-[#c7c8cd] bg-[#f3f3f6] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/contacts/${encodeURIComponent(contact.id)}`} className="text-[16px] font-semibold text-[#1f4e9f] underline-offset-2 hover:underline">
                        {contact.name}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="rounded-md border border-[#b4b7bf] px-2.5 py-1 text-[13px] font-medium text-[#27303f] hover:bg-[#e8eaf0]"
                          onClick={() => openContactActions(contact)}
                        >
                          Contact
                        </button>
                        {appAccess.canEdit ? (
                          <button
                            type="button"
                            className="rounded-md border border-[#b4b7bf] px-2.5 py-1 text-[13px] font-medium text-[#27303f] hover:bg-[#e8eaf0]"
                            onClick={() => openCheckInModal(contact)}
                            disabled={checkingIn}
                          >
                            Check-in
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-[14px] text-[#5e6169]">{contact.roleTitle || '—'}</p>
                    <p className="text-[14px] text-[#5e6169]">
                      {contact.email || '—'} · {contact.phone || '—'}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-b border-[#c6c7cb] px-5 py-5">
                <Button
                  type="button"
                  className="h-12 w-full text-[16px]"
                  onClick={() => window.open(notionUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open Full Record in Notion
                </Button>
              </div>
            </>
          ) : null}

          {tab === 'location' ? (
            <>
              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Address</p>
                    <p className="mt-1 text-[16px] font-medium text-[#1d1f23]">{addressValue}</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#9ab9ea] px-3 text-[15px] font-medium text-[#2872d1]"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </button>
                </div>
              </div>

              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Street View</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-[#c4c6cc] bg-[#dfe2e8]">
                  {streetViewLoadError ? (
                    <button
                      type="button"
                      className="grid h-[210px] w-full place-items-center bg-[#eef0f5] px-5 text-center text-[15px] text-[#4d515b]"
                      onClick={() => window.open(streetViewUrl, '_blank', 'noopener,noreferrer')}
                    >
                      Street View preview unavailable. Tap to open Street View.
                    </button>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={streetViewPreviewUrl}
                      alt={`Street view near ${activeStore.name}`}
                      className="h-[210px] w-full object-cover"
                      loading="lazy"
                      onError={() => setStreetViewLoadError(true)}
                    />
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" className="h-11" onClick={() => window.open(streetViewUrl, '_blank', 'noopener,noreferrer')}>
                    Open Street View
                  </Button>
                  <Button type="button" variant="secondary" className="h-11" onClick={callStore}>
                    <PhoneCall className="mr-1 h-4 w-4" />
                    Call Store
                  </Button>
                </div>
              </div>

              <DetailRow label="Coordinates" value={`${activeStore.lat.toFixed(5)}, ${activeStore.lng.toFixed(5)}`} />
              <DetailRow label="City / State" value={activeStore.city && activeStore.state ? `${activeStore.city}, ${activeStore.state}` : 'Not available'} />
              <DetailRow label="Location Source" value={activeStore.locationSource} />
              <DetailRow label="Location Precision" value={activeStore.locationPrecision} />
            </>
          ) : null}

          {tab === 'ai' ? (
            <div className="border-b border-[#c6c7cb] px-5 py-5">
              <div className="space-y-4">
                <PreferredPartnerProposalPanel accountId={aiAccountId} />
                <PreferredPartnerSavingsPanel accountId={aiAccountId} year={savingsYear} />
                <MockOrderProposalPanel accountId={aiAccountId} />
              </div>
            </div>
          ) : null}

          {tab === 'orders' ? (
            <>
              <DetailRow label="Linked Orders" value={String(orderCount)} strong />
              <DetailRow label="Match Method" value={orderSourceLabel} />
              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Nabis Orders</p>
                {orderHistory.length === 0 ? <p className="mt-1 text-[16px] text-[#1d1f23]">No linked Nabis orders found.</p> : null}
                {orderHistory.map((order) => (
                  <div key={order.id} className="mt-2 rounded-lg border border-[#c7c8cd] bg-[#f3f3f6] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-[#1d1f23]">Order {order.orderNumber}</p>
                        <p className="text-[13px] text-[#5e6169]">
                          {formatDateLabel(order.createdDate, 'No order date')} · {order.status}
                        </p>
                      </div>
                      <p className="shrink-0 text-[15px] font-semibold text-[#1d1f23]">{formatCurrency(order.total)}</p>
                    </div>
                    <p className="mt-1 text-[13px] text-[#5e6169]">
                      {order.deliveryDate ? `Delivery ${formatDateLabel(order.deliveryDate, '—')}` : 'Delivery date unavailable'}
                      {order.salesRep ? ` · ${order.salesRep}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {tab === 'history' ? (
            <>
              <DetailRow label="Last edited" value={formatDateTimeLabel(activeStore.lastEditedTime, 'No edit history')} />
              <DetailRow label="Last check-in" value={formatCheckInLabel(activeStore.lastCheckIn)} strong />
              <DetailRow label="Route status" value={routeSelected ? 'In current route' : 'Not in current route'} />
              <DetailRow label="Sync source" value="Notion live cache" />

              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Current Follow-up</p>
                <div className="mt-2 rounded-lg border border-[#c7c8cd] bg-[#f3f3f6] px-3 py-3">
                  <p className="text-[14px] font-medium text-[#1d1f23]">Date: {followUpDateLabel}</p>
                  <p className="mt-1 text-[14px] text-[#5e6169]">Needed: {followUpNeededLabel}</p>
                  <p className="mt-1 text-[14px] text-[#5e6169]">Reason: {followUpReasonLabel}</p>
                </div>
                {activeStore.notes?.trim() ? (
                  <div className="mt-3 rounded-lg border border-[#c7c8cd] bg-[#f3f3f6] px-3 py-3">
                    <p className="text-[14px] font-medium text-[#1d1f23]">Legacy Note Snapshot</p>
                    <p className="mt-1 whitespace-pre-wrap text-[14px] text-[#5e6169]">{activeStore.notes.trim()}</p>
                  </div>
                ) : null}
              </div>

              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Activity Timeline</p>
                {historyEntries.length === 0 ? <p className="mt-1 text-[16px] text-[#1d1f23]">No history yet.</p> : null}
                {historyEntries.slice(0, 40).map((entry) => (
                  <div key={entry.id} className="mt-2 rounded-lg border border-[#c7c8cd] bg-[#f3f3f6] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-[#1d1f23]">{entry.title}</p>
                        <p className="text-[13px] text-[#5e6169]">{formatDateTimeLabel(entry.occurredAt, 'Unknown time')}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#d6d8de] bg-white px-2 py-0.5 text-[12px] font-medium text-[#4f5561]">
                        {entry.badge}
                      </span>
                    </div>
                    {entry.description ? <p className="mt-2 whitespace-pre-wrap text-[14px] text-[#5e6169]">{entry.description}</p> : null}
                  </div>
                ))}
              </div>

              <div className="border-b border-[#c6c7cb] px-5 py-4">
                <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">Vendor Days</p>
                <p className="mt-1 text-[16px] text-[#1d1f23]">
                  Total: {detail?.vendorDays.total ?? 0} · Upcoming: {detail?.vendorDays.upcomingCount ?? 0}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {contactActionTarget ? (
          <div className="fixed inset-0 z-[5210] bg-black/40" onClick={() => setContactActionTarget(null)}>
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[720px] rounded-t-2xl bg-[#f8f8fb] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[20px] font-semibold text-[#1d1f23]">Contact {contactActionTarget.name}</h3>
                  <p className="text-[14px] text-[#5f6269]">{activeStore.name}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-[#5f6269] hover:bg-[#ececf1]"
                  onClick={() => setContactActionTarget(null)}
                  aria-label="Close contact modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-2">
                {hasContactEmail(contactActionTarget) ? (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#c3c5cc] bg-white px-3 text-[15px] font-medium text-[#2b2f38]"
                    onClick={() => contactViaEmail(contactActionTarget)}
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </button>
                ) : null}
                {hasContactPhone(contactActionTarget) ? (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#c3c5cc] bg-white px-3 text-[15px] font-medium text-[#2b2f38]"
                    onClick={() => contactViaText(contactActionTarget)}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Text
                  </button>
                ) : null}
                {hasContactPhone(contactActionTarget) ? (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#c3c5cc] bg-white px-3 text-[15px] font-medium text-[#2b2f38]"
                    onClick={() => contactViaCall(contactActionTarget)}
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {checkInModalOpen && appAccess.canEdit ? (
          <div className="fixed inset-0 z-[5200] bg-black/40" onClick={() => !checkingIn && setCheckInModalOpen(false)}>
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[720px] rounded-t-2xl bg-[#f8f8fb] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4" onClick={(event) => event.stopPropagation()}>
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

              <div className="mt-3">
                <Textarea
                  value={checkInDraft}
                  onChange={(event) => setCheckInDraft(event.target.value)}
                  className="min-h-[130px] border-[#c6c8d0] bg-white text-[16px] text-[#1d1f23] placeholder:text-[#7c8089] caret-[#cd3814]"
                  placeholder={
                    checkInContact
                      ? `Capture notes from your check-in with ${checkInContact.name}...`
                      : 'Capture notes from this check-in...'
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
                  {checkingIn ? 'Saving...' : 'Save Check-in'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-[5100]">
          <div className={cn('mx-auto grid max-w-[720px] border-t border-[#c6c7cb] bg-[#f2f2f5] py-2 pb-[max(8px,env(safe-area-inset-bottom))] text-[#5a96e8]', appAccess.canEdit ? 'grid-cols-4' : 'grid-cols-3')}>
            <ActionButton label={routeSelected ? 'remove' : 'add to...'} onClick={() => onAddToRoute(activeStore.id)} icon={<MapPinned className="h-5 w-5" />} />
            {appAccess.canEdit ? <ActionButton label={checkingIn ? 'saving...' : 'check-in'} onClick={() => openCheckInModal()} icon={<PencilLine className="h-5 w-5" />} disabled={checkingIn} /> : null}
            <ActionButton label="center" onClick={handleCenter} icon={<MapPinned className="h-5 w-5" />} />
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
    <div className="border-b border-[#c6c7cb] px-5 py-4">
      <p className="text-[13px] uppercase tracking-wide text-[#8c9098]">{label}</p>
      <p className={cn('mt-1 text-[16px] text-[#1d1f23]', strong ? 'font-semibold' : '')}>{value || ' '}</p>
    </div>
  );
}

function sourceLabel(source: RuntimeFreshness['source'] | undefined) {
  if (source === 'postgres-read-model') return 'Postgres read model';
  if (source === 'notion-territory') return 'Notion territory cache';
  if (source === 'notion-contacts') return 'Notion contacts cache';
  if (source === 'ghl') return 'GoHighLevel';
  return 'Account detail API';
}

function confidenceTone(state: RuntimeFreshness['state'] | undefined, loadingDetail: boolean, hasDetail: boolean) {
  if (loadingDetail) {
    return {
      Icon: Clock3,
      label: hasDetail ? 'Updating detail' : 'Loading detail',
      className: 'border-[#d8c999] bg-[#fff8e6] text-[#5e4514]',
    };
  }

  if (state === 'error') {
    return {
      Icon: AlertCircle,
      label: 'Sync issue',
      className: 'border-[#e4b1a7] bg-[#fff0ed] text-[#8f2410]',
    };
  }

  if (state === 'stale' || state === 'syncing' || state === 'unknown') {
    return {
      Icon: Clock3,
      label: state === 'syncing' ? 'Syncing' : state === 'stale' ? 'Stale' : 'Unverified',
      className: 'border-[#d2d7e0] bg-[#f7f9fc] text-[#3a4352]',
    };
  }

  return {
    Icon: CheckCircle2,
    label: 'Detail ready',
    className: 'border-[#b8dec9] bg-[#effaf3] text-[#1f5538]',
  };
}

function AccountDetailConfidence({
  store,
  detail,
  loadingDetail,
  accountFreshness,
}: {
  store: TerritoryStorePin;
  detail: TerritoryStoreDetailResponse | null;
  loadingDetail: boolean;
  accountFreshness?: RuntimeFreshness | null;
}) {
  const tone = confidenceTone(accountFreshness?.state, loadingDetail, Boolean(detail));
  const contactCount = detail?.contacts.length;
  const contactLabel = contactCount === undefined
    ? 'Contacts loading'
    : contactCount === 0
      ? 'No linked contacts'
      : `${contactCount} linked ${contactCount === 1 ? 'contact' : 'contacts'}`;
  const source = sourceLabel(accountFreshness?.source);
  const syncedAt = accountFreshness?.syncedAt ? formatDateTimeLabel(accountFreshness.syncedAt, 'No sync recorded') : 'No sync recorded';
  const editedAt = formatDateTimeLabel(store.lastEditedTime, 'No edit time');
  const Icon = tone.Icon;

  return (
    <div className={cn('mt-4 rounded-2xl border px-3 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]', tone.className)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{tone.label}</span>
            <span className="rounded-full border border-current/15 bg-white/55 px-2 py-0.5 text-[11px] font-semibold">
              {contactLabel}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-5 opacity-85">
            Source: {source}. Last sync: {syncedAt}. Last edit: {editedAt}.
          </p>
          {accountFreshness?.error ? <p className="mt-1 text-[12px] font-medium opacity-90">{accountFreshness.error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-[#c6c7cb] px-5 py-4">
      <p className="text-[14px] uppercase tracking-wide text-[#8c9098]">{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function FollowUpSection({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-[#c6c7cb] px-5 py-4">
      <div className="rounded-2xl border border-[#d7a79a] bg-[#fff4f0] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(205,56,20,0.04)]">
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function SectionRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[13px] uppercase tracking-wide text-[#8c9098]">{label}</p>
      <p className={cn('mt-1 text-[16px] leading-snug text-[#1d1f23]', strong ? 'font-semibold' : '')}>{value || '—'}</p>
    </div>
  );
}

function StatusField({
  label,
  value,
  colorName,
  fallbackHex,
}: {
  label: string;
  value: string;
  colorName?: string | null;
  fallbackHex?: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8c9098]">{label}</p>
      <NotionOptionChip label={value} colorName={colorName} fallbackHex={fallbackHex} />
    </div>
  );
}

const actionBaseClass = 'flex flex-col items-center justify-center gap-1 text-[12px] font-medium';

function ActionButton({ label, icon, onClick, disabled = false }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn(actionBaseClass, disabled ? 'opacity-60' : '')} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
