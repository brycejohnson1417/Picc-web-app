import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { GMAIL_INSERT_SCOPE } from '@/lib/server/gmail-sent-copy';
import { copyDispatchToGmail } from '@/lib/server/mailjet-dispatch';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const unavailable=()=>json({error:'Sent-copy settings could not be loaded. Try again.'},503);
export async function GET(){
 const ctx=await guard(['ADMIN','OPS_TEAM','SALES_REP']);if('error'in ctx)return ctx.error;
 try{
  const connection=await prisma.gmailConnection.findUnique({where:{orgId_clerkUserId:{orgId:ctx.orgId,clerkUserId:ctx.userId}}});
  if(!connection)return json({error:'Connect Gmail first.'},409);
  const messages=await prisma.mailjetDispatch.findMany({where:{orgId:ctx.orgId,fromEmail:connection.mailboxEmail},orderBy:{createdAt:'desc'},take:20,select:{id:true,recipient:true,subject:true,sendState:true,copyState:true,sentAt:true,createdAt:true,gmailMessageId:true}});
  return json({enabled:connection.sentCopiesEnabled,authorized:connection.grantedScope.split(' ').includes(GMAIL_INSERT_SCOPE),mailboxEmail:connection.mailboxEmail,messages});
 }catch{return unavailable();}
}
export async function PATCH(request:Request){
 const ctx=await guard(['ADMIN','OPS_TEAM','SALES_REP']);if('error'in ctx)return ctx.error;
 try{
  const input=z.object({enabled:z.boolean()}).safeParse(await request.json());if(!input.success)return json({error:'Choose whether to save Sent copies.'},400);
  const connection=await prisma.gmailConnection.findUnique({where:{orgId_clerkUserId:{orgId:ctx.orgId,clerkUserId:ctx.userId}}});
  if(!connection)return json({error:'Connect Gmail first.'},409);
  if(input.data.enabled&&!connection.grantedScope.split(' ').includes(GMAIL_INSERT_SCOPE))return json({error:'Authorize Gmail Sent copies first.'},409);
  await prisma.gmailConnection.update({where:{id:connection.id},data:{sentCopiesEnabled:input.data.enabled}});
  return json({ok:true});
 }catch{return unavailable();}
}
export async function POST(request:Request){
 const ctx=await guard(['ADMIN','OPS_TEAM','SALES_REP']);if('error'in ctx)return ctx.error;
 try{
  const input=z.object({id:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(await request.json());if(!input.success)return json({error:'Select an email copy.'},400);
  const connection=await prisma.gmailConnection.findUnique({where:{orgId_clerkUserId:{orgId:ctx.orgId,clerkUserId:ctx.userId}}});
  if(!connection?.sentCopiesEnabled)return json({error:'Enable Gmail Sent copies first.'},409);
  const row=await prisma.mailjetDispatch.findFirst({where:{id:input.data.id,orgId:ctx.orgId,fromEmail:connection.mailboxEmail}});
  if(!row)return json({error:'Email copy not found.'},404);
  await copyDispatchToGmail(ctx.orgId,row.id,ctx.userId);
  return json({ok:true});
 }catch{return json({error:'The Gmail copy could not be checked. Reconnect Gmail if access has expired. No email was resent.'},502);}
}
