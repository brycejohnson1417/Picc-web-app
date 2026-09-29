import { beforeEach, describe, expect, it, vi } from 'vitest';
const a = '11111111111141118111111111111111', b = '22222222222242228222222222222222', account = '33333333333343338333333333333333';
const mocks = vi.hoisted(() => ({guard:vi.fn(),access:vi.fn(),runtime:vi.fn(),list:vi.fn(),thread:vi.fn()}));
vi.mock('@/lib/auth/api-guard',()=>({guard:mocks.guard}));
vi.mock('@/lib/server/account-contact-runtime',()=>({loadAccountContactRuntime:mocks.runtime}));
vi.mock('@/lib/server/gmail-connection',()=>({getGmailAccess:mocks.access,GmailNotConnectedError:class extends Error {},GmailIntegrationUnavailableError:class extends Error {},GMAIL_SETUP_UNAVAILABLE_MESSAGE:'Setup unavailable'}));
vi.mock('@/lib/server/gmail-provider',()=>({listGmailThreads:mocks.list,getGmailThread:mocks.thread}));
import { gmailConversations } from './gmail-conversations';
const raw = {id:'thread1',messages:[{id:'m1',internalDate:'1700000000000',payload:{headers:[{name:'From',value:'a@buyer.com'},{name:'To',value:'rep@example.com'},{name:'Cc',value:'b@buyer.com'},{name:'Subject',value:'Shared order'}]}}]};
const request = (query='') => new Request(`https://app.example/api/conversations${query}`);
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.guard.mockResolvedValue({orgId:'org1',userId:'user1'});
 mocks.access.mockResolvedValue({accessToken:'token1',connection:{mailboxEmail:'rep@example.com'}});
 mocks.runtime.mockResolvedValue({contacts:[{id:a,email:'a@buyer.com',accountPageIds:[account]},{id:b,email:'b@buyer.com',accountPageIds:[account]}],accounts:[{id:account,notionPageId:account}]});
 mocks.list.mockResolvedValue({threads:[raw],nextPageToken:'next'});mocks.thread.mockResolvedValue(raw);
});
describe('Gmail conversation routes',()=>{
 it('keeps a shared thread under both contacts and once in the linked account',async()=>{
   for (const target of [{kind:'contact' as const,id:a},{kind:'contact' as const,id:b},{kind:'account' as const,id:account}]) {
     const response = await gmailConversations(request(),target);
     expect(response.status).toBe(200);
     const data=await response.json();expect(data.threads.map((t:{id:string})=>t.id)).toEqual(['thread1']);
     expect(data.threads[0].messages).toEqual([]);expect(data.nextPageToken).toBe('next');
     expect(response.headers.get('Cache-Control')).toContain('no-store');
   }
   expect(mocks.list).toHaveBeenLastCalledWith('token1','{from:a@buyer.com to:a@buyer.com cc:a@buyer.com from:b@buyer.com to:b@buyer.com cc:b@buyer.com} newer_than:2y',undefined);
 });
 it('uses only the current organization/user token and forwards pagination and range',async()=>{
   await gmailConversations(request('?range=all&pageToken=page2'),{kind:'contact',id:a});
   expect(mocks.access).toHaveBeenCalledWith('org1','user1');
   expect(mocks.list).toHaveBeenCalledWith('token1','{from:a@buyer.com to:a@buyer.com cc:a@buyer.com}','page2');
 });
 it('stops before provider access when the role guard denies the request',async()=>{
   mocks.guard.mockResolvedValue({error:new Response(null,{status:403})});
   expect((await gmailConversations(request(),{kind:'contact',id:a})).status).toBe(403);expect(mocks.access).not.toHaveBeenCalled();
 });
 it('does not fetch for unknown records or missing addresses',async()=>{
   expect((await gmailConversations(request(),{kind:'contact',id:'44444444444444444444444444444444'})).status).toBe(404);
   mocks.runtime.mockResolvedValue({contacts:[{id:a,email:''}],accounts:[]});
   expect((await gmailConversations(request(),{kind:'contact',id:a})).status).toBe(422);expect(mocks.list).not.toHaveBeenCalled();
 });
 it('rechecks participants before returning an expanded conversation',async()=>{
   const good=await gmailConversations(request('?threadId=thread1'),{kind:'contact',id:b});expect(good.status).toBe(200);expect((await good.json()).thread.messages).toHaveLength(1);
   mocks.thread.mockResolvedValue({...raw,messages:[{...raw.messages[0],payload:{headers:[{name:'From',value:'unrelated@elsewhere.com'}]}}]});
   expect((await gmailConversations(request('?threadId=thread1'),{kind:'contact',id:a})).status).toBe(404);
 });
 it('rejects malformed queries and hides provider/token errors',async()=>{
   expect((await gmailConversations(request('?range=bad'),{kind:'contact',id:a})).status).toBe(400);
   mocks.list.mockRejectedValue(new Error('secret-token provider detail'));
   const result=await gmailConversations(request(),{kind:'contact',id:a});expect(result.status).toBe(502);expect(JSON.stringify(await result.json())).not.toContain('secret-token');
 });
});
