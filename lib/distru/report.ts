import { object, rows, str, monthlySales, invoiceAging, paymentDays, type Source } from './domain';
import { matchCredit, type CreditRow } from './sales-ny';
export type CachedRecord={resource:string;externalId:string;payload:Source;annotation:Source};
export function accountReport(records:CachedRecord[],companyId:string,month:string,creditRows:CreditRow[],identity:{licenseNumber?:string;nabisId?:string}={}){
 const company=records.find(r=>r.resource==='companies'&&r.externalId===companyId);
 const orders=records.filter(r=>r.resource==='orders'&&object(r.payload.company).id===companyId);
 const invoices=records.filter(r=>r.resource==='invoices'&&object(r.payload.company).id===companyId).map(r=>r.payload);
 const included=orders.filter(r=>!r.annotation.exclude).map(r=>r.payload);
 const aged=invoices.map(i=>invoiceAging(i,new Date()));
 const products=new Map<string,Source>();
 for(const order of included.filter(o=>['DELIVERED','COMPLETED'].includes(str(o.status))&&!o.combined_order))for(const item of rows(order.items)){
  if(item.is_sample||Number(item.quantity)<=Number(item.returned_quantity||0))continue;
  const product=object(item.product);if(str(product.id))products.set(str(product.id),product);
 }
 return {company,orders,invoices,monthly:monthlySales(included,month),outstanding:aged.reduce((s,a)=>s+a.balance,0),overdue:aged.reduce((s,a)=>s+(a.days&&a.days>0?a.balance:0),0),overdueDays:aged.some(a=>a.days===null)?null:Math.max(0,...aged.map(a=>a.days??0)),cashPaymentDays:paymentDays(invoices),products:[...products.values()],credit:matchCredit(creditRows,{...identity,distruId:companyId})};
}
