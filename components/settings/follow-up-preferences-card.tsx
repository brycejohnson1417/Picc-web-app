'use client';

import { BellRing, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Preference = {
  defaultEmailDays: number;
  defaultTextDays: number;
  defaultCallDays: number;
  resurfaceAfterDays: number;
  dailyBriefingEnabled: boolean;
  dailyBriefingTime: string;
  timezone: string;
  briefingRecipientEmail: string | null;
};

export function FollowUpPreferencesCard() {
  const [value, setValue] = useState<Preference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/settings/follow-up-preferences', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { preference?: Preference; error?: string };
        if (!response.ok || !payload.preference) throw new Error(payload.error || 'Preferences could not be loaded.');
        setValue(payload.preference);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Preferences could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(showToast = true) {
    if (!value) return false;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/follow-up-preferences', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
      const payload = (await response.json().catch(() => ({}))) as { preference?: Preference; error?: string };
      if (!response.ok || !payload.preference) throw new Error(payload.error || 'Preferences could not be saved.');
      setValue(payload.preference);
      window.dispatchEvent(new CustomEvent('picc:follow-up-preferences', { detail: payload.preference }));
      if (showToast) toast.success('Follow-up defaults saved');
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preferences could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendPreview() {
    setSendingPreview(true);
    setError(null);
    try {
      if (!(await save(false))) return;
      const response = await fetch('/api/settings/follow-up-preferences/send-preview', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { recipientEmail?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Daily debrief preview could not be sent.');
      toast.success('Daily debrief sent', { description: payload.recipientEmail });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Daily debrief preview could not be sent.');
    } finally {
      setSendingPreview(false);
    }
  }

  if (loading) return <div className="grid min-h-36 place-items-center rounded-2xl border border-[#d6dae2] bg-[#f7f9fc]"><Loader2 className="h-5 w-5 animate-spin text-[#6a7583]" /></div>;
  if (!value) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || 'Preferences could not be loaded.'}</div>;

  const numberField = (label: string, key: 'defaultEmailDays' | 'defaultTextDays' | 'defaultCallDays' | 'resurfaceAfterDays', min = 1) => <label className="text-sm font-semibold text-[#344052]">{label}<div className="mt-2 flex items-center rounded-lg border border-[#cbd3df] bg-white"><input type="number" min={min} max={365} value={value[key]} onChange={(event) => setValue((current) => current ? { ...current, [key]: Number(event.target.value) } : current)} className="h-11 min-w-0 flex-1 rounded-lg px-3 font-normal outline-none" /><span className="pr-3 text-xs text-[#788291]">days</span></div></label>;

  return <div className="rounded-2xl border border-[#d6dae2] bg-[#f7f9fc] p-4">
    <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#c93412] shadow-sm"><BellRing className="h-5 w-5" /></div><div><h3 className="text-lg font-semibold text-[#18212d]">Follow-up defaults</h3><p className="mt-1 text-sm leading-6 text-[#5c6674]">These dates prefill the prompt after you email, text, or call. You can still change any date before saving.</p></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{numberField('After email', 'defaultEmailDays')}{numberField('After text', 'defaultTextDays')}{numberField('After call', 'defaultCallDays')}{numberField('Resurface quiet contacts', 'resurfaceAfterDays', 7)}</div>
    <div className="mt-5 space-y-3 border-t border-[#dce2eb] pt-4"><div><h4 className="font-semibold text-[#263242]">Daily debrief</h4><p className="mt-1 text-sm text-amber-900">Scheduled emails are paused. You can send a debrief manually after an administrator connects Mailjet.</p></div><label className="block max-w-md text-sm font-semibold text-[#344052]">Manual debrief recipient<input type="email" value={value.briefingRecipientEmail ?? ''} onChange={(event) => setValue({ ...value, briefingRecipientEmail: event.target.value || null })} className="mt-2 h-11 w-full rounded-lg border border-[#cbd3df] px-3 font-normal" /></label></div>
    {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void save()} disabled={saving || sendingPreview} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c93412] px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving…' : 'Save follow-up settings'}</button><button type="button" onClick={() => void sendPreview()} disabled={saving || sendingPreview || !value.briefingRecipientEmail} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#cbd3df] bg-white px-4 text-sm font-semibold text-[#344052] disabled:opacity-50">{sendingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}{sendingPreview ? 'Sending…' : 'Send debrief now'}</button></div>
  </div>;
}
