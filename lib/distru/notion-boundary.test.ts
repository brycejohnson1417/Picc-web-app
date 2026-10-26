import {afterEach,expect,it,vi} from 'vitest';
const source=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/server/sales-ny-source',()=>({salesNYData:source}));
vi.mock('@/lib/auth/access-policy',()=>({getSharedWorkspaceId:()=> 'shared-workspace'}));
import {reviewSalesNYNotion,applySalesNYNotion} from '@/lib/server/sales-ny-notion';
afterEach(()=>{vi.resetAllMocks();vi.unstubAllGlobals();});
it('refuses cross-workspace access before touching the shared Notion connection',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(reviewSalesNYNotion('other-workspace')).rejects.toThrow('shared workspace');
 await expect(applySalesNYNotion('other-workspace','page')).rejects.toThrow('shared workspace');
 expect(source).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('requires a fresh sheet snapshot before any Notion correction',async()=>{
 source.mockResolvedValue({syncedAt:'2020-01-01T00:00:00Z',records:[]});
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(applySalesNYNotion('shared-workspace','page')).rejects.toThrow('15 minutes');
 expect(fetcher).not.toHaveBeenCalled();
});
