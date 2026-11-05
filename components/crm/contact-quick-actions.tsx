'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, Loader2, Mail, MessageSquare, Phone, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildContactActionHref, type ContactActionKind } from '@/lib/contacts/contact-actions';
import { buildCommunicationFollowUpPayload } from '@/lib/contacts/contact-follow-up';
import { cn } from '@/lib/utils';
import { defaultFollowUpDate, type FollowUpDefaults } from '@/lib/follow-up/follow-up-intelligence';
import { notifyAccountUpdated } from '@/lib/territory/account-cache-events';

export type ContactQuickActionContact = {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
};

export type ContactQuickActionAccount = {
  id: string;
  name: string;
};

function dateAfter(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const actionMeta = {
  email: { label: 'Email', launchedLabel: 'Gmail', Icon: Mail },
  text: { label: 'Text', launchedLabel: 'Messages', Icon: MessageSquare },
  call: { label: 'Call', launchedLabel: 'Phone', Icon: Phone },
} satisfies Record<ContactActionKind, { label: string; launchedLabel: string; Icon: typeof Mail }>;

const fallbackDefaults: FollowUpDefaults = { defaultEmailDays: 7, defaultTextDays: 3, defaultCallDays: 1 };
let followUpDefaultsPromise: Promise<FollowUpDefaults> | null = null;

function loadFollowUpDefaults() {
  followUpDefaultsPromise ??= fetch('/api/settings/follow-up-preferences', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return fallbackDefaults;
      const payload = (await response.json()) as { preference?: FollowUpDefaults };
      return payload.preference ?? fallbackDefaults;
    })
    .catch(() => fallbackDefaults);
  return followUpDefaultsPromise;
}

export function ContactQuickActions({
  contact,
  accounts,
  className,
  labels = 'responsive',
  onActivityLogged,
}: {
  contact: ContactQuickActionContact;
  accounts: ContactQuickActionAccount[];
  className?: string;
  labels?: 'responsive' | 'always';
  onActivityLogged?: (activity: { id: string; summary: string; channel: string | null; occurredAt: string; externalUrl: string | null }) => void;
}) {
  const [pendingAction, setPendingAction] = useState<ContactActionKind | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts.length === 1 ? accounts[0]?.id ?? '' : '');
  const [followUpDate, setFollowUpDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<FollowUpDefaults>(fallbackDefaults);

  useEffect(() => {
    void loadFollowUpDefaults().then(setDefaults);
    const handlePreferenceChange = (event: Event) => {
      const next = (event as CustomEvent<FollowUpDefaults>).detail;
      followUpDefaultsPromise = Promise.resolve(next);
      setDefaults(next);
    };
    window.addEventListener('picc:follow-up-preferences', handlePreferenceChange);
    return () => window.removeEventListener('picc:follow-up-preferences', handlePreferenceChange);
  }, []);

  const links = useMemo(
    () =>
      (Object.keys(actionMeta) as ContactActionKind[])
        .map((kind) => ({
          kind,
          href: buildContactActionHref({ kind, email: contact.email, phone: contact.phone, accountName: accounts[0]?.name ?? 'PICC' }),
          ...actionMeta[kind],
        }))
        .filter((item): item is typeof item & { href: string } => Boolean(item.href)),
    [accounts, contact.email, contact.phone],
  );

  function closePrompt() {
    if (saving) return;
    setPendingAction(null);
    setFollowUpDate('');
    setReason('');
    setError(null);
    setSelectedAccountId(accounts.length === 1 ? accounts[0]?.id ?? '' : '');
  }

  async function saveFollowUp() {
    if (!pendingAction || !selectedAccountId || !followUpDate) return;
    const account = accounts.find((candidate) => candidate.id === selectedAccountId);
    if (!account) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/territory/stores/${encodeURIComponent(account.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          buildCommunicationFollowUpPayload({
            action: pendingAction,
            account,
            contact,
            followUpDate,
            reason,
          }),
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; syncWarning?: string | null };
      if (!response.ok) throw new Error(payload.error || 'Follow-up could not be saved.');

      toast.success('Follow-up set', {
        description: payload.syncWarning || `${contact.name} is scheduled for ${followUpDate}.`,
      });
      notifyAccountUpdated(account.id);
      setPendingAction(null);
      setFollowUpDate('');
      setReason('');
      setSelectedAccountId(accounts.length === 1 ? accounts[0]?.id ?? '' : '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Follow-up could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={cn('flex items-center gap-1.5', className)} aria-label={`Contact ${contact.name}`}>
        {links.map(({ kind, href, label, Icon }) => (
          <a
            key={kind}
            href={href}
            target={kind === 'email' ? '_blank' : undefined}
            rel={kind === 'email' ? 'noreferrer' : undefined}
            aria-label={`${label} ${contact.name}`}
            title={`${label} ${contact.name}`}
            className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-[#cfd6e1] bg-white px-2.5 text-[13px] font-semibold text-[#263242] transition hover:border-[#9eabba] hover:bg-[#f3f6fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#276fd3] active:scale-[0.98]"
            onClick={(event) => {
              event.stopPropagation();
              if (/^(?:[0-9a-f]{32}|[0-9a-f-]{36})$/i.test(contact.id)) {
                void fetch(`/api/contacts/${encodeURIComponent(contact.id)}/activity`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: kind }),
                  keepalive: true,
                })
                  .then(async (response) => {
                    if (!response.ok) return;
                    const payload = (await response.json()) as { activity?: { id?: string; summary?: string; channel?: string | null; occurredAt?: string; externalUrl?: string | null } };
                    const activity = payload.activity;
                    if (activity?.id && activity.summary && activity.occurredAt) {
                      onActivityLogged?.({
                        id: activity.id,
                        summary: activity.summary,
                        channel: activity.channel ?? null,
                        occurredAt: activity.occurredAt,
                        externalUrl: activity.externalUrl ?? null,
                      });
                    }
                  })
                  .catch(() => undefined);
              }
              setPendingAction(kind);
              setFollowUpDate(defaultFollowUpDate(kind, defaults));
              setError(null);
            }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className={labels === 'always' ? undefined : 'hidden xl:inline'}>{label}</span>
          </a>
        ))}
      </div>

      <Dialog.Root open={pendingAction !== null} onOpenChange={(open) => !open && closePrompt()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[5300] bg-[#17202d]/45" />
          <Dialog.Content
            className="fixed inset-x-3 bottom-[calc(var(--picc-bottom-nav-clearance)+12px)] z-[5301] mx-auto max-h-[calc(100dvh-var(--picc-bottom-nav-clearance)-32px)] max-w-md overflow-y-auto rounded-2xl border border-[#d4dae4] bg-[#f8fafc] p-4 shadow-[0_24px_70px_rgba(24,33,45,0.24)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-[19px] font-semibold text-[#18212d]">Set follow-up?</Dialog.Title>
                <Dialog.Description className="mt-1 text-[14px] leading-5 text-[#667183]">
                  {pendingAction ? `${actionMeta[pendingAction].launchedLabel} opened for ${contact.name}. Add the next touch while it is fresh.` : null}
                </Dialog.Description>
              </div>
              <Dialog.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#5f6978] hover:bg-[#e9edf3]" aria-label="Close follow-up prompt" disabled={saving}>
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            {accounts.length > 1 ? (
              <label className="mt-4 block text-[13px] font-semibold text-[#344052]">
                Account
                <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#cbd3df] bg-white px-3 text-[15px] text-[#18212d]">
                  <option value="">Choose an account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            ) : null}

            {accounts.length === 0 ? (
              <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                This contact is not linked to an account yet. Link an account before setting a follow-up.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: '3 days', days: 3 },
                    { label: '1 week', days: 7 },
                  ].map((option) => (
                    <button key={option.days} type="button" onClick={() => setFollowUpDate(dateAfter(option.days))} className="min-h-10 rounded-lg border border-[#cbd3df] bg-white px-2 text-[13px] font-semibold text-[#344052] hover:bg-[#f0f3f7] active:scale-[0.98]">
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="mt-3 block text-[13px] font-semibold text-[#344052]">
                  Follow-up date
                  <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#cbd3df] bg-white px-3 text-[16px] text-[#18212d]" />
                </label>

                <label className="mt-3 block text-[13px] font-semibold text-[#344052]">
                  Note <span className="font-normal text-[#7b8491]">(optional)</span>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What needs to happen next?" className="mt-1 h-11 w-full rounded-lg border border-[#cbd3df] bg-white px-3 text-[15px] font-normal text-[#18212d] placeholder:text-[#929ba8]" />
                </label>
              </>
            )}

            {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p> : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={closePrompt} disabled={saving} className="min-h-11 rounded-lg border border-[#cbd3df] bg-white px-3 text-[14px] font-semibold text-[#344052] disabled:opacity-60">
                Not now
              </button>
              <button type="button" onClick={() => void saveFollowUp()} disabled={saving || !selectedAccountId || !followUpDate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#c93412] px-3 text-[14px] font-semibold text-white transition hover:bg-[#ad2d0e] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#d7aaa0]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                {saving ? 'Saving' : 'Set follow-up'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
