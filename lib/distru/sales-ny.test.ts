import { expect,it } from 'vitest';
import { parseSalesNY, matchCredit } from './sales-ny';
const header=['License Number','Nabis License Location ID','Distru Company ID','Dispensary Name','Credit Status','Payment Days Avg.'];
it('preserves negative and zero payment days, rejecting spreadsheet errors as values',()=>{
 const result=parseSalesNY([header,['L1','N1','D1','Store','Send/Good','-5'],['L2','N2','D2','Store2','#REF!','0']]);
 expect(result[0].paymentDays).toBe(-5);expect(result[1].creditStatus).toBeNull();expect(result[1].paymentDays).toBe(0);
});
it('rejects mismatched headers and ambiguous/conflicting immutable identities',()=>{
 expect(()=>parseSalesNY([['Wrong']])).toThrow();
 const records=parseSalesNY([header,['L1','N1','D1','A','Good','1'],['L2','N2','D2','B','Hold','2']]);
 expect(matchCredit(records,{distruId:'D1',licenseNumber:'L2'})).toBeNull();
 expect(matchCredit([...records,records[0]],{distruId:'D1'})).toBeNull();
 expect(matchCredit(records,{name:'A'})).toBeNull();
});
