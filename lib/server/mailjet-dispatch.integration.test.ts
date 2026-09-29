import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@/lib/email/mailjet',()=>({sendMailjetMessage:m.send}));
import { prisma } from '@/lib/db/prisma';
import { dispatchMailjetEmail } from './mailjet-dispatch';
const enabled=process.env.PICC_SENT_COPY_DB_TEST==='1';
const orgId=`sent-copy-test-${randomUUID()}`;
describe.skipIf(!enabled)('local PostgreSQL dispatch concurrency',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/picc_sentcopy_208')throw new Error('Only the isolated local test database is permitted');
  process.env.MAILJET_ENCRYPTION_KEY='local-test-key-not-a-secret-000000000000';
  await prisma.organizationWorkspace.create({data:{id:orgId,clerkOrgId:orgId,name:'Sent copy integration fixture'}});
 });
 afterAll(async()=>{await prisma.organizationWorkspace.deleteMany({where:{id:orgId}});await prisma.$disconnect();});
 it('ten concurrent requests produce one provider call and one durable ledger row',async()=>{
  m.send.mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,30));return {status:'SENT',providerMessageId:'test-provider',error:null};});
  const config={apiKey:'fixture',apiSecret:'fixture',fromEmail:'sender@example.com',fromName:'Sender'};
  const input={to:'recipient@example.com',subject:'Concurrency check',html:'<p>Local test only</p>',idempotencyKey:'concurrent-1'};
  await Promise.all(Array.from({length:10},()=>dispatchMailjetEmail(orgId,config,input)));
  expect(m.send).toHaveBeenCalledTimes(1);
  const rows=await prisma.mailjetDispatch.findMany({where:{orgId}});
  expect(rows).toHaveLength(1);expect(rows[0].sendState).toBe('SENT');
  expect(rows[0].encryptedRaw).not.toContain('Local test only');
  expect((await dispatchMailjetEmail(orgId,config,input)).status).toBe('SENT');expect(m.send).toHaveBeenCalledTimes(1);
 });
 it('conditional copy claims elect one worker',async()=>{
  const row=await prisma.mailjetDispatch.findFirstOrThrow({where:{orgId}});
  const claims=await Promise.all(Array.from({length:10},()=>prisma.mailjetDispatch.updateMany({where:{id:row.id,orgId,copyState:'PENDING',copyAttemptAt:null},data:{copyState:'COPYING',copyAttemptAt:new Date()}})));
  expect(claims.reduce((sum,result)=>sum+result.count,0)).toBe(1);
 });
});
