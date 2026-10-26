import { z } from 'zod';

export const GMAIL_INSERT_SCOPE = 'https://www.googleapis.com/auth/gmail.insert';
export type SentEnvelope = {fromEmail:string;fromName:string;to:string;subject:string;html:string;text?:string;messageId:string;date:string};
const header = (value:string) => { if (/[\r\n\0]/.test(value)) throw new Error('Invalid email header'); return value; };
const encoded = (value:string) => {
  const chunks:string[]=[];let chunk='';
  for(const char of header(value)){if(Buffer.byteLength(chunk+char)>42){chunks.push(chunk);chunk='';}chunk+=char;}
  chunks.push(chunk);return chunks.map(part=>`=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`).join('\r\n ');
};
const body = (value:string) => Buffer.from(value).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
export function buildSentMime(mail: SentEnvelope) {
  z.string().email().parse(header(mail.fromEmail)); z.string().email().parse(header(mail.to));
  if (!/^[a-zA-Z0-9.@_-]+$/.test(mail.messageId)) throw new Error('Invalid message identifier');
  const date = new Date(mail.date); if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  const boundary = `picc_${mail.messageId.split('@')[0].slice(0,50)}`;
  const lines = [`From: ${encoded(mail.fromName)} <${mail.fromEmail}>`,`To: ${mail.to}`,`Subject: ${encoded(mail.subject)}`,`Date: ${date.toUTCString()}`,`Message-ID: <${mail.messageId}>`,'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`,''];
  if (mail.text) lines.push(`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body(mail.text));
  lines.push(`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',body(mail.html),`--${boundary}--`,'');
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}
export class GmailCopyError extends Error {
  constructor(public uncertain:boolean) {super(uncertain?'Gmail did not confirm the copy. Check status before trying another insertion.':'Gmail rejected the copy. Reconnect Gmail if needed, then retry the copy.');}
}
export async function insertSentCopy(token:string,raw:string,request:typeof fetch=fetch):Promise<string> {
  let response:Response;
  try { response = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages?internalDateSource=dateHeader',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({raw,labelIds:['SENT']}),cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error',
  }); } catch {throw new GmailCopyError(true);}
  if (!response.ok) throw new GmailCopyError(response.status >= 500 || response.status === 408);
  const result=await response.json().catch(()=>({}));
  if (typeof result.id!=='string') throw new GmailCopyError(true);
  return result.id;
}
export async function findSentCopy(token:string,messageId:string,request:typeof fetch=fetch):Promise<string|null> {
  const params=new URLSearchParams({q:`in:anywhere rfc822msgid:${messageId}`,maxResults:'1',includeSpamTrash:'true'});
  const response=await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Gmail copy lookup failed');
  const data=await response.json(); return data.messages?.[0]?.id ?? null;
}
