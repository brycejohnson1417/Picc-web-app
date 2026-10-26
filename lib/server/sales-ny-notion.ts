import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { object, str } from '@/lib/distru/domain';
import { buildNotionReview, propertyValue, type NotionPage } from '@/lib/distru/notion-review';
import { salesNYData } from './sales-ny-source';
import { DistruError } from '@/lib/distru/client';
// Resolve the existing CRM connection and its linked sales source; no tenant IDs in code.
async function targets(){
 const databaseId=process.env.NOTION_MASTER_LIST_DATABASE_ID?.trim();
 if(!databaseId)throw new DistruError('The existing Notion CRM connection needs administrator setup.');
 const database=await notion(`/databases/${databaseId}`);
 if(database.data_sources?.length!==1)throw new DistruError('The CRM database must have one unambiguous data source.');
 const CRM=str(database.data_sources[0].id);
 const schema=await notion(`/data_sources/${CRM}`);
 const relations=Object.entries(object(schema.properties)).filter(([name,p])=>name.includes('Synced Master Sales Sheet')&&object(p).type==='relation');
 if(relations.length!==1)throw new DistruError('The CRM sales-source relation is missing or ambiguous.');
 const relation=object(object(relations[0][1]).relation);
 let SALES=str(relation.data_source_id);
 if(!SALES&&relation.database_id){const db=await notion(`/databases/${str(relation.database_id)}`);if(db.data_sources?.length===1)SALES=str(db.data_sources[0].id);}
 if(!SALES)throw new DistruError('The linked sales data source could not be resolved.');
 return {CRM,SALES,schema};
}
async function notion(path:string,body?:unknown,method='POST'){
 const token=process.env.NOTION_API_KEY;
 if(!token)throw new DistruError('Notion connection needs administrator setup.');
 const r=await fetch(`https://api.notion.com/v1${path}`,{method:body?method:'GET',headers:{Authorization:`Bearer ${token}`,'Notion-Version':'2026-03-11','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new DistruError(`Notion request failed (${r.status}). Refresh the review before retrying.`);
 return r.json();
}
async function allPages(source:string){
 const result:NotionPage[]=[];let cursor:string|null=null;
 do{const page=await notion(`/data_sources/${source}/query`,{page_size:100,...(cursor?{start_cursor:cursor}:{})});result.push(...page.results);cursor=page.has_more?page.next_cursor:null;if(result.length>3000)throw new DistruError('Notion review exceeds its safe batch limit.');}while(cursor);
 return result;
}
export async function reviewSalesNYNotion(orgId:string){
 if(orgId!==getSharedWorkspaceId())throw new DistruError('The existing Notion CRM connection belongs to the shared workspace.');
 const source=await salesNYData(orgId);
 if(!source.syncedAt)throw new DistruError('Refresh Sales NY before comparing Notion.');
 const {CRM,SALES,schema}=await targets();
 const [crm,sales]=await Promise.all([allPages(CRM),allPages(SALES)]);
 return {at:new Date().toISOString(),sourceReadAt:source.syncedAt,idFieldReady:object(object(schema.properties)['Distru Company ID']).type==='rich_text',rows:buildNotionReview(source.records,crm,sales)};
}
export async function applySalesNYNotion(orgId:string,pageId:string){
 if(orgId!==getSharedWorkspaceId())throw new DistruError('The existing Notion CRM connection belongs to the shared workspace.');
 const source=await salesNYData(orgId);
 if(!source.syncedAt||Date.now()-Date.parse(source.syncedAt)>15*60000)throw new DistruError('Refresh Sales NY first; corrections require a source read within 15 minutes.');
 // Rebuild review from current Notion records before each write, never trust client diffs.
 const review=await reviewSalesNYNotion(orgId);const item=review.rows.find(r=>r.pageId===pageId);
 if(!item||item.blocked)throw new DistruError(item?.blocked||'CRM record not found in this source.');
 if(!review.idFieldReady)throw new DistruError('Add the Distru Company ID text property in Notion CRM before syncing IDs.');
 const {SALES}=await targets();
 const schema=await notion(`/data_sources/${SALES}`);
 const currentCrm=await notion(`/pages/${item.pageId}`);
 const currentSales=item.sourceId?await notion(`/pages/${item.sourceId}`):null;
 if(currentCrm.archived||currentCrm.in_trash||currentSales?.archived||currentSales?.in_trash)throw new DistruError('A source record was archived. Refresh the review.');
 const fresh=buildNotionReview(source.records,[currentCrm],currentSales?[currentSales]:[])[0];
 if(fresh.blocked||fresh.row!==item.row||fresh.sourceId!==item.sourceId||JSON.stringify(fresh.changes)!==JSON.stringify(item.changes)||JSON.stringify(fresh.current)!==JSON.stringify(item.current))throw new DistruError('Record values changed during review. Compare again before applying.');
 if(item.changes.distruId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.changes.distruId))throw new DistruError('Sales NY contains an invalid Distru Company ID. Correct the source first.');

 const statusSchema=object(object(schema.properties)['Credit Status']);
 const allowed=Array.isArray(object(statusSchema.select).options)?object(statusSchema.select).options as {name:string}[]:[];
 if(item.changes.creditStatus&&!allowed.some(o=>o.name===item.changes.creditStatus))throw new DistruError('Sales NY credit status is not an existing Notion option. Review it in Notion first.');
 if(item.sourceId&&(item.changes.creditStatus!==undefined||item.changes.paymentDays!==undefined)){
  const properties={...(item.changes.creditStatus!==undefined?{'Credit Status':{select:{name:item.changes.creditStatus}}}:{}),...(item.changes.paymentDays!==undefined?{'Payment Days Avg.':{number:item.changes.paymentDays}}:{})};
  await notion(`/pages/${item.sourceId}`,{properties},'PATCH');
  const check=await notion(`/pages/${item.sourceId}`);
  if((item.changes.creditStatus!==undefined&&propertyValue(check.properties['Credit Status'])!==item.changes.creditStatus)||(item.changes.paymentDays!==undefined&&propertyValue(check.properties['Payment Days Avg.'])!==item.changes.paymentDays))throw new DistruError('Notion source readback did not match. Refresh the review.');
 }
 if(item.changes.distruId){
  await notion(`/pages/${item.pageId}`,{properties:{'Distru Company ID':{rich_text:[{text:{content:item.changes.distruId}}]}}},'PATCH');
  const check=await notion(`/pages/${item.pageId}`);
  if(str(propertyValue(check.properties['Distru Company ID']))!==item.changes.distruId)throw new DistruError('Distru ID readback did not match. Refresh the review.');
 }
 await prisma.auditEvent.create({data:{orgId,action:'sales-ny-notion-reconciled',entityType:'Account',entityId:pageId,metadata:{sourceRow:item.row,fields:Object.keys(item.changes),verifiedAt:new Date().toISOString()}}});
 return {verified:true,fields:Object.keys(item.changes),warning:item.warning};
}
