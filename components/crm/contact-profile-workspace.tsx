'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Archive, BellPlus, Check, ChevronLeft, Download, Instagram, Linkedin, Loader2, MoreHorizontal, Star, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import Link from 'next/link';
import { cloneElement, type ReactElement, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GmailConversations } from '@/components/crm/gmail-conversations';
import { ContactQuickActions, type ContactQuickActionAccount } from '@/components/crm/contact-quick-actions';
import { useAppAccess } from '@/components/auth/app-access-provider';
import type { RuntimeContactSummary } from '@/lib/runtime/account-contact-contract';
import { buildContactVCard, contactProfilePermissions, validateContactMerge } from '@/lib/contacts/contact-profile';
import { cn } from '@/lib/utils';

type Reminder = { id: string; dueAt: string; note: string; status: string };
type Activity = { id: string; summary: string; channel: string | null; occurredAt: string; externalUrl: string | null };
type ProfilePayload = {
  favorite: boolean;
  frequencyDays: number | null;
  lastSeenAt: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  archivedAt: string | null;
  mergedIntoPageId: string | null;
  reminders: Reminder[];
  activities: Activity[];
};
const blankProfile: ProfilePayload = {
  favorite: false,
  frequencyDays: null,
  lastSeenAt: null,
  instagramUrl: null,
  linkedinUrl: null,
  archivedAt: null,
  mergedIntoPageId: null,
  reminders: [],
  activities: [],
};

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

function formatWhen(value: string | null) {
  if (!value) return 'No interactions yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function ContactProfileWorkspace({ contact, accounts, contacts }: { contact: RuntimeContactSummary; accounts: ContactQuickActionAccount[]; contacts: RuntimeContactSummary[] }) {
  const appAccess = useAppAccess();
  const { canEditProfile, canManageLifecycle, canDeleteOrMerge } = contactProfilePermissions(appAccess.role);
  const [profile, setProfile] = useState<ProfilePayload>(blankProfile);
  const [tab, setTab] = useState<'timeline' | 'reminders' | 'details'>('timeline');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const profileUrl = `/api/contacts/${encodeURIComponent(contact.id)}/profile`;
  useEffect(() => {
    let cancelled = false;
    void fetch(profileUrl)
      .then(async (response) => {
        const payload = (await response.json()) as { profile?: ProfilePayload; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Contact profile could not be loaded.');
        if (!cancelled) setProfile({ ...blankProfile, ...payload.profile });
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : 'Contact profile could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [profileUrl]);

  const mergeOptions = useMemo(() => {
    const query = mergeSearch.trim().toLocaleLowerCase('en-US');
    return contacts
      .filter((candidate) => candidate.id !== contact.id && (!query || `${candidate.name} ${candidate.accountName} ${candidate.email}`.toLocaleLowerCase('en-US').includes(query)))
      .slice(0, 50);
  }, [contact.id, contacts, mergeSearch]);

  async function saveProfile(changes: Partial<Pick<ProfilePayload, 'favorite' | 'frequencyDays' | 'lastSeenAt' | 'instagramUrl' | 'linkedinUrl'>>) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(profileUrl, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const payload = (await response.json().catch(() => ({}))) as { profile?: ProfilePayload; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Contact profile could not be saved.');
      setProfile((current) => ({ ...current, ...payload.profile }));
      toast.success('Contact details saved');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Contact profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function addReminder() {
    if (!reminderDate || !reminderNote.trim()) {
      setError('Choose a reminder date and enter the next action.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}/reminders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dueAt: new Date(`${reminderDate}T12:00:00`).toISOString(), note: reminderNote.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { reminder?: Reminder; error?: string };
      if (!response.ok || !payload.reminder) throw new Error(payload.error || 'Reminder could not be saved.');
      setProfile((current) => ({ ...current, reminders: [...current.reminders, payload.reminder!].sort((a, b) => a.dueAt.localeCompare(b.dueAt)) }));
      setReminderDate('');
      setReminderNote('');
      toast.success('Reminder added');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reminder could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function lifecycle(action: 'archive' | 'unarchive' | 'delete' | 'merge') {
    setSaving(true);
    setError(null);
    try {
      const body = action === 'merge' ? validateContactMerge({ sourceId: contact.id, targetId: mergeTargetId }) : {};
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}/lifecycle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(payload.error || `Contact could not be ${action}d.`);
      toast.success(action === 'merge' ? 'Contacts merged' : action === 'archive' ? 'Contact archived' : action === 'unarchive' ? 'Contact restored' : 'Contact deleted');
      window.location.assign(payload.redirectTo || '/contacts');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Contact maintenance action failed.');
      setSaving(false);
    }
  }

  async function updateReminder(reminderId: string, status: 'DONE' | 'CANCELLED') {
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(contact.id)}/reminders/${encodeURIComponent(reminderId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Reminder could not be updated.');
      setProfile((current) => ({ ...current, reminders: current.reminders.map((reminder) => reminder.id === reminderId ? { ...reminder, status } : reminder) }));
      toast.success(status === 'DONE' ? 'Reminder completed' : 'Reminder dismissed');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reminder could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function saveToPhone() {
    const vcard = buildContactVCard({
      name: contact.name,
      company: contact.accountName,
      roleTitle: contact.roleTitle,
      email: contact.email,
      phone: contact.phone,
      instagramUrl: profile.instagramUrl,
      linkedinUrl: profile.linkedinUrl,
    });
    const file = new File([vcard], `${contact.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.vcf`, { type: 'text/vcard' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Save ${contact.name}` });
      return;
    }
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] pb-28 text-[#18212d]">
      <div className="mx-auto max-w-3xl px-4 py-4 md:px-6">
        <div className="flex items-center justify-between">
          <Link href="/contacts" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#526071] hover:bg-white"><ChevronLeft className="h-4 w-4" /> Contacts</Link>
          <div className="relative flex items-center gap-1">
            {canEditProfile ? <button type="button" disabled={loading || saving} onClick={() => { const favorite = !profile.favorite; setProfile((current) => ({ ...current, favorite })); void saveProfile({ favorite }); }} className="grid h-11 w-11 place-items-center rounded-xl border border-[#d5dce7] bg-white disabled:cursor-not-allowed disabled:opacity-50" aria-label={profile.favorite ? 'Remove from favorites' : 'Add to favorites'}>
              <Star className={cn('h-5 w-5', profile.favorite ? 'fill-amber-400 text-amber-500' : 'text-[#657081]')} />
            </button> : profile.favorite ? <span className="grid h-11 w-11 place-items-center" aria-label="Favorite contact"><Star className="h-5 w-5 fill-amber-400 text-amber-500" /></span> : null}
            {canManageLifecycle || canDeleteOrMerge ? <button type="button" disabled={loading || saving} onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-xl border border-[#d5dce7] bg-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Contact options"><MoreHorizontal className="h-5 w-5" /></button> : null}
            {menuOpen ? (
              <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-[#d5dce7] bg-white p-1.5 shadow-xl">
                {canDeleteOrMerge ? <button type="button" onClick={() => { setMenuOpen(false); setMergeOpen(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-[#f1f4f8]"><UsersRound className="h-4 w-4" /> Merge with</button> : null}
                {canManageLifecycle ? <button type="button" onClick={() => void lifecycle(profile.archivedAt ? 'unarchive' : 'archive')} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-[#f1f4f8]"><Archive className="h-4 w-4" /> {profile.archivedAt ? 'Restore' : 'Archive'}</button> : null}
                {canDeleteOrMerge ? <button type="button" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button> : null}
              </div>
            ) : null}
          </div>
        </div>

        <section className="mt-3 rounded-2xl border border-[#d9e0ea] bg-white p-4 shadow-[0_12px_36px_rgba(24,33,45,0.07)]">
          <div className="flex items-start gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#eaf0fb] text-[#315d9c]"><UserRound className="h-7 w-7" /></div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.03em]">{contact.name}</h1>
              <p className="truncate text-sm text-[#677383]">{contact.roleTitle} · {contact.accountName}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5f6d7d]">
                <button type="button" onClick={() => setTab('details')} className="font-semibold text-[#315d9c] hover:underline">{profile.frequencyDays ? `Every ${profile.frequencyDays} days` : 'Set frequency'}</button>
                <span>{profile.lastSeenAt ? `Last seen ${formatWhen(profile.lastSeenAt)}` : 'Last seen: not recorded'}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ContactQuickActions contact={contact} accounts={accounts} labels="always" onActivityLogged={(activity) => setProfile((current) => ({
              ...current,
              lastSeenAt: !current.lastSeenAt || activity.occurredAt > current.lastSeenAt ? activity.occurredAt : current.lastSeenAt,
              activities: current.activities.some((item) => item.id === activity.id)
                ? current.activities
                : [activity, ...current.activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
            }))} />
            {profile.instagramUrl ? <a href={profile.instagramUrl} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-lg border border-[#cfd6e1] bg-white" aria-label={`Open ${contact.name} on Instagram`}><Instagram className="h-4 w-4" /></a> : null}
            {profile.linkedinUrl ? <a href={profile.linkedinUrl} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-lg border border-[#cfd6e1] bg-white" aria-label={`Open ${contact.name} on LinkedIn`}><Linkedin className="h-4 w-4" /></a> : null}
            <button type="button" onClick={() => void saveToPhone()} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cfd6e1] bg-white px-3 text-sm font-semibold"><Download className="h-4 w-4" /> Save to phone</button>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 rounded-xl border border-[#d8dee8] bg-[#e9edf3] p-1">
          {(['timeline', 'reminders', 'details'] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={cn('min-h-10 rounded-lg text-sm font-semibold capitalize', tab === value ? 'bg-white text-[#18212d] shadow-sm' : 'text-[#687486]')}>{value}</button>)}
        </div>

        {loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#647184]" /></div> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

        {!loading && tab === 'timeline' ? (
          <section className="mt-4 space-y-2">
            <GmailConversations kind="contact" recordId={contact.id} />
            {profile.activities.length ? profile.activities.map((activity) => (
              <a key={activity.id} href={activity.externalUrl || undefined} className={cn('block rounded-xl border border-[#dce2eb] bg-white px-4 py-3', activity.externalUrl ? 'hover:border-[#9db8f7]' : 'pointer-events-none')}>
                <div className="flex items-center justify-between gap-3"><p className="font-semibold">{activity.summary}</p><time className="shrink-0 text-xs text-[#738091]">{formatWhen(activity.occurredAt)}</time></div>
                <p className="mt-1 text-xs uppercase tracking-wide text-[#7a8492]">{activity.channel || 'Activity'}</p>
              </a>
            )) : <EmptyState title="No other activity yet" detail="Email, text, and call launches will appear here after you use the contact actions." />}
          </section>
        ) : null}

        {!loading && tab === 'reminders' ? (
          <section className="mt-4 space-y-3">
            {canEditProfile ? <div className="rounded-xl border border-[#dce2eb] bg-white p-4">
              <h2 className="font-semibold">New reminder</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                <input type="date" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} className="h-11 rounded-lg border border-[#cbd3df] px-3" aria-label="Reminder date" />
                <input value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} placeholder="What should happen next?" className="h-11 rounded-lg border border-[#cbd3df] px-3" />
                <button type="button" onClick={() => void addReminder()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#c93412] px-4 font-semibold text-white disabled:opacity-50"><BellPlus className="h-4 w-4" /> Add</button>
              </div>
            </div> : null}
            {profile.reminders.length ? profile.reminders.map((reminder) => <div key={reminder.id} className={cn('rounded-xl border border-[#dce2eb] bg-white px-4 py-3', reminder.status !== 'OPEN' && 'opacity-60')}><div className="flex items-start justify-between gap-3"><div><p className={cn('font-semibold', reminder.status !== 'OPEN' && 'line-through')}>{reminder.note}</p><p className="mt-1 text-sm text-[#687486]">Due {formatWhen(reminder.dueAt)} · {reminder.status.toLowerCase()}</p></div>{reminder.status === 'OPEN' && canEditProfile ? <div className="flex shrink-0 gap-1"><button type="button" onClick={() => void updateReminder(reminder.id, 'DONE')} className="grid h-10 w-10 place-items-center rounded-lg border border-[#cbd3df]" aria-label={`Complete reminder ${reminder.note}`}><Check className="h-4 w-4" /></button><button type="button" onClick={() => void updateReminder(reminder.id, 'CANCELLED')} className="grid h-10 w-10 place-items-center rounded-lg border border-[#cbd3df]" aria-label={`Dismiss reminder ${reminder.note}`}><X className="h-4 w-4" /></button></div> : null}</div></div>) : <EmptyState title="No reminders" detail={canEditProfile ? 'Add a reminder so this relationship does not go quiet.' : 'No reminders are recorded for this contact.'} />}
          </section>
        ) : null}

        {!loading && tab === 'details' ? (
          <section className="mt-4 rounded-xl border border-[#dce2eb] bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileField label="Contact frequency (days)"><input disabled={!canEditProfile} type="number" min={1} max={365} value={profile.frequencyDays ?? ''} onChange={(event) => setProfile((current) => ({ ...current, frequencyDays: event.target.value ? Number(event.target.value) : null }))} /></ProfileField>
              <ProfileField label="Last seen"><input disabled={!canEditProfile} type="date" value={dateInputValue(profile.lastSeenAt)} onChange={(event) => setProfile((current) => ({ ...current, lastSeenAt: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : null }))} /></ProfileField>
              <ProfileField label="Instagram"><input disabled={!canEditProfile} type="url" placeholder="https://instagram.com/..." value={profile.instagramUrl ?? ''} onChange={(event) => setProfile((current) => ({ ...current, instagramUrl: event.target.value }))} /></ProfileField>
              <ProfileField label="LinkedIn"><input disabled={!canEditProfile} type="url" placeholder="https://linkedin.com/in/..." value={profile.linkedinUrl ?? ''} onChange={(event) => setProfile((current) => ({ ...current, linkedinUrl: event.target.value }))} /></ProfileField>
            </div>
            <div className="mt-4 grid gap-2 rounded-lg bg-[#f4f6f9] p-3 text-sm sm:grid-cols-2"><p><span className="font-semibold">Email:</span> {contact.email}</p><p><span className="font-semibold">Phone:</span> {contact.phone}</p><p><span className="font-semibold">Company:</span> {contact.accountName}</p><p><span className="font-semibold">Source:</span> {contact.linkedWork}</p></div>
            {canEditProfile ? <button type="button" onClick={() => void saveProfile({ frequencyDays: profile.frequencyDays, lastSeenAt: profile.lastSeenAt, instagramUrl: profile.instagramUrl?.trim() || null, linkedinUrl: profile.linkedinUrl?.trim() || null })} disabled={saving} className="mt-4 min-h-11 rounded-lg bg-[#c93412] px-5 font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save details'}</button> : null}
          </section>
        ) : null}
      </div>

      <Dialog.Root open={mergeOpen} onOpenChange={setMergeOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[5400] bg-[#17202d]/45" /><Dialog.Content className="fixed inset-x-3 bottom-[calc(var(--picc-bottom-nav-clearance)+12px)] z-[5401] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"><div className="flex items-start justify-between"><div><Dialog.Title className="text-lg font-semibold">Merge {contact.name}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[#687486]">Choose the contact to keep. Activity and reminders move to that record, and the kept contact is restored if it was archived.</Dialog.Description></div><Dialog.Close className="grid h-10 w-10 place-items-center" aria-label="Close merge"><X className="h-5 w-5" /></Dialog.Close></div><input value={mergeSearch} onChange={(event) => setMergeSearch(event.target.value)} placeholder="Search contacts" className="mt-4 h-11 w-full rounded-lg border border-[#cbd3df] px-3" /><div className="mt-2 max-h-52 overflow-y-auto">{mergeOptions.map((candidate) => <button key={candidate.id} type="button" onClick={() => setMergeTargetId(candidate.id)} className={cn('w-full rounded-lg px-3 py-2 text-left', mergeTargetId === candidate.id ? 'bg-[#fff0eb]' : 'hover:bg-[#f3f5f8]')}><p className="font-semibold">{candidate.name}</p><p className="text-xs text-[#738091]">{candidate.accountName} · {candidate.email}</p></button>)}</div><button type="button" disabled={saving || !mergeTargetId} onClick={() => void lifecycle('merge')} className="mt-4 min-h-11 w-full rounded-lg bg-[#c93412] font-semibold text-white disabled:opacity-50">Merge into selected contact</button></Dialog.Content></Dialog.Portal></Dialog.Root>

      <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[5400] bg-[#17202d]/45" /><Dialog.Content className="fixed inset-x-3 bottom-[calc(var(--picc-bottom-nav-clearance)+12px)] z-[5401] mx-auto max-w-sm rounded-2xl bg-white p-4 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"><Dialog.Title className="text-lg font-semibold text-red-800">Delete {contact.name}?</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-[#687486]">This moves the live CRM contact to trash. This is different from Archive and cannot be undone in this app.</Dialog.Description><div className="mt-4 grid grid-cols-2 gap-2"><Dialog.Close className="min-h-11 rounded-lg border border-[#cbd3df] font-semibold">Cancel</Dialog.Close><button type="button" disabled={saving} onClick={() => void lifecycle('delete')} className="min-h-11 rounded-lg bg-red-700 font-semibold text-white disabled:opacity-50">Delete contact</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="rounded-xl border border-dashed border-[#cfd6e1] bg-white px-5 py-10 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-[#738091]">{detail}</p></div>; }
function ProfileField({ label, children }: { label: string; children: ReactElement<{ className?: string }> }) { return <label className="text-sm font-semibold text-[#344052]">{label}{cloneElement(children, { className: cn('mt-2 h-11 w-full rounded-lg border border-[#cbd3df] bg-white px-3 font-normal', children.props.className) })}</label>; }
