import {expect,it} from 'vitest';
import {invoiceAgeBucket, comparableChange} from './account-signals';
it('ages only unpaid, nonvoid invoices against a known day',()=>{
 expect(invoiceAgeBucket({dueDate:'2026-10-01',remaining:50,voided:false},'2026-11-05')).toBe('31–60');
 expect(invoiceAgeBucket({dueDate:'2026-10-01',remaining:0,voided:false},'2026-11-05')).toBe(null);
 expect(invoiceAgeBucket({dueDate:'2026-10-01',remaining:50,voided:true},'2026-11-05')).toBe(null);
 expect(invoiceAgeBucket({dueDate:null,remaining:50,voided:false},'2026-11-05')).toBe('Unknown due date');
});
it('refuses a percentage for absent or zero prior sales',()=>{
 expect(comparableChange(50,null)).toBe(null);expect(comparableChange(50,0)).toBe(null);
 expect(comparableChange(80,100)).toBe(-20);
});

it('does not label unknown or future order dates as dormant',async()=>{
 const {isDormant}=await import('./account-signals');
 expect(isDormant(null,'2026-11-05')).toBe(false);
 expect(isDormant('2026-12-05','2026-11-05')).toBe(false);
 expect(isDormant('2026-07-01','2026-11-05')).toBe(true);
});
