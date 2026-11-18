/* Pure functions shared by the Google-hosted add-on and its regression tests. */
function emailsIn(text) {
  return Array.from(new Set((String(text || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map(function(x) { return x.toLowerCase(); })));
}
function mailQuery(emails, range) {
  if (!emails.length || emails.length > 50 || !['90d','2y','all'].includes(range)) throw new Error('Choose up to 50 valid contact addresses.');
  emails.forEach(function(email) { if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) throw new Error('Unsupported email address.'); });
  return '{' + emails.map(function(email) { return 'from:' + email + ' to:' + email; }).join(' ') + '}' + (range === 'all' ? '' : ' newer_than:' + range);
}
function oneFinancialSource(rows) {
  if (rows.length > 1) throw new Error('Multiple financial sources are linked. Review the CRM relation before using these values.');
  return rows[0] || null;
}
function companyIdentity(primary, financial) {
  primary = String(primary || '').trim(); financial = String(financial || '').trim();
  if (primary && financial && primary !== financial) throw new Error('Distributor identity conflict between account and financial source.');
  return primary || financial;
}
function propertyText(p) {
  if (!p) return '';
  if (p.title || p.rich_text) return (p.title || p.rich_text).map(function(t) { return t.plain_text || (t.text && t.text.content) || ''; }).join('');
  if (p.status || p.select) return (p.status || p.select).name || '';
  if (p.people) return p.people.map(function(x) { return x.name || ''; }).join(', ');
  if (p.multi_select) return p.multi_select.map(function(x) { return x.name; }).join(', ');
  if (p.date) return p.date.start || '';
  if (p.rollup) return p.rollup.array ? p.rollup.array.map(propertyText).filter(function(x) { return x !== ''; }).join(', ') : propertyText(p.rollup);
  if (p.formula) return propertyText(p.formula);
  for (var k of ['email','phone_number','string','number','url']) if (p[k] !== null && p[k] !== undefined) return String(p[k]);
  return '';
}
function escapeCard(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function distruPage(path) {
  var url = String(path || '');
  if (url.indexOf('/public/v1/orders') === 0) url = 'https://app.distru.com' + url;
  if (!/^https:\/\/app\.distru\.com\/public\/v1\/orders(?:\?[^#\s]*)?$/.test(url)) throw new Error('Invalid distributor pagination URL.');
  return url;
}
function recordId(value) {
  var id = String(value || '').replace(/-/g,'');
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('Enter a valid Notion data source or record ID.');
  return id;
}
function currentContactEmails(page) {
  var p = page.properties || {};
  if (['Retired departure','Soft archived duplicate','Suppressed address'].includes(propertyText(p['Contact Lifecycle']))) return [];
  return emailsIn(propertyText(p.Email) + ' ' + propertyText(p['Evidence-backed Alternate Emails']));
}
function accountEmails(page) {
  var p = page.properties || {};
  return emailsIn(['Contact Email','Billing AP Email','Billing cc Email','PPP CC Email #2','PPP CC Email #3'].map(function(k) { return propertyText(p[k]); }).join(' '));
}
