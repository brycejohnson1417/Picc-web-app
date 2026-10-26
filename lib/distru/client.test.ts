import { afterEach, expect, it, vi } from 'vitest';
import { readPage, verifyWorkspace, seal, unseal } from './client';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('rejects pagination credential exfiltration and redirects', async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(readPage('secret','https://evil.example/public/v1/orders')).rejects.toThrow('pagination');
 expect(fetcher).not.toHaveBeenCalled();
});
it('429-backoff preserves Retry-After without leaking response bodies',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('secret echoed',{status:429,headers:{'Retry-After':'12'}})));
 await expect(readPage('secret','/public/v1/orders')).rejects.toMatchObject({retryAfter:12,message:'Distru is rate limiting requests. Retry after 12 seconds.'});
});
it('validates page data rather than silently clearing a cache',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({oops:[]})));
 await expect(readPage('secret','/public/v1/orders')).rejects.toThrow('unexpected');
});
it('binds encryption to organization and rejects wrong contexts',()=>{
 vi.stubEnv('DISTRU_ENCRYPTION_KEY','test-only-key-with-at-least-32-characters');
 const encrypted=seal('org-a','private-key');expect(encrypted).not.toContain('private-key');expect(unseal('org-a',encrypted)).toBe('private-key');expect(()=>unseal('org-b',encrypted)).toThrow();
});
it('requires an owned location for the expected workspace ID',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[{id:'loc',company_id:'other'}],next_page:null})));
 await expect(verifyWorkspace('secret','expected')).rejects.toThrow('workspace');
});
