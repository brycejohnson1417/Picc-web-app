import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { object, rows, str, type Source } from './domain';
export class DistruError extends Error { constructor(message: string, public retryAfter=0) { super(message); } }
export const encryptionReady = () => (process.env.DISTRU_ENCRYPTION_KEY?.trim().length ?? 0)>=32;
function encryptionKey() {
  if (!encryptionReady()) throw new DistruError('Secure connection storage is not ready. Deployment setup is required before saving a key.');
  return createHash('sha256').update(process.env.DISTRU_ENCRYPTION_KEY!.trim()).digest();
}
export function seal(orgId: string, value: string) {
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
 cipher.setAAD(Buffer.from(`distru:${orgId}`));
 const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
export function unseal(orgId:string,value:string) {
 const [version,iv,tag,data,extra]=value.split('.');
 if(version!=='v1'||!iv||!tag||!data||extra) throw new DistruError('Saved key could not be opened. Reconnect Distru.');
 const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));
 cipher.setAAD(Buffer.from(`distru:${orgId}`));cipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8');
}
export function safeUrl(path:string) {
 const url=new URL(path,'https://app.distru.com');
 if(url.origin!=='https://app.distru.com'||!/^\/public\/v1\/(orders|invoices|companies|products|locations|deleted-records)(\/[^/]+)?$/.test(url.pathname)||url.username||url.password||url.hash) throw new DistruError('Distru returned an unsafe pagination URL.');
 return url.toString();
}
async function read(key:string,path:string) {
 let response:Response;
 try { response=await fetch(safeUrl(path),{headers:{Authorization:`Bearer ${key}`,Accept:'application/json','Content-Type':'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)}); }
 catch(error) { if(error instanceof DistruError)throw error;throw new DistruError('Distru could not be reached. Retry the connection.'); }
 if(response.status===429) {const seconds=Math.max(1,Math.min(3600,Number(response.headers.get('retry-after'))||60));throw new DistruError(`Distru is rate limiting requests. Retry after ${seconds} seconds.`,seconds);}
 if(!response.ok)throw new DistruError(response.status===401?'Distru rejected the key. Check its expiry and reconnect.':response.status===403?'This key does not have permission to read the requested Distru records.':`Distru request failed (${response.status}). Retry later.`);
 let body:unknown;try{body=await response.json();}catch{throw new DistruError('Distru returned an unexpected response.');}
 return {body:object(body),date:response.headers.get('date')};
}
export async function readPage(key:string,path:string) {
 const {body,date}=await read(key,path);
 if(!Array.isArray(body.data)||!('next_page' in body)||!(body.next_page===null||typeof body.next_page==='string')) throw new DistruError('Distru returned an unexpected page shape. No checkpoint was advanced.');
 const data=rows(body.data);
 if(data.some(r=>!str(r.id)&&!str(r.record_id)))throw new DistruError('Distru returned an unexpected record without an ID.');
 return {data,next:body.next_page ? safeUrl(str(body.next_page)) : null,date};
}
export async function verifyWorkspace(key:string,expectedId:string):Promise<{id:string;name:string;locations:Source[]}> {
 let next:string|null='/public/v1/locations';const locations:Source[]=[];
 for(let count=0;next&&count<20;count++){const page=await readPage(key,next);locations.push(...page.data);next=page.next;}
 if(next||!locations.length||locations.some(l=>l.company_id!==expectedId))throw new DistruError('The key does not verify the expected workspace. Use the EMCANN company ID and key, not another company.');
 const {body}=await read(key,`/public/v1/companies/${encodeURIComponent(expectedId)}`);
 const company=object(body.data);
 if(company.id!==expectedId||str(company.name).trim().toUpperCase()!=='EMCANN')throw new DistruError('The verified workspace is not EMCANN. Check the company ID and API key.');
 return {id:expectedId,name:str(company.name),locations};
}
