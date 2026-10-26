import 'server-only';
import { createSign } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { parseSalesNY, type CreditRow } from '@/lib/distru/sales-ny';
import { object, str } from '@/lib/distru/domain';
import { DistruError, seal, unseal } from '@/lib/distru/client';
export const SALES_NY_DEFAULT=process.env.SALES_NY_SPREADSHEET_ID?.trim()||'';
const idFor=(orgId:string)=>`sales-ny:${orgId}`;
async function googleToken(saved?:string){
 let credentials;try{credentials=JSON.parse(saved||process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON||'{}');}catch{throw new DistruError('The Sheets connection needs administrator setup.');}
 if(!credentials.client_email||!credentials.private_key)throw new DistruError('The Sheets connection needs administrator setup.');
 const now=Math.floor(Date.now()/1000);
 const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
 const sign=createSign('RSA-SHA256');sign.update(payload);const assertion=`${payload}.${sign.sign(credentials.private_key,'base64url')}`;
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw new DistruError('Google Sheets authorization failed. Check service-account access.');
 const result=await response.json();if(!result.access_token)throw new DistruError('Google Sheets authorization failed.');return str(result.access_token);
}
export async function readSalesNY(spreadsheetId:string,credentials?:string){
 if(!/^[a-zA-Z0-9_-]{20,100}$/.test(spreadsheetId))throw new DistruError('Enter a valid Google spreadsheet ID.');
 const token=await googleToken(credentials);
 const get=async(path:string)=>{const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new DistruError(`Sales NY could not be read (${response.status}). Check sharing and retry.`);return response.json();};
 const metadata=await get('?fields=properties(title),sheets(properties(title,gridProperties(rowCount)))');
 const sheet=metadata.sheets?.find((s:{properties:{title:string}})=>s.properties.title==='Credit Status');
 if(!sheet||sheet.properties.gridProperties.rowCount>10000)throw new DistruError('The Credit Status tab is missing or exceeds the reviewed 10,000-row limit.');
 const result=await get(`/values/${encodeURIComponent(`'Credit Status'!H1:M${sheet.properties.gridProperties.rowCount}`)}?valueRenderOption=UNFORMATTED_VALUE`);
 let records:CreditRow[];try{records=parseSalesNY(result.values||[]);}catch{throw new DistruError('Sales NY headers changed. Review the source before refreshing.');}
 if(!records.length)throw new DistruError('Sales NY returned no identified records. The previous snapshot was preserved.');
 return records;
}
export async function refreshSalesNY(orgId:string,spreadsheetId:string,serviceAccountJson?:string){
 const previous=await prisma.integrationConnection.findFirst({where:{id:idFor(orgId),orgId}});
 const saved=str(object(previous?.config).key);
 const credentials=serviceAccountJson||(saved?unseal(orgId,saved):undefined);
 const records=await readSalesNY(spreadsheetId,credentials);const at=new Date();const id=idFor(orgId);
 const config={...object(previous?.config),spreadsheetId,...(serviceAccountJson?{key:seal(orgId,serviceAccountJson)}:saved?{key:saved}:{})};
 await prisma.$transaction(async tx=>{
  await tx.integrationConnection.upsert({where:{id},create:{id,orgId,provider:'GOOGLE_SHEETS',name:'Sales NY credit and payment days',config,lastSyncedAt:at,status:'SUCCESS'},update:{config,lastSyncedAt:at,status:'SUCCESS'}});
  for(const record of records)await tx.salesSourceRecord.upsert({where:{integrationId_resource_externalId:{integrationId:id,resource:'credit',externalId:String(record.row)}},create:{orgId,integrationId:id,resource:'credit',externalId:String(record.row),payload:record as unknown as Prisma.InputJsonValue,seenAt:at},update:{payload:record as unknown as Prisma.InputJsonValue,seenAt:at}});
  await tx.salesSourceRecord.deleteMany({where:{orgId,integrationId:id,seenAt:{lt:at}}});
 },{timeout:30000});
 return {count:records.length,syncedAt:at.toISOString()};
}
export async function salesNYData(orgId:string){
 const integrationId=idFor(orgId);
 const [connection,records]=await Promise.all([prisma.integrationConnection.findFirst({where:{id:integrationId,orgId}}),prisma.salesSourceRecord.findMany({where:{orgId,integrationId,resource:'credit'},select:{payload:true}})]);
 return {spreadsheetId:str(object(connection?.config).spreadsheetId)||SALES_NY_DEFAULT,syncedAt:connection?.lastSyncedAt?.toISOString()??null,configured:Boolean(object(connection?.config).key)||validEnvironmentCredentials(),records:records.map(r=>r.payload as unknown as CreditRow)};
}

function validEnvironmentCredentials(){try{const c=JSON.parse(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON||'{}');return Boolean(c.client_email&&c.private_key);}catch{return false;}}
