'use client';
import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { Button, Input, Skeleton } from '@/components/ui';

type Status = {configured:boolean;encryptionReady:boolean;fromEmail:string;fromName:string;validatedAt:string|null};
const empty = {apiKey:'',apiSecret:'',fromEmail:'',fromName:'PICC'};
  async function request(method='GET',body?:unknown) {
    const response=await fetch('/api/integrations/mailjet',{method,headers:{'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Mailjet settings could not be updated.');return payload;
  }
export function MailjetConnectionCard() {
  const [status,setStatus]=useState<Status|null>(null);
  const [form,setForm]=useState(empty);
  const [editing,setEditing]=useState(false);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const testRequestId=useRef<string|null>(null);
  const [recipient,setRecipient]=useState('');
  const [confirmDisconnect,setConfirmDisconnect]=useState(false);
  const load = useCallback(async () => {
    setError('');try {setStatus(await request());}catch(e){setError(e instanceof Error?e.message:'Mailjet settings could not be loaded.');}
  }, []);
  useEffect(()=>{void load();},[load]);
  function edit() {setForm({...empty,fromEmail:status?.fromEmail||'',fromName:status?.fromName||'PICC'});setEditing(true);setNotice('');setError('');}
  async function save(event:FormEvent) {
    event.preventDefault();setWorking(true);setError('');setNotice('');
    try {setStatus(await request('PUT',form));setForm(empty);setEditing(false);setNotice('Mailjet connected. The sender is verified.');}catch(e){setError(e instanceof Error?e.message:'Connection failed.');}finally{setWorking(false);}
  }
  async function sendTest(event:FormEvent) {
    event.preventDefault();setWorking(true);setError('');setNotice('');
    try {testRequestId.current ??= crypto.randomUUID();await request('POST',{recipient,requestId:testRequestId.current});testRequestId.current=null;setNotice(`Mailjet accepted the test for ${recipient}. Check the recipient inbox and spam folder to confirm delivery.`);}catch(e){setError(e instanceof Error?e.message:'Test email could not be sent.');}finally{setWorking(false);}
  }
  async function disconnect() {
    setWorking(true);setError('');setNotice('');try{setStatus(await request('DELETE'));setConfirmDisconnect(false);setForm(empty);setNotice('Mailjet disconnected. Workspace email delivery is disabled.');}catch(e){setError(e instanceof Error?e.message:'Disconnect failed.');}finally{setWorking(false);}
  }
  return <section aria-labelledby="mailjet-title" className="space-y-4 border-t border-slate-200 pt-5">
    <div><div className="flex flex-wrap items-center gap-3"><h3 id="mailjet-title" className="text-lg font-semibold text-slate-900">Mailjet</h3>{status?<span className={`rounded-md px-2 py-1 text-xs font-semibold ${status.configured?'bg-emerald-50 text-emerald-800':'bg-slate-100 text-slate-600'}`}>{status.configured?'Connected':'Not connected'}</span>:null}</div><p className="mt-1 max-w-prose text-sm text-slate-600">Workspace email for alerts and manual debriefs. Only administrators can change this connection.</p></div>
    {error?<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}{!status?<Button variant="outline" className="ml-3" onClick={()=>void load()}>Try again</Button>:null}</div>:null}
    {notice?<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>:null}
    {!status&&!error?<div aria-label="Loading Mailjet settings" className="space-y-2"><Skeleton className="h-5 w-40"/><Skeleton className="h-10 w-full"/></div>:null}
    {status&&!status.encryptionReady?<p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Secure email setup needs an administrator deployment step before credentials can be saved.</p>:null}
    {status?.configured&&!editing?<div className="space-y-1 text-sm"><p className="font-medium text-slate-900">{status.fromName} &lt;{status.fromEmail}&gt;</p><p className="text-slate-500">Sender verified {status.validatedAt?new Date(status.validatedAt).toLocaleString():'at connection time'}.</p></div>:null}
    {status&&editing?<form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">API key<Input autoComplete="off" type="password" value={form.apiKey} required={!status.configured} maxLength={256} disabled={working} onChange={e=>setForm({...form,apiKey:e.target.value})}/></label>
      <label className="text-sm font-medium">API secret<Input autoComplete="new-password" type="password" value={form.apiSecret} required={!status.configured} maxLength={256} disabled={working} onChange={e=>setForm({...form,apiSecret:e.target.value})}/></label>
      {status.configured?<p className="text-xs text-slate-500 sm:col-span-2">Leave credentials blank to keep the saved keys. Saved secrets are never displayed.</p>:null}
      <label className="text-sm font-medium">Sender email<Input type="email" value={form.fromEmail} required maxLength={254} disabled={working} onChange={e=>setForm({...form,fromEmail:e.target.value})}/></label>
      <label className="text-sm font-medium">Sender name<Input value={form.fromName} required maxLength={100} disabled={working} onChange={e=>setForm({...form,fromName:e.target.value})}/></label>
      <p className="text-sm text-slate-600 sm:col-span-2">Use an address already verified in your <a href="https://app.mailjet.com/account/sender" target="_blank" rel="noreferrer" className="underline">Mailjet sender settings</a>. Saving checks credentials and sender status without sending email.</p>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={working||!status.encryptionReady}>{working?'Checking connection…':'Verify and save'}</Button><Button type="button" variant="outline" disabled={working} onClick={()=>{setEditing(false);setForm(empty);setError('');}}>Cancel</Button></div>
    </form>:status?<Button variant="outline" onClick={edit} disabled={working||!status.encryptionReady}>{status.configured?'Edit connection':'Connect Mailjet'}</Button>:null}
    {status?.configured&&!editing?<><form onSubmit={sendTest} className="space-y-2 border-t border-slate-200 pt-4"><label className="block max-w-md text-sm font-medium">Test recipient<Input type="email" value={recipient} required disabled={working} onChange={e=>setRecipient(e.target.value)}/></label><p className="text-xs text-slate-500">Sends one real test email to this address.</p><Button type="submit" variant="outline" disabled={working||!recipient}>{working?'Working…':'Send test email'}</Button></form><div className="border-t border-slate-200 pt-3">{confirmDisconnect?<div className="space-y-2"><p className="text-sm text-slate-700">Disconnecting removes saved credentials and stops Mailjet delivery for this workspace.</p><div className="flex gap-2"><Button variant="danger" disabled={working} onClick={()=>void disconnect()}>Confirm disconnect</Button><Button variant="outline" disabled={working} onClick={()=>setConfirmDisconnect(false)}>Cancel disconnect</Button></div></div>:<Button variant="ghost" disabled={working} onClick={()=>setConfirmDisconnect(true)}>Disconnect Mailjet</Button>}</div></>:null}
  </section>;
}
