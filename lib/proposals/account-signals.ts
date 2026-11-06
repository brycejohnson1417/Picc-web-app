export type AccountSignals = {
  asOf: string;
  comparison?: {current:number;previous:number;currentMonth:string;previousMonth:string;throughDay:number}|null;
  matrix?: {family:string;lastProduct:string|null;lastDisplay:string|null}[];
  monthly: {month:string; nabis:number|null; distru:number|null}[];
  products: {name:string; date:string; source:string; kind:'product'|'display'}[];
  invoices: {id:string; number:string; dueDate:string|null; remaining:number; voided:boolean; terms:string|null}[];
  invoiceAvailable: boolean;
  invoiceCoverage: string;
  weeklySale?: {day:string; discount:string; effective?:string|null; checked:string|null; result:string|null; url:string|null} | null;
  lastOrderDate: string|null;
};
export function invoiceAgeBucket(invoice: AccountSignals['invoices'][number] | {dueDate:string|null;remaining:number;voided:boolean}, today:string) {
  if(invoice.voided || invoice.remaining<=0)return null;
  if(!invoice.dueDate || !Number.isFinite(Date.parse(invoice.dueDate)))return 'Unknown due date';
  const days=Math.floor((Date.parse(today.slice(0,10)+'T12:00:00Z')-Date.parse(invoice.dueDate.slice(0,10)+'T12:00:00Z'))/86400000);
  return days<=0?'Not due':days<=30?'1–30':days<=60?'31–60':days<=90?'61–90':'90+';
}
export function comparableChange(current:number|null,previous:number|null) {
  return current===null||previous===null||previous===0?null:Math.round((current-previous)/previous*100);
}
export function isDormant(lastOrderDate:string|null|undefined,today:string,days=90) {
 if(!lastOrderDate)return false;
 const age=(Date.parse(today.slice(0,10)+'T12:00:00Z')-Date.parse(lastOrderDate.slice(0,10)+'T12:00:00Z'))/86400000;
 return Number.isFinite(age)&&age>=days;
}
