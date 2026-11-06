'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Loader2, Plus, RotateCw, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  buildContactCreatePayload,
  contactCreateMessage,
  filterContactAccounts,
  type ContactAccountOption,
  type ContactCreateStatus,
} from '@/lib/contacts/contact-create-model';
import { CONTACT_ROLE_OPTIONS, type ContactRole } from '@/lib/contacts/contact-profile';
import { cn } from '@/lib/utils';

type ContactResponse = {
  status: ContactCreateStatus;
  contact: { id: string; name: string };
  retry?: { accountPageId: string; contactPageId: string };
};

type RoleCollision = {
  role: ContactRole;
  label: string;
  existingContacts: Array<{ id: string; name: string }>;
};

const emptyDraft = {
  accountPageId: '',
  name: '',
  position: '',
  email: '',
  phone: '',
  roles: [] as ContactRole[],
};

export function ContactCreateFlow({ accounts, triggerVariant = 'default' }: { accounts: ContactAccountOption[]; triggerVariant?: 'default' | 'icon' | 'compact' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOpen = searchParams.get('new') === '1';
  const requestedAccount = searchParams.get('account') ?? '';
  const requestedName = searchParams.get('name') ?? '';
  const requestedEmail = searchParams.get('email') ?? '';
  const [open, setOpen] = useState(requestedOpen);
  const [draft, setDraft] = useState({ ...emptyDraft, accountPageId: requestedAccount, name: requestedName, email: requestedEmail });
  const [availableAccounts, setAvailableAccounts] = useState(accounts);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsRequested, setAccountsRequested] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ContactResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleCollisions, setRoleCollisions] = useState<RoleCollision[]>([]);

  useEffect(() => {
    if (requestedOpen) {
      setOpen(true);
      setDraft((current) => ({ ...current, accountPageId: requestedAccount || current.accountPageId, name: requestedName || current.name, email: requestedEmail || current.email }));
    }
  }, [requestedAccount, requestedEmail, requestedName, requestedOpen]);

  async function loadAccountsIfNeeded() {
    if (availableAccounts.length > 0 || loadingAccounts || accountsRequested) return;
    setAccountsRequested(true);
    setLoadingAccounts(true);
    try {
      const response = await fetch('/api/runtime/account-contact');
      if (!response.ok) throw new Error('Accounts could not be loaded.');
      const payload = (await response.json()) as { accounts?: ContactAccountOption[] };
      setAvailableAccounts(payload.accounts ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Accounts could not be loaded.');
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    void loadAccountsIfNeeded();
    // This only runs when the server-rendered runtime could not provide accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsRequested, availableAccounts.length, loadingAccounts]);

  const filteredAccounts = useMemo(
    () => filterContactAccounts(availableAccounts, accountSearch).slice(0, 60),
    [accountSearch, availableAccounts],
  );
  const selectedAccount = availableAccounts.find((account) => account.notionPageId === draft.accountPageId);

  function selectAccount(accountPageId: string) {
    setRoleCollisions([]);
    setDraft((current) => ({ ...current, accountPageId }));
  }

  function toggleRole(role: ContactRole, checked: boolean) {
    setRoleCollisions([]);
    setDraft((current) => ({
      ...current,
      roles: checked ? current.roles.filter((value) => value !== role) : [...current.roles, role],
    }));
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setResult(null);
      setError(null);
      setRoleCollisions([]);
      setSubmitting(false);
      setDraft(emptyDraft);
      setAccountSearch('');
      if (requestedOpen) router.replace('/contacts', { scroll: false });
    }
  }

  async function submit(event: { preventDefault(): void }, overwriteRoles = false) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildContactCreatePayload(draft, overwriteRoles)),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | (ContactResponse & { error?: string })
        | { status: 'role_collision'; contact: null; collisions: RoleCollision[]; error?: string };
      if (response.status === 409 && payload.status === 'role_collision') {
        setRoleCollisions(payload.collisions ?? []);
        return;
      }
      if (!response.ok && response.status !== 202) {
        throw new Error(payload.error || 'Contact could not be saved.');
      }
      if (payload.status === 'role_collision') throw new Error('Contact roles need review before saving.');
      setResult(payload);
      setRoleCollisions([]);
      toast[payload.status === 'partial_relation' ? 'warning' : 'success'](
        contactCreateMessage(payload.status),
      );
      if (payload.status !== 'partial_relation') router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Contact could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  async function retryRelationship() {
    if (!result?.retry) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/contacts/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result.retry),
      });
      const payload = (await response.json().catch(() => ({}))) as ContactResponse & { error?: string };
      if (!response.ok && response.status !== 202) throw new Error(payload.error || 'Link verification failed.');
      setResult(payload);
      if (payload.status !== 'partial_relation') {
        toast.success(contactCreateMessage(payload.status));
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Link verification failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={() => void loadAccountsIfNeeded()}
          aria-label={triggerVariant === 'icon' ? 'Add contact' : undefined}
          title={triggerVariant === 'icon' ? 'Add contact' : undefined}
          className={cn(
            'inline-flex items-center justify-center font-semibold transition active:scale-[0.98]',
            triggerVariant === 'compact'
              ? 'h-8 gap-1 rounded-md border border-[#dedfd8] bg-[#fdfdfb] px-2 text-[11px] text-[#4e5849] hover:bg-[#f2f3ee]'
              : 'bg-[#c93412] text-white hover:bg-[#ad2d0e]',
            triggerVariant === 'icon'
              ? 'h-10 w-10 rounded-lg shadow'
              : triggerVariant === 'default' ? 'min-h-11 gap-2 whitespace-nowrap rounded-xl px-4 text-sm shadow-[0_8px_18px_rgba(201,52,18,0.22)]' : '',
          )}
        >
          <Plus className="h-4 w-4" />
          {triggerVariant !== 'icon' ? 'Add contact' : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[5000] bg-[#111722]/55 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[5001] max-h-[92dvh] overflow-y-auto rounded-t-[24px] border border-[#d7dde7] bg-[#f8fafc] shadow-[0_-20px_60px_rgba(17,23,34,0.24)] md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[88dvh] md:w-[min(620px,calc(100vw-32px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[24px]">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#dce2eb] bg-[#f8fafc]/95 px-5 py-4 backdrop-blur">
            <div>
              <Dialog.Title className="text-xl font-semibold tracking-[-0.02em] text-[#18212d]">Add contact</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[#667183]">
                Save once, then verify the contact on both sides of the account relationship.
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#5f6978] hover:bg-[#e9edf3]" aria-label="Close add contact">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {result ? (
            <div className="space-y-5 p-5">
              <div className={cn('rounded-2xl border p-5', result.status === 'partial_relation' ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50')}>
                <CheckCircle2 className={cn('h-7 w-7', result.status === 'partial_relation' ? 'text-amber-700' : 'text-emerald-700')} />
                <h2 className="mt-3 text-lg font-semibold text-[#18212d]">{result.contact.name}</h2>
                <p className="mt-1 text-sm leading-6 text-[#536071]">{contactCreateMessage(result.status)}</p>
              </div>
              {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => changeOpen(false)} className="min-h-11 rounded-xl border border-[#cfd6e1] bg-white px-4 text-sm font-semibold text-[#263242]">Done</button>
                {result.status === 'partial_relation' ? (
                  <button type="button" disabled={submitting} onClick={() => void retryRelationship()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#c93412] px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                    Retry link verification
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <form className="space-y-5 p-5" onSubmit={submit}>
              <fieldset>
                <legend className="text-sm font-semibold text-[#263242]">Account <span className="text-[#c93412]">*</span></legend>
                {selectedAccount ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#b8c5d7] bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#18212d]">{selectedAccount.name}</p>
                      <p className="text-xs text-[#6a7483]">{[selectedAccount.city, selectedAccount.state].filter(Boolean).join(', ') || 'Location unavailable'}</p>
                    </div>
                    <button type="button" onClick={() => selectAccount('')} className="text-sm font-semibold text-[#c93412]">Change</button>
                  </div>
                ) : (
                  <div className="mt-2 overflow-hidden rounded-xl border border-[#cfd6e1] bg-white">
                    <label className="flex items-center gap-2 border-b border-[#e0e5ed] px-3">
                      <Search className="h-4 w-4 text-[#7b8491]" />
                      <span className="sr-only">Search accounts</span>
                      <input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Search dispensary or city" className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#9aa2ad]" />
                    </label>
                    <div className="max-h-44 overflow-y-auto p-1.5">
                      {loadingAccounts ? (
                        <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-[#77818f]"><Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…</p>
                      ) : filteredAccounts.length ? filteredAccounts.map((account) => (
                        <button key={account.notionPageId} type="button" onClick={() => selectAccount(account.notionPageId)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f1f4f8]">
                          <span className="truncate text-sm font-medium text-[#253142]">{account.name}</span>
                          <span className="shrink-0 text-xs text-[#7a8492]">{[account.city, account.state].filter(Boolean).join(', ')}</span>
                        </button>
                      )) : <p className="px-3 py-6 text-center text-sm text-[#77818f]">No matching accounts</p>}
                    </div>
                  </div>
                )}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <ContactField label="Full name" required value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} autoComplete="name" />
                <ContactField label="Role / position" required value={draft.position} onChange={(value) => setDraft((current) => ({ ...current, position: value }))} autoComplete="organization-title" />
                <ContactField label="Email" type="email" value={draft.email} onChange={(value) => setDraft((current) => ({ ...current, email: value }))} autoComplete="email" />
                <ContactField label="Phone" type="tel" value={draft.phone} onChange={(value) => setDraft((current) => ({ ...current, phone: value }))} autoComplete="tel" />
              </div>

              <fieldset>
                <legend className="text-sm font-semibold text-[#263242]">Contact type</legend>
                <p className="mt-1 text-xs leading-5 text-[#6a7483]">Select every CRM role this person fills.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CONTACT_ROLE_OPTIONS.map((role) => {
                    const checked = draft.roles.includes(role.value);
                    return (
                      <label key={role.value} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition', checked ? 'border-[#c93412] bg-[#fff2ee] text-[#8f260e]' : 'border-[#cfd6e1] bg-white text-[#344052] hover:bg-[#f3f6fa]')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(role.value, checked)}
                          className="h-4 w-4 accent-[#c93412]"
                        />
                        {role.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {roleCollisions.length > 0 ? (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold">These CRM roles already have a contact</p>
                  <ul className="mt-2 space-y-1">
                    {roleCollisions.map((collision) => (
                      <li key={collision.role}>{collision.label}: {collision.existingContacts.map((contact) => contact.name).join(', ')}</li>
                    ))}
                  </ul>
                  <p className="mt-2 leading-5">Replacing them changes the live CRM. Nothing has been overwritten yet.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setRoleCollisions([])} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 font-semibold">Keep existing</button>
                    <button type="button" disabled={submitting} onClick={(event) => void submit(event, true)} className="min-h-10 rounded-lg bg-[#9a3412] px-3 font-semibold text-white disabled:opacity-60">Replace and save</button>
                  </div>
                </div>
              ) : null}

              {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
              <div className="flex flex-col-reverse gap-2 border-t border-[#e0e5ed] pt-4 sm:flex-row sm:justify-end">
                <Dialog.Close className="min-h-11 rounded-xl border border-[#cfd6e1] bg-white px-4 text-sm font-semibold text-[#263242]">Cancel</Dialog.Close>
                <button type="submit" disabled={submitting || !draft.accountPageId || !draft.name.trim() || !draft.position.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#c93412] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? 'Saving and verifying…' : 'Save contact'}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ContactField({ label, required, type = 'text', value, onChange, autoComplete }: { label: string; required?: boolean; type?: string; value: string; onChange: (value: string) => void; autoComplete?: string }) {
  return (
    <label className="block text-sm font-semibold text-[#263242]">
      {label} {required ? <span className="text-[#c93412]">*</span> : null}
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className="mt-2 h-12 w-full rounded-xl border border-[#cfd6e1] bg-white px-3 text-base font-normal text-[#18212d] outline-none transition focus:border-[#c93412] focus:ring-2 focus:ring-[#c93412]/15" />
    </label>
  );
}
