import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { DistruError } from '@/lib/distru/client';
import { distruData, connectDistru, testDistru, disconnectDistru, syncDistruBatch, mapDistruCompany, annotateDistru } from '@/lib/server/distru-service';
import { reviewSalesNYNotion, applySalesNYNotion } from '@/lib/server/sales-ny-notion';
import { salesNYData, refreshSalesNY } from '@/lib/server/sales-ny-source';
export const maxDuration=60;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('connect'),key:z.string().trim().min(1).max(4096),companyId:z.string().uuid()}),
 z.object({action:z.literal('sheet'),spreadsheetId:z.string().regex(/^[a-zA-Z0-9_-]{20,100}$/),serviceAccountJson:z.string().max(20000).optional()}),
 z.object({action:z.literal('notion-review')}),z.object({action:z.literal('notion-apply'),pageId:z.string().uuid()}),
 z.object({action:z.literal('test')}),z.object({action:z.literal('disconnect')}),
 z.object({action:z.literal('sync'),full:z.boolean().optional()}),
 z.object({action:z.literal('map'),companyId:z.string().min(1).max(100),accountId:z.string().min(1).max(100).nullable()}),
 z.object({action:z.literal('annotate'),resource:z.enum(['orders','companies']),externalId:z.string().min(1).max(100),annotation:z.object({exclude:z.boolean().optional(),reason:z.string().max(300).optional(),carriedProductIds:z.array(z.string().max(100)).max(500).optional()})})
]);
function failure(error:unknown){
 if(error instanceof DistruError)return json({error:error.message,retryAfter:error.retryAfter},400);
 if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:'Check the required fields and company ID.'},400);
 return json({error:'Distru data is unavailable. Check deployment setup and retry.'},503);
}
export async function GET(){
 const ctx=await guard(['ADMIN','OPS_TEAM','SALES_REP','FINANCE']);if('error'in ctx)return ctx.error;
 try{return json({...await distruData(ctx.orgId),salesNY:await salesNYData(ctx.orgId),canManage:ctx.role==='ADMIN'});}catch(error){return failure(error);}
}
export async function POST(request:Request){
 const ctx=await guard(['ADMIN']);if('error'in ctx)return ctx.error;
 try{
  const input=command.parse(await request.json());
  switch(input.action){
   case 'notion-review':return json(await reviewSalesNYNotion(ctx.orgId));
   case 'notion-apply':return json(await applySalesNYNotion(ctx.orgId,input.pageId));
   case 'sheet':return json(await refreshSalesNY(ctx.orgId,input.spreadsheetId,input.serviceAccountJson));
   case 'connect':return json(await connectDistru(ctx.orgId,input.key,input.companyId));
   case 'test':return json(await testDistru(ctx.orgId));
   case 'disconnect':await disconnectDistru(ctx.orgId);return json({disconnected:true});
   case 'sync':return json(await syncDistruBatch(ctx.orgId,input.full));
   case 'map':await mapDistruCompany(ctx.orgId,input.companyId,input.accountId);return json({saved:true});
   case 'annotate':await annotateDistru(ctx.orgId,input.resource,input.externalId,input.annotation);return json({saved:true});
  }
  return json({error:'Unknown action'},400);
 }catch(error){return failure(error);}
}
