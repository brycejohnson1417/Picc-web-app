import {expect,test} from '@playwright/test';

test.use({viewport:{width:390,height:844},video:'on'});

test('connects securely, resumes source pages and keeps sheet credit authoritative',async({page},testInfo)=>{
 let configured=false,pages=0;
 const commands:Record<string,unknown>[]=[];
 const companyId='11111111-1111-4111-8111-111111111111';
 const source={status:{configured:false,encryptionReady:true,companyId:'',companyName:'',lastSyncedAt:null,status:'IDLE',pending:false,progress:0},canManage:true,
  records:[{resource:'companies',externalId:companyId,payload:{id:companyId,name:'Test retailer',licenses:[]},annotation:{}}],
  accounts:[{id:'account',name:'Test CRM retailer',licenseNumber:'TEST-LICENSE'}],mappings:[] as {externalId:string;localId:string}[],unmatched:[{id:companyId,candidates:['account']}],
  salesNY:{spreadsheetId:'test-spreadsheet-identifier',configured:false,syncedAt:'2026-10-26T12:00:00Z',records:[{row:3,licenseNumber:'TEST-LICENSE',nabisId:'',distruId:companyId,name:'Test retailer',creditStatus:'Hold',paymentDays:-3,errors:[]}]}};
 await page.route('**/api/integrations/distru',async route=>{
  if(route.request().method()==='POST'){
   const input=route.request().postDataJSON();commands.push(input);
   if(input.action==='connect')configured=true;
   if(input.action==='sync'){pages++;return route.fulfill({json:{done:pages===2}});}
   if(input.action==='map')source.mappings=[{externalId:companyId,localId:input.accountId}];
   return route.fulfill({json:{verified:true}});
  }
  return route.fulfill({json:{...source,status:{...source.status,configured}}});
 });
 await page.goto('/distru');
 await expect(page.getByRole('heading',{name:'Distributor sales',exact:true})).toBeVisible();
 await expect(page.getByLabel('EMCANN company ID',{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('connection-before.png'),fullPage:true});
 await page.getByLabel('EMCANN company ID',{exact:true}).fill(companyId);
 await page.getByLabel('Distru API key',{exact:true}).fill('test-only-secret');
 await page.getByRole('button',{name:'Verify & connect',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('EMCANN verified');
 await page.locator('summary').filter({hasText:'EMCANN connected'}).click();
 await expect(page.getByLabel('Distru API key',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Sync changes',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Sync complete');
 expect(pages).toBe(2);
 await page.getByRole('button',{name:'Test retailer Needs account match',exact:true}).click();
 await expect(page.getByText('Hold',{exact:true})).toBeVisible();
 await expect(page.getByText('-3',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'CRM account',exact:true}).selectOption('account');
 await page.getByRole('button',{name:'Save account match',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Account mapping saved');
 expect(commands.filter(c=>c.action==='connect')).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('matched-after.png'),fullPage:true});
});

test('failed connection shows a recoverable error and never indicates success',async({page})=>{
 await page.route('**/api/integrations/distru',route=>route.fulfill({status:503,json:{error:'Connection unavailable. Retry.'}}));
 await page.goto('/distru');
 await expect(page.getByRole('alert').filter({hasText:'Connection unavailable'})).toContainText('Connection unavailable');
 await expect(page.getByRole('button',{name:'Refresh view'})).toBeEnabled();
 await expect(page.getByText('EMCANN connected',{exact:true})).toHaveCount(0);
});
