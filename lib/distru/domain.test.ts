import { describe, expect, it } from 'vitest';
import { invoiceAging, paymentDays, monthlySales, licenseCandidates } from './domain';
describe('invoice reporting', () => {
  it('ages remaining partial balances by New York calendar days', () => {
    expect(invoiceAging({remaining_amount:'40',due_datetime:'2026-10-25T04:00:00Z'},new Date('2026-10-26T16:00:00Z'))).toEqual({balance:40,days:1});
    expect(invoiceAging({remaining_amount:'0',due_datetime:'2020-01-01'},new Date())).toEqual({balance:0,days:0});
  });
  it('excludes voided invoices and reports unavailable dates', () => {
    expect(invoiceAging({remaining_amount:'40',voided_datetime:'2026-01-01'},new Date())).toEqual({balance:0,days:0});
    expect(invoiceAging({remaining_amount:'40'},new Date())).toEqual({balance:40,days:null});
  });
  it('weights cash payments, subtracts credit uses and ignores voided payments', () => {
    expect(paymentDays([{invoice_datetime:'2026-10-01',payments:[{amount:'100',payment_datetime:'2026-10-11',credit_uses:[{amount:'50'}]},{amount:'50',payment_datetime:'2026-10-21'},{amount:'900',payment_datetime:'2026-10-31',status:'VOIDED'}]}])).toBe(15);
    expect(paymentDays([])).toBeNull();
  });
});
it('uses delivered date and net merchandise with samples, canceled orders and returns excluded', () => {
  const item={quantity:'10',returned_quantity:'2',price:'5',is_sample:false};
  expect(monthlySales([{id:'1',status:'DELIVERED',delivered_datetime:'2026-10-01T03:00:00Z',items:[item]},{id:'2',status:'DELIVERED',delivered_datetime:'2026-10-02',items:[item,{...item,is_sample:true}]},{id:'3',status:'CANCELED',delivered_datetime:'2026-10-02',items:[item]}],'2026-10')).toBe(40);
});
it('never guesses store matches from a name or resolves ambiguous licenses', () => {
 expect(licenseCandidates({licenses:[{license_number:'OCM-123'}]},[{id:'1',licenseNumber:'OCM-123'},{id:'2',licenseNumber:'OCM-123'}])).toEqual(['1','2']);
 expect(licenseCandidates({name:'Same'},[{id:'1',name:'Same',licenseNumber:'X'}])).toEqual([]);
});
