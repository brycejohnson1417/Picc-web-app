import { object, rows, str, type Source } from './domain';
import { matchCredit, type CreditRow } from './sales-ny';
export type NotionPage={id:string;properties:Source;last_edited_time?:string};
export type Review={pageId:string;name:string;sourceId:string|null;row:number|null;blocked:string|null;warning:string|null;changes:{distruId?:string;creditStatus?:string;paymentDays?:number};current:{distruId:string;creditStatus:string|null;paymentDays:number|null}};
export function propertyValue(value:unknown):unknown{
 const p=object(value),type=str(p.type),v=p[type];
 if(type==='rich_text'||type==='title')return rows(v).map(t=>str(t.plain_text)||str(object(t.text).content)).join('');
 if(type==='select')return str(object(v).name)||null;
 if(type==='number')return typeof v==='number'?v:null;
 if(type==='string')return typeof v==='string'?v:null;
 if(type==='formula')return propertyValue(v);
 if(type==='rollup'){const r=object(v);return r.type==='array'?rows(r.array).map(propertyValue):r[str(r.type)];}
 return null;
}
const value=(page:NotionPage,name:string)=>propertyValue(page.properties[name]);
export function buildNotionReview(credits:CreditRow[],crm:NotionPage[],sources:NotionPage[]):Review[]{
 const norm=(v:unknown)=>str(v).trim().toUpperCase();
 const sourceMap=new Map(sources.map(p=>[p.id,p]));
 return crm.map(page=>{
  const identity={licenseNumber:str(value(page,'License Number')),nabisId:str(value(page,'Licensed Location ID')),distruId:str(value(page,'Distru Company ID'))};
  const match=matchCredit(credits,identity);
  const result:Review={pageId:page.id,name:str(value(page,'Dispensary Name')),sourceId:null,row:match?.row??null,blocked:null,warning:null,changes:{},current:{distruId:identity.distruId,creditStatus:null,paymentDays:null}};
  if(!match){result.blocked='No unique, conflict-free Sales NY identity match.';return result;}
  const duplicateCrm=crm.some(p=>p.id!==page.id&&((identity.licenseNumber&&norm(value(p,'License Number'))===norm(identity.licenseNumber))||(identity.nabisId&&norm(value(p,'Licensed Location ID'))===norm(identity.nabisId))||(match.distruId&&norm(value(p,'Distru Company ID'))===norm(match.distruId))));
  if(duplicateCrm||credits.filter(c=>c.distruId&&c.distruId===match.distruId).length>1){result.blocked='Duplicate immutable identity requires review.';return result;}
  if(match.distruId&&!identity.distruId)result.changes.distruId=match.distruId;
  const links=Object.entries(page.properties).filter(([name,p])=>name.includes('Synced Master Sales Sheet')&&object(p).type==='relation').flatMap(([,p])=>rows(object(p).relation).map(r=>str(r.id)));
  const ids=[...new Set(links)];
  if(ids.length!==1){result.warning='Missing or ambiguous sales-source relation. Credit fields were not changed.';return result;}
  const source=sourceMap.get(ids[0]);
  if(!source){result.warning='Linked sales-source record is unavailable.';return result;}
  const sourceIdentity={licenseNumber:str(value(source,'License Number')),nabisId:str(value(source,'License Location ID'))};
  if(matchCredit(credits,sourceIdentity)?.row!==match.row){result.warning='Linked source identity conflicts with CRM. Credit fields were not changed.';return result;}
  result.sourceId=source.id;result.current.creditStatus=str(value(source,'Credit Status'))||null;
  const days=value(source,'Payment Days Avg.');result.current.paymentDays=typeof days==='number'?days:null;
  if(match.creditStatus&&match.creditStatus!==result.current.creditStatus)result.changes.creditStatus=match.creditStatus;
  if(match.paymentDays!==null&&match.paymentDays!==result.current.paymentDays)result.changes.paymentDays=match.paymentDays;
  return result;
 });
}
