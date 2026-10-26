import 'server-only';
import { matchCredit } from '@/lib/distru/sales-ny';
import { salesNYData } from './sales-ny-source';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { DistruError, encryptionReady, readPage, seal, unseal, verifyWorkspace } from '@/lib/distru/client';
import { object, str, type Source, licenseCandidates } from '@/lib/distru/domain';
import { startPlan, advancePlan, canClaim, type Plan } from '@/lib/distru/sync-plan';
const idFor=(orgId:string)=>`distru:${orgId}`;
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const checkpointKey=(integrationId:string)=>({integrationId_module:{integrationId,module:'sales'}});
async function connection(orgId:string){return prisma.integrationConnection.findFirst({where:{id:idFor(orgId),orgId,provider:'DISTRU'}});}
export async function distruStatus(orgId:string){
 const row=await connection(orgId);const config=object(row?.config);
 const checkpoint=row?await prisma.syncCheckpoint.findUnique({where:checkpointKey(row.id)}):null;
 const meta=object(checkpoint?.metadata);const plan=object(meta.plan);
 return {configured:Boolean(row?.enabled&&config.key),encryptionReady:encryptionReady(),companyId:str(config.companyId),companyName:str(config.companyName),lastSyncedAt:row?.lastSyncedAt?.toISOString()??null,lastFullSync:str(config.lastFullSync),status:checkpoint?.status??'IDLE',error:str(meta.error),retryAt:str(meta.retryAt),pending:Boolean(meta.plan),progress:Number(plan.count)||0,resource: Array.isArray(plan.steps)?str(object(plan.steps[Number(plan.index)]).resource):null};
}
export async function connectDistru(orgId:string,key:string,companyId:string){
 if(!encryptionReady())throw new DistruError('Secure connection storage is not ready. Deployment setup is required before saving a key.');
 const previous=await connection(orgId);
 if(previous&&str(object(previous.config).companyId)&&object(previous.config).companyId!==companyId)throw new DistruError('This connection belongs to a different company. It cannot replace existing history.');
 const cp=previous?await prisma.syncCheckpoint.findUnique({where:checkpointKey(previous.id)}):null;
 if(cp&&!canClaim(cp.status,cp.updatedAt,new Date()))throw new DistruError('Wait for the running sync batch before replacing the key.');
 const verified=await verifyWorkspace(key,companyId);
 const config={...object(previous?.config),key:seal(orgId,key),companyId:verified.id,companyName:verified.name};
 await prisma.integrationConnection.upsert({where:{id:idFor(orgId)},create:{id:idFor(orgId),orgId,provider:'DISTRU',name:'Distru',config:json(config),enabled:true},update:{config:json(config),enabled:true}});
 return distruStatus(orgId);
}
export async function testDistru(orgId:string){
 const row=await connection(orgId);const config=object(row?.config);
 if(!row?.enabled||!config.key)throw new DistruError('Connect Distru first.');
 await verifyWorkspace(unseal(orgId,str(config.key)),str(config.companyId));return {verified:true};
}
export async function disconnectDistru(orgId:string){
 const row=await connection(orgId);if(!row)return;
 const cp=await prisma.syncCheckpoint.findUnique({where:checkpointKey(row.id)});
 if(cp&&!canClaim(cp.status,cp.updatedAt,new Date()))throw new DistruError('A sync batch is running. Wait for it to finish before disconnecting.');
 const config=object(row.config);delete config.key;
 await prisma.integrationConnection.updateMany({where:{id:row.id,orgId},data:{enabled:false,config:json(config)}});
}
export async function syncDistruBatch(orgId:string,full=false){
 const row=await connection(orgId);const config=object(row?.config);
 if(!row?.enabled||!config.key)throw new DistruError('Connect Distru before syncing.');
 const cp=await prisma.syncCheckpoint.upsert({where:checkpointKey(row.id),create:{orgId,integrationId:row.id,module:'sales'},update:{}});
 const now=new Date();const meta=object(cp.metadata);
 if(!canClaim(cp.status,cp.updatedAt,now))throw new DistruError('Another sync batch is running. Retry shortly.');
 if(str(meta.retryAt)&&Date.parse(str(meta.retryAt))>now.getTime())throw new DistruError('Wait until the displayed retry time before retrying.');
 const token=randomUUID();
 const claimed=await prisma.syncCheckpoint.updateMany({where:{id:cp.id,updatedAt:cp.updatedAt},data:{status:'RUNNING',checksum:token}});
 if(!claimed.count)throw new DistruError('Another sync batch is running. Retry shortly.');
 let plan=meta.plan as Plan|undefined;
 try {
   if(!plan){
    await verifyWorkspace(unseal(orgId,str(config.key)),str(config.companyId));
    const weekly=!config.lastFullSync||now.getTime()-Date.parse(str(config.lastFullSync))>=7*86400000;
    plan=startPlan(full||weekly?null:cp.cursor,now);
   }
   const step=plan.steps[plan.index];
   const url=plan.next||step.path;
   const page=await readPage(unseal(orgId,str(config.key)),url);
   if(page.next&&new URL(page.next).pathname!==new URL(step.path,'https://app.distru.com').pathname)throw new DistruError('Distru returned a pagination URL for a different resource.');
   const next=advancePlan(plan,page.next,page.date,page.data.length);
   const done=next.index>=next.steps.length;
   await prisma.$transaction(async(tx)=>{
    const owned=await tx.syncCheckpoint.updateMany({where:{id:cp.id,checksum:token,status:'RUNNING'},data:{status:done?'SUCCESS':'IDLE',cursor:done?next.remoteStart:cp.cursor,metadata:json({plan:done?null:next,error:null,retryAt:null})}});
    if(!owned.count)throw new DistruError('Sync lease changed. Retry without advancing the checkpoint.');
    for(const record of page.data){
      const externalId=str(step.remove?record.record_id:record.id);
      if(step.remove||record.deleted_at){await tx.salesSourceRecord.deleteMany({where:{orgId,integrationId:row.id,resource:step.resource,externalId}});continue;}
      await tx.salesSourceRecord.upsert({where:{integrationId_resource_externalId:{integrationId:row.id,resource:step.resource,externalId}},create:{orgId,integrationId:row.id,resource:step.resource,externalId,payload:json(record),seenAt:now},update:{payload:json(record),seenAt:now}});
    }
    if(!page.next&&step.full)await tx.salesSourceRecord.deleteMany({where:{orgId,integrationId:row.id,resource:step.resource,seenAt:{lt:new Date(plan!.started)}}});
    if(done){
     const saved=await tx.integrationConnection.updateMany({where:{id:row.id,orgId,enabled:true,updatedAt:row.updatedAt},data:{lastSyncedAt:new Date(),status:'SUCCESS',...(next.steps.every(s=>s.full)?{config:json({...config,lastFullSync:now.toISOString()})}:{})}});
     if(!saved.count)throw new DistruError('Connection changed during sync. Retry with the current saved connection.');
    }
   },{timeout:20000});
   return {...await distruStatus(orgId),done};
 }catch(error){
   const message=error instanceof DistruError?error.message:'Sync could not complete. The previous checkpoint is retained; retry this batch.';
   const retryAt=error instanceof DistruError&&error.retryAfter?new Date(Date.now()+error.retryAfter*1000).toISOString():null;
   await prisma.syncCheckpoint.updateMany({where:{id:cp.id,checksum:token},data:{status:'ERROR',metadata:json({plan:plan??null,error:message,retryAt})}});
   throw new DistruError(message,error instanceof DistruError?error.retryAfter:0);
 }
}
export async function distruData(orgId:string){
 const integrationId=idFor(orgId);
 const [status,records,accounts,mappings]=await Promise.all([
  distruStatus(orgId),prisma.salesSourceRecord.findMany({where:{orgId,integrationId},select:{resource:true,externalId:true,payload:true,annotation:true}}),
  prisma.account.findMany({where:{orgId},select:{id:true,name:true,licenseNumber:true,licensedLocationId:true,nabisRetailerId:true}}),
  prisma.externalRecordMap.findMany({where:{orgId,integrationId,provider:'DISTRU',localModel:'Account'},select:{externalId:true,localId:true}})
 ]);
 const sheet=await salesNYData(orgId);
 return {status,records,accounts,mappings,unmatched:records.filter(r=>r.resource==='companies').map(r=>{
  const exact=accounts.filter(a=>matchCredit(sheet.records,{licenseNumber:a.licenseNumber,nabisId:a.licensedLocationId??undefined})?.distruId===r.externalId).map(a=>a.id);
  return {id:r.externalId,candidates:exact.length?exact:licenseCandidates(object(r.payload),accounts)};
 })};
}
export async function mapDistruCompany(orgId:string,companyId:string,accountId:string|null){
 const integrationId=idFor(orgId);
 const source=await prisma.salesSourceRecord.findFirst({where:{orgId,integrationId,resource:'companies',externalId:companyId}});
 if(!source)throw new DistruError('Sync this company before mapping it.');
 const account=accountId?await prisma.account.findFirst({where:{id:accountId,orgId},select:{id:true,licenseNumber:true,licensedLocationId:true}}):null;
 if(accountId&&!account)throw new DistruError('Account not found in this workspace.');
 if(account){
  const existing=await prisma.externalRecordMap.findFirst({where:{orgId,integrationId,localModel:'Account',localId:account.id,externalId:{not:companyId}}});
  if(existing)throw new DistruError('This CRM account is already matched to another Distru company. Review and remove the previous match first.');
  const sheet=await salesNYData(orgId);
  const sourceIdentity=matchCredit(sheet.records,{distruId:companyId});
  if(sourceIdentity&&!matchCredit(sheet.records,{distruId:companyId,licenseNumber:account.licenseNumber,nabisId:account.licensedLocationId??undefined}))throw new DistruError('The selected CRM account conflicts with the Sales NY store identifiers. Review the source before mapping.');
 }
 if(!accountId){await prisma.externalRecordMap.deleteMany({where:{orgId,integrationId,externalId:companyId,localModel:'Account'}});return;}
 await prisma.externalRecordMap.upsert({where:{orgId_provider_externalId_localModel:{orgId,provider:'DISTRU',externalId:companyId,localModel:'Account'}},create:{orgId,integrationId,provider:'DISTRU',externalId:companyId,localModel:'Account',localId:accountId},update:{localId:accountId}});
}
export async function annotateDistru(orgId:string,resource:string,externalId:string,annotation:Source){
 const result=await prisma.salesSourceRecord.updateMany({where:{orgId,integrationId:idFor(orgId),resource,externalId},data:{annotation:json({...annotation,confirmedAt:new Date().toISOString()})}});
 if(!result.count)throw new DistruError('The source record is no longer available. Refresh and retry.');
}
