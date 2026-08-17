'use client';

import { CheckCircle2, Copy, ExternalLink, Loader2, Mail, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type GmailStatus = {
  configuration: { configured: boolean; redirectUri: string | null };
  connection: { mailboxEmail: string; status: string; lastSyncedAt: string | null; lastError: string | null; updatedAt: string } | null;
};

export function GmailConnectionCard() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function load() {
    setError(null);
    try {
      const response = await fetch('/api/integrations/gmail', { cache: 'no-store' });
      const payload = (await response.json()) as GmailStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Gmail status could not be loaded.');
      setStatus(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gmail status could not be loaded.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function connect() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/gmail/connect', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || 'Gmail connection could not start.');
      window.location.assign(payload.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gmail connection could not start.');
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/gmail', { method: 'DELETE' });
      if (!response.ok) throw new Error('Gmail could not be disconnected.');
      setConfirmDisconnect(false);
      toast.success('Gmail disconnected');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gmail could not be disconnected.');
    } finally {
      setWorking(false);
    }
  }

  if (!status && error) {
    return (
      <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#c93412] shadow-sm"><Mail className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Gmail needs attention</p>
            <p className="mt-1 text-sm leading-6">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!status) return <div className="grid min-h-32 place-items-center rounded-2xl border border-[#d6dae2] bg-[#f7f9fc]"><Loader2 className="h-5 w-5 animate-spin text-[#6a7583]" /></div>;

  return (
    <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#c93412] shadow-sm"><Mail className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-[#18212d]">Gmail</h3>
            {status.connection ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</span> : <span className="rounded-full border border-[#d6dae2] bg-white px-2.5 py-1 text-xs font-semibold text-[#657081]">Not connected</span>}
          </div>
          <p className="mt-1 text-sm leading-6 text-[#5c6674]">Connect your own mailbox with read-only access. Other reps cannot see or use your Gmail connection.</p>
        </div>
      </div>

      {status.connection ? (
        <div className="mt-4 rounded-xl border border-[#d7e4d9] bg-white p-3">
          <p className="font-semibold text-[#263242]">{status.connection.mailboxEmail}</p>
          <p className="mt-1 text-xs text-[#667183]">Last refreshed: {status.connection.lastSyncedAt ? new Date(status.connection.lastSyncedAt).toLocaleString() : 'Not yet'}</p>
          {status.connection.lastError ? <p role="alert" className="mt-2 text-sm text-red-700">{status.connection.lastError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void connect()} disabled={working} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cbd3df] bg-white px-3 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Reconnect</button>
            {!confirmDisconnect ? <button type="button" onClick={() => setConfirmDisconnect(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-red-700"><Unplug className="h-4 w-4" /> Disconnect</button> : <><button type="button" onClick={() => setConfirmDisconnect(false)} className="min-h-10 rounded-lg border border-[#cbd3df] px-3 text-sm font-semibold">Cancel</button><button type="button" onClick={() => void disconnect()} disabled={working} className="min-h-10 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white">Confirm disconnect</button></>}
          </div>
        </div>
      ) : status.configuration.configured ? (
        <button type="button" onClick={() => void connect()} disabled={working} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c93412] px-4 text-sm font-semibold text-white disabled:opacity-60">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Connect my Gmail</button>
      ) : (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Administrator setup required</p>
          <p className="mt-1 leading-6">The deployment needs a Google OAuth client and token-encryption keys before reps can connect. Once configured, this card becomes the connection button.</p>
          {status.configuration.redirectUri ? <button type="button" onClick={() => { void navigator.clipboard.writeText(status.configuration.redirectUri!); toast.success('Redirect URI copied'); }} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 font-semibold"><Copy className="h-4 w-4" /> Copy redirect URI</button> : null}
        </div>
      )}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
