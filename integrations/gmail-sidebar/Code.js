/* Native Gmail cards. Rendering never receives credentials. */
function text_(text) { return CardService.newTextParagraph().setText(escapeCard(text)); }
function row_(label,value) { return CardService.newDecoratedText().setTopLabel(label).setText(escapeCard(value === '' || value == null ? 'Not recorded' : value)).setWrapText(true); }
function action_(name,parameters) { return CardService.newAction().setFunctionName(name).setParameters(parameters || {}).setLoadIndicator(CardService.LoadIndicator.SPINNER); }
function button_(label,name,params) { return CardService.newTextButton().setText(label).setOnClickAction(action_(name,params)); }
function link_(label,url) { return CardService.newTextButton().setText(label).setOpenLink(CardService.newOpenLink().setUrl(url)); }
function section_(name) { return CardService.newCardSection().setHeader(name); }
function card_(title,subtitle) { return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(title).setSubtitle(subtitle || 'Read-only • Your mailbox')).addCardAction(CardService.newCardAction().setText('Settings').setOnClickAction(action_('showSettings'))); }
function input_(name,label,value) { return CardService.newTextInput().setFieldName(name).setTitle(label).setValue(value || ''); }
function values_(e) { var values={};var fields=(e.commonEventObject||{}).formInputs||{};Object.keys(fields).forEach(function(k){values[k]=((fields[k].stringInputs||{}).value||[''])[0];});return values; }
function params_(e) {return (e.commonEventObject||{}).parameters || e.parameters || {};}
function push_(card) {return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();}
function update_(card) {return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(card)).build();}
function attempt_(fn) {try{return fn();}catch(err){return push_(card_('Could not load this view').addSection(section_('Try again').addWidget(text_(err.message)).addWidget(button_('Home','goHome')).addWidget(button_('Connection settings','showSettings'))).build());}}
function homeCard_() {
  var s=settings_();
  var section=section_('Find a store').addWidget(input_('query','Store name')).addWidget(button_('Search','searchAccounts'));
  if(!s.notionToken) section.addWidget(text_('Connect your CRM to see store information beside an email.')).addWidget(button_('Connect sources','showSettings'));
  else section.addWidget(text_('Open a message to match its participants, or search by store name. Shared contacts always show a location selector.'));
  return card_('PICC • Store brief').addSection(section).build();
}
function onHomepage() {return homeCard_();}
function goHome() {return update_(homeCard_());}
function onGmailMessage(e) {
  try {
    if(!settings_().notionToken) return homeCard_();
    var message=gmail_('/messages/'+encodeURIComponent(e.gmail.messageId)+'?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc');
    var me=gmail_('/profile').emailAddress.toLowerCase();
    var addresses=emailsIn(((message.payload||{}).headers||[]).map(function(h){return h.value;}).join(' ')).filter(function(x){return x!==me && !x.endsWith('@'+me.split('@')[1]);});
    if(!addresses.length) return homeCard_();
    var accounts=matchingAccounts_(addresses);
    return accounts.length===1 && addresses.length<=5 ? briefCard_(accounts[0].id) : matchesCard_(accounts,addresses.length>5?'First five participants checked; search if the store is missing.':'Select the exact location',null,'');
  }catch(err){return card_('Store matching unavailable').addSection(section_('Connection').addWidget(text_(err.message)).addWidget(button_('Search stores','goHome')).addWidget(button_('Settings','showSettings'))).build();}
}
function matchesCard_(accounts,subtitle,next,query) {
  var section=section_('Locations');
  if(!accounts.length)section.addWidget(text_('No exact match found. Search by store name.'));
  accounts.forEach(function(p){section.addWidget(row_(propertyText(p.properties['Dispensary Name']),propertyText(p.properties['Full Address']))).addWidget(button_('View store','openStore',{id:p.id}));});
  if(next)section.addWidget(button_('More stores','searchAccounts',{cursor:next,query:query}));
  section.addWidget(input_('query','Store name',query)).addWidget(button_('Search','searchAccounts'));
  return card_('Choose a store',subtitle).addSection(section).build();
}
function searchAccounts(e) {return attempt_(function(){var p=params_(e),q=(values_(e).query||p.query||'').trim();if(q.length<2)throw new Error('Enter at least two letters of the store name.');var page=queryNotion_(settings_().crmSource,{property:'Dispensary Name',title:{contains:q}},p.cursor);return push_(matchesCard_(page.results||[],'Match the address before opening',page.next_cursor,q));});}
function briefCard_(id) {
  var page=accountPage_(id),p=page.properties;
  var card=card_(propertyText(p['Dispensary Name']),propertyText(p['Full Address']));
  card.addSection(section_('Account').addWidget(row_('Account status',propertyText(p['Account Status']))).addWidget(row_('Assigned rep',propertyText(p.Rep))).addWidget(button_('Refresh','refreshStore',{id:id})).addWidget(link_('Open CRM','https://www.notion.so/'+recordId(id))));
  var finance=section_('Credit & customer payments');
  try {var f=financialFor_(page);if(!f)finance.addWidget(text_('No authoritative financial record linked. Credit and payment status are unknown.'));
    else {var fp=f.properties;['Credit Status','Payment Average','Orders Paid','Days Overdue 1','Days Overdue 2','Days Overdue 3'].forEach(function(k){finance.addWidget(row_(k,propertyText(fp[k])));});finance.addWidget(text_('Source: linked financial record • Edited '+f.last_edited_time)).addWidget(link_('Open financial source','https://www.notion.so/'+recordId(f.id)));}
  }catch(err){finance.addWidget(text_(err.message));}
  card.addSection(finance);
  card.addSection(section_('Preferred Partner Program').addWidget(row_('PPP status',propertyText(p['PPP Status']))).addWidget(row_('Headset connection',propertyText(p['Headset Connection']))).addWidget(row_('PPP notes',propertyText(p['PPP Notes']))));
  card.addSection(section_('Explore').addWidget(button_('Distru orders','showOrders',{id:id})).addWidget(button_('Email conversations','showThreads',{id:id})).addWidget(text_('CRM edited '+page.last_edited_time+' • Checked '+new Date().toISOString())));
  return card.build();
}
function openStore(e){return attempt_(function(){return push_(briefCard_(params_(e).id));});}
function refreshStore(e){return attempt_(function(){return update_(briefCard_(params_(e).id));});}
function showOrders(e){return attempt_(function(){var p=params_(e),account=accountPage_(p.id),f=financialFor_(account);var company=companyIdentity(propertyText(account.properties['Distru Company ID']),f?propertyText(f.properties['Distru Company ID']):'');var page=ordersPage_(company,p.cursor);var section=section_('Latest orders');if(!page.data.length)section.addWidget(text_('No orders returned for this company.'));
  var offset=Math.max(0,Number(p.offset)||0);page.data.slice(offset,offset+10).forEach(function(o){section.addWidget(row_(o.order_number || o.id,[o.status || 'Status not recorded',o.total == null ? 'Total not recorded' : '$'+o.total,o.order_datetime || 'Date not recorded'].join(' • ')));section.addWidget(button_('Invoice payment details','showOrder',{id:p.id,orderId:o.id}));});
  if(offset+10<page.data.length)section.addWidget(button_('More orders','showOrders',{id:p.id,cursor:p.cursor||'',offset:String(offset+10)}));else if(page.next_page)section.addWidget(button_('Older orders','showOrders',{id:p.id,cursor:distruPage(page.next_page)}));
  section.addWidget(button_('Refresh orders','showOrders',{id:p.id})).addWidget(link_('Open Distru','https://app.distru.com/')).addWidget(text_('Distru • Checked '+new Date().toISOString()));return push_(card_('Orders',propertyText(account.properties['Dispensary Name'])).addSection(section).build());});}
function showThreads(e){return attempt_(function(){var p=params_(e),account=accountPage_(p.id),contacts=contactsFor_(account);var emails=Array.from(new Set(accountEmails(account).concat.apply(accountEmails(account),contacts.map(currentContactEmails))));if(!emails.length)throw new Error('No current contact email addresses are recorded for this store.');var page=threadPage_(emails,p.cursor),section=section_('Activity in the last 90 days');
  page.rows.forEach(function(t){var messages=t.messages||[],last=messages[messages.length-1]||{},headers=(last.payload||{}).headers||[];var subject=(headers.find(function(h){return h.name.toLowerCase()==='subject';})||{}).value||'(No subject)';var from=(headers.find(function(h){return h.name.toLowerCase()==='from';})||{}).value||'';section.addWidget(row_(subject,from+' • '+(last.internalDate?new Date(Number(last.internalDate)).toISOString():''))).addWidget(link_('Open conversation','https://mail.google.com/mail/u/?authuser='+encodeURIComponent(Session.getActiveUser().getEmail())+'#all/'+encodeURIComponent(t.id)));});
  if(!page.rows.length)section.addWidget(text_('No matching conversations in the last 90 days.'));
  if(page.next)section.addWidget(button_('More conversations','showThreads',{id:p.id,cursor:page.next}));section.addWidget(text_('Matched by '+emails.length+' recorded addresses. Shared contacts may include other locations; open the thread to check.')).addWidget(text_('Your Gmail • Checked '+new Date().toISOString()));return push_(card_('Email conversations',propertyText(account.properties['Dispensary Name'])).addSection(section).build());});}

function showOrder(e){return attempt_(function(){var p=params_(e),a=accountPage_(p.id),f=financialFor_(a),company=companyIdentity(propertyText(a.properties['Distru Company ID']),f?propertyText(f.properties['Distru Company ID']):'');
  var s=settings_();if(!s.distruVerified||!s.distruToken)throw new Error('Verify the distributor connection in Settings.');
  if(!/^[a-zA-Z0-9-]+$/.test(p.orderId||''))throw new Error('Invalid order ID.');
  var o=jsonRead_('https://app.distru.com/public/v1/orders/'+encodeURIComponent(p.orderId),{Authorization:'Bearer '+s.distruToken,Accept:'application/json'}).data;
  if(!o||!company||String((o.company||{}).id)!==company)throw new Error('This order does not match the selected store.');
  var section=section_('Order').addWidget(row_('Order status',o.status)).addWidget(row_('Total',o.total)).addWidget(row_('Delivery',o.delivery_datetime)).addWidget(row_('Order rep',(o.owner||{}).full_name));
  var invoices=o.invoices||[];if(!invoices.length)section.addWidget(text_('No invoices returned. Payment status is not recorded.'));
  invoices.slice(0,15).forEach(function(i){section.addWidget(row_('Invoice '+(i.invoice_number||i.id),i.voided_datetime?'VOIDED':i.status)).addWidget(row_('Paid / remaining',(i.paid_amount==null?'Unknown':i.paid_amount)+' / '+(i.remaining_amount==null?'Unknown':i.remaining_amount)));});
  if(invoices.length>15)section.addWidget(text_('More invoices exist. Open Distru for the complete record.'));
  section.addWidget(link_('Open Distru','https://app.distru.com/')).addWidget(text_('Distru • Checked '+new Date().toISOString()));return push_(card_(o.order_number||'Order details').addSection(section).build());});}
