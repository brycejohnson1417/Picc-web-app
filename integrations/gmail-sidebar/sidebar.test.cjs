const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname + '/Domain.js', 'utf8'), context);
const plain = value => JSON.parse(JSON.stringify(value));
test('addresses are exact, unique and safe for Gmail queries', () => {
  assert.deepEqual(plain(context.emailsIn('Buyer <BUYER@example.com>, buyer@example.com')), ['buyer@example.com']);
  assert.equal(context.mailQuery(['buyer@example.com'], '90d'), '{from:buyer@example.com to:buyer@example.com} newer_than:90d');
  assert.throws(() => context.mailQuery(['x@example.com} OR in:anywhere'], '90d'));
});
test('financial source ambiguity is never resolved by first record', () => {
  assert.throws(() => context.oneFinancialSource([{id:'a'},{id:'b'}]), /Multiple/);
  assert.equal(context.oneFinancialSource([]), null);
});
test('zero and negative source numbers survive', () => {
  assert.equal(context.propertyText({number:0}), '0');
  assert.equal(context.propertyText({formula:{number:-7}}), '-7');
  assert.equal(context.propertyText({rollup:{array:[{number:0}]}}), '0');
});
test('credentials cannot follow provider pagination off origin', () => {
  assert.equal(context.distruPage('/public/v1/orders?page%5Bafter%5D=x'), 'https://app.distru.com/public/v1/orders?page%5Bafter%5D=x');
  for(const bad of ['https://evil.example/public/v1/orders','https://app.distru.com.evil.example/public/v1/orders','https://app.distru.com/public/v1/payments']) assert.throws(() => context.distruPage(bad));
});
test('conflicting store and finance distributor identities fail closed', () => {
  assert.equal(context.companyIdentity('a','a'),'a');
  assert.equal(context.companyIdentity('','a'),'a');
  assert.throws(()=>context.companyIdentity('a','b'),/conflict/);
});
test('markup is escaped before showing external text in cards', () => {
  assert.equal(context.escapeCard('<b>A&B</b>'), '&lt;b&gt;A&amp;B&lt;/b&gt;');
});
test('missing payment data is not interpreted as unpaid or zero', () => {
  assert.equal(context.propertyText({}), '');
  assert.equal(context.propertyText({formula:{string:null}}), '');
});
function runtime(respond=()=>({})) {
  const calls=[];const props={};
  const runtime=vm.createContext({
    PropertiesService:{getUserProperties:()=>({getProperties:()=>({...props}),setProperties:value=>Object.assign(props,value),deleteProperty:key=>delete props[key]})},
    UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const r=respond(url,options);return {getResponseCode:()=>r.status||200,getContentText:()=>JSON.stringify(r.body||{})};}},
    ScriptApp:{getOAuthToken:()=> 'test-google-token'},Session:{getActiveUser:()=>({getEmail:()=> 'me@example.com'})},
    CardService:new Proxy({LoadIndicator:{SPINNER:'SPINNER'}},{get:(target,key)=>key in target?target[key]:()=>{
      const state={widget:key,calls:[]};let proxy;
      proxy=new Proxy(state,{get:(t,k)=>k==='build'?()=>t:k==='toJSON'?()=>t:(...args)=>{t.calls.push([k,...args]);return proxy;}});return proxy;
    }})
  });
  for(const file of ['Domain.js','Sources.js','Code.js','Settings.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),runtime);
  return {runtime,calls,props};
}
test('read adapter refuses redirect and provider errors without leaking response',()=>{
 const {runtime:r,calls}=runtime(()=>({status:401,body:{secret:'never-render-this'}}));
 assert.throws(()=>r.jsonRead_('https://api.notion.com/v1/test',{},null),/401/);
 assert.equal(calls[0].options.followRedirects,false);
 assert.equal(calls[0].options.method,'get');
});
test('Notion POST is restricted to a data-source query',()=>{
 const {runtime:r,calls,props}=runtime();props.notionToken='token';
 r.queryNotion_('a'.repeat(32),{property:'Name',title:{contains:'Store'}});
 assert.equal(calls[0].url,'https://api.notion.com/v1/data_sources/'+ 'a'.repeat(32) +'/query');
 assert.equal(calls[0].options.method,'post');
});
test('orders are rejected if any row belongs to another company',()=>{
 const {runtime:r,props}=runtime(()=>({body:{data:[{company:{id:'other'}}]}}));
 Object.assign(props,{distruToken:'token',distruVerified:'workspace'});
 assert.throws(()=>r.ordersPage_('expected'),/different company/);
});
test('missing distributor identity never broadens to all orders',()=>{
 const {runtime:r,calls}=runtime();assert.throws(()=>r.ordersPage_(''),/No verified/);assert.equal(calls.length,0);
});
test('source schema and archived accounts are checked',()=>{
 const {runtime:r,props}=runtime(()=>({body:{parent:{data_source_id:'b'.repeat(32)}}}));props.notionToken='token';props.crmSource='a'.repeat(32);
 assert.throws(()=>r.accountPage_('c'.repeat(32)),/not in the configured/);
});
test('retired contacts cannot auto-match an old email',()=>{
 assert.deepEqual(plain(context.currentContactEmails({properties:{Email:{email:'old@example.com'},'Contact Lifecycle':{select:{name:'Retired departure'}}}})),[]);
});
test('manifest is read-only and every named callback exists',()=>{
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/appsscript.json','utf8'));
 assert.equal(manifest.oauthScopes.some(s=>/gmail\.(send|modify|compose)|spreadsheets/.test(s)),false);
 const {runtime:r}=runtime();
 for(const name of ['onHomepage','onGmailMessage','goHome','showSettings','saveNotion','saveDistru','disconnectSource','testMailbox','searchAccounts','openStore','refreshStore','showOrders','showOrder','showThreads'])assert.equal(typeof r[name],'function',name);
});

test('settings never renders saved provider keys and has no commission controls',()=>{
 const {runtime:r,props}=runtime();Object.assign(props,{notionToken:'SECRET_NOTION',distruToken:'SECRET_DISTRU'});
 const rendered=JSON.stringify(r.settingsCard_());assert.ok(!rendered.includes('SECRET_'));assert.ok(rendered.includes('saveNotion'));assert.ok(rendered.includes('saveDistru'));assert.ok(!rendered.includes('paySheet'));
});
test('missing financial relation renders unknown while preserving PPP and assigned rep',()=>{
 const {runtime:r}=runtime();r.accountPage_=()=>({id:'a'.repeat(32),properties:{'Dispensary Name':{title:[{plain_text:'Store'}]},Rep:{people:[{name:'Rep'}]},'PPP Status':{status:{name:'Onboarding'}}},last_edited_time:'2026-01-01'});
 r.financialFor_=()=>null;const rendered=JSON.stringify(r.briefCard_('a'.repeat(32)));assert.ok(rendered.includes('unknown'));assert.ok(rendered.includes('Assigned rep'));assert.ok(rendered.includes('Onboarding'));
});
