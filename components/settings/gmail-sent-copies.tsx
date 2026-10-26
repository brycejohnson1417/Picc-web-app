'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button, Skeleton } from '@/components/ui';
type CopyRow={id:string;recipient:string;subject:string;sendState:string;copyState:string;sentAt:string|null;createdAt:string;gmailMessageId:string|null};
type Status={enabled:boolean;authorized:boolean;mailboxEmail:string;messages:CopyRow[]};
const labels:Record<string,string>={WAITING:'Send not confirmed',PENDING:'Copy pending',COPYING:'Checking copy',SAVED:'Saved in Gmail Sent',RETRY:'Copy needs retry',UNCERTAIN:'Copy needs verification'};
export function GmailSentCopies(){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  const response=await fetch('/api/integrations/gmail/sent-copies',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load Sent copies.');setStatus(data);
 },[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function act(action:'toggle'|'authorize'|'retry',id?:string){
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(action==='authorize'?'/api/integrations/gmail/connect':'/api/integrations/gmail/sent-copies',{method:action==='toggle'?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='authorize'?{sentCopies:true}:action==='toggle'?{enabled:!status?.enabled}:{id})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update Sent copies.');
   if(action==='authorize'){window.location.assign(data.authorizationUrl);return;}
   await load();setNotice(action==='retry'?'Copy status checked. No email was resent.':'Sent-copy preference saved.');
  }catch(e){setError(e instanceof Error?e.message:'Could not update Sent copies.');}finally{setBusy(false);}
 }
 return <section aria-label="Gmail Sent copies" className="mt-5 border-t border-slate-200 pt-4 text-slate-900">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Save Mailjet emails in Gmail Sent</h4>{status?<span className={`rounded-md px-2 py-1 text-xs font-semibold ${status.enabled?'bg-emerald-50 text-emerald-800':'bg-slate-100 text-slate-700'}`}>{status.enabled?'On':'Off'}</span>:null}</div>
  <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600">Save a copy after PICC sends through Mailjet using your connected Gmail address. Saving and retrying a copy never sends the email again.</p>
  <p className="mt-1 text-xs leading-5 text-slate-600">Applies to emails sent through this app. Emails sent directly from Mailjet or another service are not copied.</p>
  {!status&&!error?<Skeleton className="mt-3 h-11 w-48"/>:null}
  {error?<p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}
  {notice?<p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>:null}
  <div className="mt-3 flex flex-wrap gap-2">{status?<Button variant="outline" disabled={busy} onClick={()=>void act(status.authorized?'toggle':'authorize')}>{busy?'Working…':status.enabled?'Turn off Sent copies':status.authorized?'Turn on Sent copies':'Enable Gmail Sent copies'}</Button>:null}<Button variant="ghost" disabled={busy} onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>Refresh copy status</Button></div>
  {status&&!status.authorized?<p className="mt-2 text-xs leading-5 text-slate-600">Google will ask for permission to add messages to your mailbox. This feature does not request permission to send email through Gmail.</p>:null}
  {status?<details className="mt-4"><summary className="cursor-pointer py-2 text-sm font-medium">Recent emails ({status.messages.length})</summary>{!status.messages.length?<p className="py-2 text-sm text-slate-600">No app-sent emails from {status.mailboxEmail} yet. New messages will appear here.</p>:<ul className="divide-y divide-slate-200">{status.messages.map(row=><li key={row.id} className="space-y-1 py-3"><p className="break-words text-sm font-medium">{row.subject}</p><p className="break-all text-xs text-slate-600">To {row.recipient} · {new Date(row.sentAt||row.createdAt).toLocaleString()}</p><p className={`text-sm ${row.copyState==='SAVED'?'text-emerald-800':'text-slate-700'}`}>{labels[row.copyState]||'Copy pending'}</p>{row.sendState!=='SENT'?<p className="text-xs leading-5 text-amber-900">Mailjet acceptance is unconfirmed. Check Mailjet before starting another send.</p>:row.copyState!=='SAVED'?<><p className="text-xs leading-5 text-slate-600">{row.copyState==='UNCERTAIN'?'Checks for an existing copy only. Another copy will not be inserted while the result is uncertain.':'If the copy failed, retrying only saves it to Gmail.'}</p><Button variant="outline" disabled={busy||!status.enabled} onClick={()=>void act('retry',row.id)}>{row.copyState==='UNCERTAIN'||row.copyState==='COPYING'?'Check existing copy':'Retry Gmail copy'}</Button></>:null}{row.gmailMessageId?<a className="inline-block py-2 text-sm font-medium text-[#c93412] underline" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(status.mailboxEmail)}#sent/${encodeURIComponent(row.gmailMessageId)}`} target="_blank" rel="noreferrer">Open in Gmail</a>:null}</li>)}</ul>}</details>:null}
 </section>;
}
