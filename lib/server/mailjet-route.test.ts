import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({guard:vi.fn(),status:vi.fn(),save:vi.fn(),disconnect:vi.fn(),test:vi.fn()}));
vi.mock('@/lib/auth/api-guard',()=>({guard:m.guard}));
vi.mock('@/lib/server/mailjet-connection',()=>({MailjetSettingsError:class extends Error {},getMailjetStatus:m.status,saveMailjetConnection:m.save,disconnectMailjet:m.disconnect,testMailjetConnection:m.test}));
beforeEach(()=>{vi.clearAllMocks();m.guard.mockResolvedValue({orgId:'org-a',userId:'user-a'});});
it('blocks unauthorized callers without reading credentials',async()=>{
 m.guard.mockResolvedValue({error:new Response('Forbidden',{status:403})});
 const {GET}=await import('@/app/api/integrations/mailjet/route');expect((await GET())!.status).toBe(403);expect(m.status).not.toHaveBeenCalled();expect(m.guard).toHaveBeenCalledWith(['ADMIN']);
});
it('uses the authenticated organization rather than a body organization',async()=>{
 m.save.mockResolvedValue({configured:true});const {PUT}=await import('@/app/api/integrations/mailjet/route');
 const r=await PUT(new Request('http://localhost/api/integrations/mailjet',{method:'PUT',body:JSON.stringify({orgId:'org-b',apiKey:'key',apiSecret:'secret',fromEmail:'sender@example.com',fromName:'Example'})}));
 expect(r!.status).toBe(200);expect(m.save.mock.calls[0][0]).toBe('org-a');
});
it('rejects invalid recipients before any send',async()=>{
 const {POST}=await import('@/app/api/integrations/mailjet/route');const r=await POST(new Request('http://localhost/api/integrations/mailjet',{method:'POST',body:JSON.stringify({recipient:'invalid'})}));
 expect(r!.status).toBe(400);expect(m.test).not.toHaveBeenCalled();
});
it('does not expose unexpected persistence errors',async()=>{
 m.status.mockRejectedValue(new Error('secret database details'));const {GET}=await import('@/app/api/integrations/mailjet/route');const r=await GET();expect(r!.status).toBe(503);expect(await r!.text()).not.toContain('secret');
});
