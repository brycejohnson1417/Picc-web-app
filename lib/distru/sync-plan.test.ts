import { expect, it } from 'vitest';
import { startPlan, advancePlan, canClaim } from './sync-plan';
it('lease-refusal refuses an active worker',()=>expect(canClaim('RUNNING',new Date('2026-10-26T10:00Z'),new Date('2026-10-26T10:00:10Z'))).toBe(false));
it('stale-recovery permits a failed worker after its bounded request expires',()=>expect(canClaim('RUNNING',new Date('2026-10-26T10:00Z'),new Date('2026-10-26T10:03Z'))).toBe(true));
it('batch-cutoff persists exactly the next page without marking success',()=>{
 const p=startPlan(null,new Date('2026-10-26T10:00Z'));const n=advancePlan(p,'https://app.distru.com/public/v1/companies?page=2','Mon, 26 Oct 2026 10:00:01 GMT',20);expect(n.index).toBe(0);expect(n.next).toContain('page=2');expect(n.count).toBe(20);
});
it('incremental runs include deletion reconciliation and five-minute overlap',()=>{
 const p=startPlan('2026-10-26T09:00:00Z',new Date('2026-10-26T10:00Z'));expect(p.steps.some(s=>s.path.includes('deleted-records'))).toBe(true);expect(p.steps[1].path).toContain('08%3A55');
});
