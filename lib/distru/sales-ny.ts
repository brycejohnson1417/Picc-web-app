export type CreditRow={row:number;licenseNumber:string;nabisId:string;distruId:string;name:string;creditStatus:string|null;paymentDays:number|null;errors:string[]};
const clean=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const usable=(v:string)=>v&&!v.startsWith('#')?v:'';
export function parseSalesNY(values:unknown[][]):CreditRow[]{
 const expected=['License Number','Nabis License Location ID','Distru Company ID','Dispensary Name','Credit Status','Payment Days Avg.'];
 if(!values[0]||expected.some((h,i)=>clean(values[0][i])!==h))throw new Error('Sales NY headers changed. Review the column mapping before syncing.');
 return values.slice(1).flatMap((r,index)=>{
  const [licenseNumber,nabisId,distruId,name,credit,days]=expected.map((_,i)=>clean(r[i]));
  if(!name&&!licenseNumber&&!distruId&&!nabisId)return [];
  const paymentDays=days&&!days.startsWith('#')&&Number.isFinite(Number(days))?Number(days):null;
  return [{row:index+2,licenseNumber:usable(licenseNumber),nabisId:usable(nabisId),distruId:usable(distruId),name,creditStatus:usable(credit)||null,paymentDays,errors:[...(!usable(credit)?['Credit Status unavailable']:[]),...(paymentDays===null?['Payment Days Avg. unavailable']:[])]}];
 });
}
export function matchCredit(records:CreditRow[],identity:{distruId?:string;nabisId?:string;licenseNumber?:string;name?:string}):CreditRow|null{
 const keys=['distruId','nabisId','licenseNumber'] as const;
 const norm=(s:string)=>s.trim().toUpperCase();
 const matches=records.filter(row=>keys.some(key=>identity[key]&&row[key]&&norm(identity[key]!)===norm(row[key])));
 if(matches.length!==1)return null;
 const row=matches[0];
 return keys.some(key=>identity[key]&&row[key]&&norm(identity[key]!)!==norm(row[key]))?null:row;
}
