/* All remote reads stay behind these adapters. No provider write endpoint is used. */
function settings_() { return PropertiesService.getUserProperties().getProperties(); }
function jsonRead_(url, headers, body) {
  var response = UrlFetchApp.fetch(url, {method: body ? 'post' : 'get', headers: headers, contentType:'application/json', payload:body ? JSON.stringify(body) : undefined, muteHttpExceptions:true, followRedirects:false});
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error(status === 429 ? 'Source rate limit reached. Wait a moment and retry.' : 'Source request failed (' + status + '). Check the connection and record access in Settings.');
  return JSON.parse(response.getContentText());
}
function notion_(path, body) {
  var s = settings_();
  if (!s.notionToken) throw new Error('Connect Notion in Settings.');
  return jsonRead_('https://api.notion.com/v1' + path, {Authorization:'Bearer ' + s.notionToken,'Notion-Version':'2025-09-03'}, body);
}
function queryNotion_(source, filter, cursor) {
  return notion_('/data_sources/' + recordId(source) + '/query', {page_size:30, filter:filter, start_cursor:cursor || undefined});
}
function accountPage_(id) {
  var page = notion_('/pages/' + recordId(id));
  if (recordId((page.parent || {}).data_source_id || '') !== recordId(settings_().crmSource)) throw new Error('This record is not in the configured account source.');
  if (page.archived || page.in_trash) throw new Error('This account is archived.');
  return page;
}
function relationIds_(page, name) {
  var p = (page.properties || {})[name];
  if (!p || !p.relation) return [];
  if (p.has_more) throw new Error('This account has a large ' + name + ' relation. Open the CRM to review it.');
  return p.relation.map(function(x) { return x.id; });
}
function contactsFor_(page) {
  var s=settings_();
  var reverse=queryNotion_(s.contactsSource,{property:'Dispensary',relation:{contains:page.id}});
  if(reverse.has_more) throw new Error('More than 30 linked contacts. Review a specific contact in the CRM.');
  var byId={}; (reverse.results || []).forEach(function(x){byId[recordId(x.id)]=x;});
  relationIds_(page,'Associated Contacts').forEach(function(id){if(!byId[recordId(id)]) byId[recordId(id)]=notion_('/pages/'+recordId(id));});
  return Object.keys(byId).map(function(id){return byId[id];});
}
function matchingAccounts_(addresses) {
  var s=settings_(), found={}, contacts=[];
  var schema=notion_('/data_sources/'+recordId(s.crmSource)).properties;
  addresses.slice(0,5).forEach(function(email){
    var c=queryNotion_(s.contactsSource,{or:[{property:'Email',email:{equals:email}},{property:'Evidence-backed Alternate Emails',rich_text:{contains:email}}]});
    if(c.has_more) throw new Error('Too many contact matches. Search for the exact store.');
    (c.results||[]).forEach(function(x){if(currentContactEmails(x).includes(email)) contacts.push(x);});
    var filter={or:['Contact Email','Billing AP Email','Billing cc Email','PPP CC Email #2','PPP CC Email #3'].map(function(k){return {property:k,email:{equals:email}};})};
    // The two PPP CC properties may be text in a workspace; schema-backed configuration is checked when saving.
    filter.or=filter.or.filter(function(f){return schema[f.property];}).map(function(f){if(schema[f.property].type==='rich_text') return {property:f.property,rich_text:{contains:email}};return f;});
    var a=queryNotion_(s.crmSource,filter);
    if(a.has_more) throw new Error('Too many store matches. Search for the exact store.');
    (a.results||[]).forEach(function(x){if(accountEmails(x).includes(email)) found[recordId(x.id)]=x;});
  });
  contacts.forEach(function(c){
    relationIds_(c,'Dispensary').forEach(function(id){if(!found[recordId(id)]) found[recordId(id)]=accountPage_(id);});
    var a=queryNotion_(s.crmSource,{property:'Associated Contacts',relation:{contains:c.id}});
    if(a.has_more) throw new Error('Shared contact matches many stores. Search for the exact location.');
    (a.results||[]).forEach(function(x){found[recordId(x.id)]=x;});
  });
  return Object.keys(found).map(function(id){return found[id];});
}
function financialFor_(page) {
  var ids=relationIds_(page,'Financial SYNC');
  oneFinancialSource(ids);
  if(!ids.length) return null;
  return notion_('/pages/'+recordId(ids[0]));
}
function gmail_(path) { return jsonRead_('https://gmail.googleapis.com/gmail/v1/users/me'+path,{Authorization:'Bearer '+ScriptApp.getOAuthToken()}); }
function threadPage_(emails,cursor) {
  var q=mailQuery(emails,'90d');
  var page=gmail_('/threads?maxResults=10&q='+encodeURIComponent(q)+(cursor?'&pageToken='+encodeURIComponent(cursor):''));
  return {next:page.nextPageToken, rows:(page.threads||[]).map(function(t){return gmail_('/threads/'+encodeURIComponent(t.id)+'?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To');})};
}
function ordersPage_(company,cursor) {
  if(!company) throw new Error('No verified Distru Company ID is linked to this store.');
  var s=settings_();
  if(!s.distruToken || !s.distruVerified) throw new Error('Connect and verify the distributor workspace in Settings.');
  var path=cursor || '/public/v1/orders?company_ids%5B%5D='+encodeURIComponent(company);
  var page=jsonRead_(distruPage(path),{Authorization:'Bearer '+s.distruToken,Accept:'application/json'});
  if(!Array.isArray(page.data)) throw new Error('Unexpected distributor response.');
  if(page.data.some(function(o){return String((o.company||{}).id)!==company;})) throw new Error('Distributor returned an order for a different company.');
  return page;
}
