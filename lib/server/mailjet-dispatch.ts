import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { sendMailjetMessage, type MailjetConfig, type MailjetMessage, type EmailResult } from '@/lib/email/mailjet';
import { encryptMailjetSecret, decryptMailjetSecret } from '@/lib/server/mailjet-connection';
import { getGmailAccess } from '@/lib/server/gmail-connection';
import { buildSentMime, insertSentCopy, findSentCopy, GmailCopyError, GMAIL_INSERT_SCOPE } from './gmail-sent-copy';

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const failure=(error:string):EmailResult=>({status:'FAILED',providerMessageId:null,error});

/** A unique durable claim is committed BEFORE the only external send. Never reclaim an uncertain send. */
export async function dispatchMailjetEmail(orgId:string,config:MailjetConfig,input:MailjetMessage):Promise<EmailResult> {
  const id=hash(JSON.stringify([orgId,input.idempotencyKey]));
  const requestHash=hash(JSON.stringify([config.fromEmail,config.fromName,input.to,input.subject,input.html,input.text??'']));
  const messageId=`picc-${id}@${config.fromEmail.split('@')[1]}`;
  const raw=buildSentMime({...input,fromEmail:config.fromEmail,fromName:config.fromName,messageId,date:new Date().toISOString()});
  try {
    await prisma.mailjetDispatch.create({data:{id,orgId,requestHash,fromEmail:config.fromEmail.toLowerCase(),recipient:input.to,subject:input.subject,messageId,encryptedRaw:encryptMailjetSecret(orgId,raw),sendState:'SENDING',copyState:'WAITING'}});
  } catch(error) {
    if(!(typeof error==='object'&&error!==null&&'code'in error&&error.code==='P2002'))throw error;
    const existing=await prisma.mailjetDispatch.findFirst({where:{id,orgId}});
    if(!existing||existing.requestHash!==requestHash)return failure('This email request was already used with different content. No email was sent.');
    if(existing.sendState==='SENT')return {status:'SENT',providerMessageId:existing.providerMessageId,error:null};
    return failure('This request has already been attempted. Check Mailjet before starting a new send; it will not be sent again automatically.');
  }
  let result:EmailResult;
  try {result=await sendMailjetMessage(config,{...input,messageId});}
  catch {result=failure('Mailjet acceptance is uncertain. Check Mailjet before starting another send.');}
  if(result.status!=='SENT'){
    await prisma.mailjetDispatch.update({where:{id},data:{sendState:'UNCONFIRMED',copyState:'WAITING'}}).catch(()=>undefined);
    return result;
  }
  // Once accepted, persistence/copy failures must NEVER be reported as a failed send.
  try {
    await prisma.mailjetDispatch.update({where:{id},data:{sendState:'SENT',providerMessageId:result.providerMessageId,sentAt:new Date(),copyState:'PENDING'}});
    await copyDispatchToGmail(orgId,id);
  } catch { /* Durable SENDING/UNCERTAIN state is intentionally not reclaimed by send retries. */ }
  return result;
}

/** Copy-only entry point. There is deliberately no call to dispatch/send in this function. */
export async function copyDispatchToGmail(orgId:string,id:string,clerkUserId?:string) {
  const row=await prisma.mailjetDispatch.findFirst({where:{id,orgId}});
  if(!row||row.sendState!=='SENT'||row.copyState==='SAVED')return;
  const connection=await prisma.gmailConnection.findFirst({where:{orgId,mailboxEmail:row.fromEmail,sentCopiesEnabled:true,...(clerkUserId?{clerkUserId}:{})},orderBy:{createdAt:'asc'}});
  if(!connection)return;
  const access=await getGmailAccess(orgId,connection.clerkUserId);
  if(access.connection.mailboxEmail!==row.fromEmail||!access.connection.sentCopiesEnabled||!access.connection.grantedScope.split(' ').includes(GMAIL_INSERT_SCOPE))return;
  // A live in-flight copy owns its claim. A stale claim can only be reconciled, never reinserted.
  const stale=new Date(Date.now()-60_000);
  if(row.copyState==='COPYING'&&row.copyAttemptAt&&row.copyAttemptAt>stale)return;
  const claimed=await prisma.mailjetDispatch.updateMany({where:{id,orgId,copyState:row.copyState,copyAttemptAt:row.copyAttemptAt},data:{copyState:'COPYING',copyAttemptAt:new Date()}});
  if(!claimed.count)return;
  const reconcileOnly=['UNCERTAIN','COPYING'].includes(row.copyState);
  let attempted=false;
  try {
    const existing=await findSentCopy(access.accessToken,row.messageId);
    if(existing){await prisma.mailjetDispatch.update({where:{id},data:{copyState:'SAVED',gmailMessageId:existing,encryptedRaw:null}});return;}
    if(reconcileOnly){await prisma.mailjetDispatch.update({where:{id},data:{copyState:'UNCERTAIN'}});return;}
    if(!row.encryptedRaw)throw new Error('Missing copy content');
    const raw=decryptMailjetSecret(orgId,row.encryptedRaw);
    attempted=true;
    const gmailMessageId=await insertSentCopy(access.accessToken,raw);
    await prisma.mailjetDispatch.update({where:{id},data:{copyState:'SAVED',gmailMessageId,encryptedRaw:null}});
  } catch(error) {
    const uncertain=reconcileOnly || (attempted && (!(error instanceof GmailCopyError)||error.uncertain));
    await prisma.mailjetDispatch.update({where:{id},data:{copyState:uncertain?'UNCERTAIN':'RETRY'}}).catch(()=>undefined);
  }
}
