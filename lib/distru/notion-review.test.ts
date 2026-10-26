import {expect,it} from 'vitest';
import {buildNotionReview,propertyValue} from './notion-review';
const text=(s:string)=>({type:'rich_text',rich_text:[{plain_text:s}]});
const row={row:3,name:'Store',licenseNumber:'L1',nabisId:'N1',distruId:'D1',creditStatus:'Send/Good',paymentDays:-5,errors:[]};
const crm={id:'crm',properties:{'License Number':text('L1'),'Licensed Location ID':text('N1'),'Synced Master Sales Sheet':{type:'relation',relation:[{id:'mss'}]}}};
const source={id:'mss',properties:{'License Number':text('L1'),'License Location ID':text('N1'),'Credit Status':{type:'select',select:{name:'Hold'}},'Payment Days Avg.':{type:'number',number:5}}};
it('reads formatted CRM formula results without treating them as absent',()=>{
 expect(propertyValue({type:'formula',formula:{type:'string',string:'23 Payment Days Avg.'}})).toBe('23 Payment Days Avg.');
});
it('plans exact-field corrections without overwriting CRM formulas',()=>{
 const result=buildNotionReview([row],[crm],[source]);expect(result[0].changes).toMatchObject({distruId:'D1',creditStatus:'Send/Good',paymentDays:-5});expect(result[0].sourceId).toBe('mss');
});
it('refuses ambiguous identities and linked source identity mismatches',()=>{
 expect(buildNotionReview([row,row],[crm],[source])[0].blocked).toBeTruthy();
 const bad={...source,properties:{...source.properties,'License Number':text('OTHER')}};
 expect(buildNotionReview([row],[crm],[bad])[0].changes.creditStatus).toBeUndefined();
});
it('does not clear valid values with missing source cells',()=>{
 const result=buildNotionReview([{...row,creditStatus:null,paymentDays:null}],[crm],[source]);expect(result[0].changes.creditStatus).toBeUndefined();expect(result[0].changes.paymentDays).toBeUndefined();
});
