import { expect,test } from '@playwright/test';
test.use({video:'on'});
for(const width of [390,1280]){
 test(`Sent-copy controls and copy-only recovery at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  let enabled=true;let copyState='RETRY';let sendCalls=0;let copies=0;
  await page.route('**/api/integrations/gmail',route=>route.fulfill({json:{configuration:{configured:true},connection:{mailboxEmail:'sender@example.com',status:'SUCCESS',lastSyncedAt:null,lastError:null}}}));
  await page.route('**/api/integrations/mailjet',route=>{if(route.request().method()==='POST')sendCalls++;return route.fulfill({json:{configured:true,encryptionReady:true,fromEmail:'sender@example.com',fromName:'PICC'}});});
  await page.route('**/api/integrations/gmail/sent-copies',async route=>{
   if(route.request().method()==='PATCH')enabled=route.request().postDataJSON().enabled;
   if(route.request().method()==='POST'){copies++;copyState='SAVED';}
   await route.fulfill({json:{enabled,authorized:true,mailboxEmail:'sender@example.com',messages:[{id:'a'.repeat(64),recipient:'buyer@example.com',subject:'Account follow-up',sendState:'SENT',copyState,sentAt:'2026-09-29T12:00:00Z',createdAt:'2026-09-29T12:00:00Z',gmailMessageId:copyState==='SAVED'?'gmail-1':null}]}});
  });
  await page.goto('/settings');const panel=page.getByRole('region',{name:'Gmail Sent copies'});
  await panel.getByText('Recent emails (1)').click();
  await expect(panel.getByText('Copy needs retry',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Turn off Sent copies'}).click();
  await expect(panel.getByRole('button',{name:'Retry Gmail copy'})).toBeDisabled();
  await panel.getByRole('button',{name:'Turn on Sent copies'}).click();
  await panel.getByRole('button',{name:'Retry Gmail copy'}).click();
  await expect(panel.getByText('Saved in Gmail Sent',{exact:true})).toBeVisible();
  await expect(panel.getByRole('link',{name:'Open in Gmail'})).toHaveAttribute('href',/authuser=sender%40example.com/);
  expect(copies).toBe(1);expect(sendCalls).toBe(0);
  await panel.screenshot({path:test.info().outputPath(`sent-copies-${width}.png`)});
  expect(await panel.evaluate(el=>el.getBoundingClientRect().right<=window.innerWidth)).toBe(true);
 });
}
test('authorization and uncertain-copy states are explicit',async({page})=>{
 await page.route('**/api/integrations/gmail',route=>route.fulfill({json:{configuration:{configured:true},connection:{mailboxEmail:'sender@example.com',status:'SUCCESS',lastError:null}}}));
 await page.route('**/api/integrations/gmail/sent-copies',route=>route.fulfill({json:{enabled:false,authorized:false,mailboxEmail:'sender@example.com',messages:[{id:'b'.repeat(64),recipient:'buyer@example.com',subject:'Account follow-up',sendState:'SENT',copyState:'UNCERTAIN',createdAt:'2026-09-29T12:00:00Z'}]}}));
 let requested=false;await page.route('**/api/integrations/gmail/connect',route=>{requested=route.request().postDataJSON().sentCopies;return route.fulfill({status:503,json:{error:'Connection temporarily unavailable. Try again.'}});});
 await page.goto('/settings');const panel=page.getByRole('region',{name:'Gmail Sent copies'});
 await panel.getByRole('button',{name:'Enable Gmail Sent copies'}).click();expect(requested).toBe(true);
 await expect(panel.getByRole('alert')).toContainText('temporarily unavailable');
 await panel.getByText('Recent emails (1)').click();
 await expect(panel.getByRole('button',{name:'Check existing copy'})).toBeDisabled();
 await expect(panel.getByText('Checks for an existing copy only.',{exact:false})).toBeVisible();
});
