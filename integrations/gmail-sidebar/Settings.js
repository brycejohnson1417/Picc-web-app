function settingsCard_() {
  var s=settings_(),card=card_('Connections','Private developer installation');
  card.addSection(section_('CRM').addWidget(text_('Use a read-only Notion integration shared with the account, contact and linked financial sources. Keys are stored in your Google user properties and are never shown again. Google card inputs display newly entered keys as text.'))
    .addWidget(row_('Connection',s.notionToken?'Saved — test to check access':'Not connected'))
    .addWidget(input_('notionToken','Notion key (blank keeps saved key)'))
    .addWidget(input_('crmSource','Account data source ID',s.crmSource))
    .addWidget(input_('contactsSource','Contact data source ID',s.contactsSource))
    .addWidget(button_('Save and test CRM','saveNotion'))
    .addWidget(button_('Disconnect CRM','disconnectSource',{source:'notion'})));
  card.addSection(section_('Distributor').addWidget(row_('Workspace',s.distruVerified || 'Not verified'))
    .addWidget(input_('distruToken','Distru key (blank keeps saved key)'))
    .addWidget(input_('workspaceId','Workspace company ID',s.workspaceId))
    .addWidget(input_('workspaceName','Expected workspace name',s.workspaceName))
    .addWidget(button_('Verify and save Distru','saveDistru'))
    .addWidget(button_('Disconnect Distru','disconnectSource',{source:'distru'})));
  card.addSection(section_('Mailbox').addWidget(text_('Conversations are read from the Google account that installed this add-on. This add-on cannot send or modify email.'))
    .addWidget(button_('Test mailbox access','testMailbox')).addWidget(button_('Back to stores','goHome')));
  return card.build();
}
function showSettings(){return push_(settingsCard_());}
function saveNotion(e){return attempt_(function(){
  var v=values_(e),old=settings_(),token=v.notionToken||old.notionToken;
  if(!token)throw new Error('Enter a Notion integration key.');
  var accountId=recordId(v.crmSource),contactId=recordId(v.contactsSource);
  var headers={Authorization:'Bearer '+token,'Notion-Version':'2025-09-03'};
  var account=jsonRead_('https://api.notion.com/v1/data_sources/'+accountId,headers);
  var contacts=jsonRead_('https://api.notion.com/v1/data_sources/'+contactId,headers);
  ['Dispensary Name','Account Status','Associated Contacts','Financial SYNC','PPP Status','Headset Connection'].forEach(function(k){if(!account.properties[k])throw new Error('Account source is missing '+k+'.');});
  ['Email','Evidence-backed Alternate Emails','Dispensary'].forEach(function(k){if(!contacts.properties[k])throw new Error('Contact source is missing '+k+'.');});
  PropertiesService.getUserProperties().setProperties({notionToken:token,crmSource:accountId,contactsSource:contactId});
  return update_(settingsCard_());
});}
function saveDistru(e){return attempt_(function(){
  var v=values_(e),old=settings_(),key=v.distruToken||old.distruToken,id=v.workspaceId.trim(),name=v.workspaceName.trim();
  if(!key||!id||!name)throw new Error('Enter the workspace name, company ID and key.');
  if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error('Invalid workspace ID.');
  var headers={Authorization:'Bearer '+key,Accept:'application/json'};
  var locations=jsonRead_('https://app.distru.com/public/v1/locations',headers);
  if(locations.next_page)throw new Error('Workspace verification requires reviewing additional locations. Do not save this connection yet.');
  if(!Array.isArray(locations.data)||!locations.data.length||locations.data.some(function(l){return l.company_id!==id;}))throw new Error('The key does not belong to the expected workspace.');
  var company=jsonRead_('https://app.distru.com/public/v1/companies/'+encodeURIComponent(id),headers).data;
  if(!company||company.id!==id||String(company.name).trim().toLowerCase()!==name.toLowerCase())throw new Error('The workspace name and key do not match.');
  PropertiesService.getUserProperties().setProperties({distruToken:key,workspaceId:id,workspaceName:name,distruVerified:company.name});
  return update_(settingsCard_());
});}
function testMailbox(){return attempt_(function(){var profile=gmail_('/profile');return push_(card_('Mailbox connected').addSection(section_('Read-only access').addWidget(text_(profile.emailAddress)).addWidget(button_('Back to stores','goHome'))).build());});}
function disconnectSource(e){var source=params_(e).source;var keys={notion:['notionToken','crmSource','contactsSource'],distru:['distruToken','workspaceId','workspaceName','distruVerified']}[source]||[];keys.forEach(function(k){PropertiesService.getUserProperties().deleteProperty(k);});return update_(settingsCard_());}
