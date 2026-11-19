// Rep Copilot MCP: the Sales NY boundary.
//
// One boundary module for the whole Sales NY workbook family, which reaches
// this app as Notion databases synced from Google Sheets:
//   - SYNC (Synced Google Import): credit status, Nabis rating, days overdue,
//     payment average, orders paid, last order/sample, product carry dates,
//     display dates. Wins credit/payment/order facts (PRD section 4.3).
//   - Headset Connections: the Notion DB "NY Headset Connections — CSV
//     (Sheet2-2)" (171 rows). Authoritative headset connection status; wins
//     over CRM account text.
//   - AR: the "Credit Status" tab of the Google workbook "Nabis Master
//     Sheet" (Sheets id 1grvfTol5xetAVBtuIDvYDajZ-6B0wxwss5ExMAQ4GQw),
//     read here through its synced Notion copy when configured. Per-store
//     unpaid orders, amount paid, overdue orders, days overdue, and its own
//     Payment Required Rule. It has NO balance-due column; a balance is
//     never modeled from it. AR wins credit status, payment-required, days
//     overdue, and open-invoice detail over SYNC; disagreements are logged
//     at debug level and never block a report. (The sibling "Payments" tab
//     is a per-order turnaround view and is not modeled here.)
//
// There is no "Sales and Why" sheet (all Nabis Master Sheet and NY Proposal
// Tracker tabs were enumerated in the 2026-11-18 merge). The why-stopped
// content lives in the CRM "Follow Up Reason" field and the Proposal
// Tracker rep tabs' Quick Notes / Store Notes columns; the CRM field is
// wired in sources.ts.
//
// The SYNC property names below are the observed Sales NY schema (product and
// display columns are date properties; a present start date means the store
// carries the line / has the display). The three extra sheets are read with
// candidate column names because their exact Notion property names are set
// by the workbook tabs; each sheet is enabled by its own env database id and
// silently contributes nothing when unconfigured.
//
// This is a read boundary for the MCP tools only: it performs no sync, no
// writes, and keeps no cache tables. PR #211 owns the app-wide Sales NY
// reporting path (lib/server/sales-ny-*); this reader can be swapped onto it
// if #211 lands first.

export interface SyncFacts {
  creditStatus: string | null;
  nabisRating: string | null;
  daysOverdue: number | null;
  paymentAverageDays: number | null;
  ordersPaid: number | null;
  totalOrders: number | null;
  lastOrderDate: string | null;
  lastOrderAmount: number | null;
  lastSampleDate: string | null;
  firstOrderDate: string | null;
  carries: string[];
  displaysPresent: string[];
  displaysMissing: string[];
  distruCompanyId: string | null;
  licenseNumber: string | null;
  nabisId: string | null;
  asOf: string;
}

export interface ArFacts {
  creditStatus: string | null;
  paymentRequired: boolean | null;
  daysOverdue: number | null;
  unpaidOrders: number | null;
  overdueOrders: number | null;
  amountPaid: number | null;
}

export interface SalesNyData {
  // Keyed by every join key we can compute: notion page id of the SYNC row,
  // Distru Company ID, license number, Nabis ID, and normalized store name.
  syncByKey: Map<string, SyncFacts>;
  headsetByKey: Map<string, boolean>;
  arByKey: Map<string, ArFacts>;
  asOf: string;
}

export interface SalesNyEnv {
  NOTION_API_KEY?: string;
  NOTION_API_BASE?: string;
  NOTION_VERSION?: string;
  NOTION_SYNC_DATABASE_ID?: string;
  NOTION_HEADSET_DATABASE_ID?: string;
  NOTION_AR_DATABASE_ID?: string;
}

type FetchFn = typeof fetch;

// SYNC date columns: [notion property name, display name]
export const SYNC_PRODUCT_COLUMNS: Array<[string, string]> = [
  ['SMACK\n1G', 'SMACK 1G'],
  ['SMACK\n0.5 G', 'SMACK 0.5G'],
  ['Champs\n1G', 'CHAMPS 1G'],
  ['Sushi\n1G', 'Sushi 1G'],
  ['Sushi\n5pk', 'Sushi 5pk'],
  ['Ichi-Roll\n1G', 'Ichi-Roll 1G'],
  ['Ichi-Roll\n4pk', 'Ichi-Roll 4pk'],
  ['#Juan\n1G', '#Juan 1G'],
  ['#Juan\n4pk', '#Juan 4pk'],
  ['Nom Nom', 'Nom Nom'],
  ['O-Yeah\n1G', 'Oh Yeah (O-Yeah) 1G'],
  ['O-Yeah\n5pk', 'Oh Yeah (O-Yeah) 5pk'],
  ['SoM\n1G', 'State of Mind (SoM) 1G'],
  ['SoM\n5pk', 'State of Mind (SoM) 5pk'],
  ['Chopsticks', 'Chopsticks'],
  ['Smack Bag 1oz', 'Smack Bag 1oz'],
  ['Smack Bag 1/2oz', 'Smack Bag 1/2oz'],
  ['Bandolier Belt', 'Bandolier Belt'],
];

export const SYNC_DISPLAY_COLUMNS: Array<[string, string]> = [
  ['SMACK Display', 'SMACK Display'],
  ['Champs  Display', 'CHAMPS Display'],
  ['Sushi Hash Display', 'Sushi Hash Display'],
  ['Chopsticks Display', 'Chopsticks Display'],
  ['O-Yeah Display', 'Oh Yeah (O-Yeah) Display'],
  ['Ichi/Juan Display', 'Ichi/Juan Display'],
  ['SoM Display', 'SoM Display'],
  ['LED SCREEN', 'LED Screen'],
  ['Neon Sign', 'Neon Sign'],
];

interface NotionProperty {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  status?: { name?: string } | null;
  date?: { start?: string | null } | null;
  checkbox?: boolean;
  formula?: { string?: string | null; number?: number | null };
  rollup?: { number?: number | null };
  relation?: Array<{ id?: string }>;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
}

interface NotionPage {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
}

function plainText(parts?: Array<{ plain_text?: string }>): string {
  return (parts ?? []).map((part) => part.plain_text ?? '').join('').trim();
}

export function propertyText(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return plainText(prop.title) || null;
    case 'rich_text':
      return plainText(prop.rich_text) || null;
    case 'select':
      return prop.select?.name ?? null;
    case 'status':
      return prop.status?.name ?? null;
    case 'multi_select':
      return (prop.multi_select ?? []).map((item) => item.name).filter(Boolean).join(', ') || null;
    case 'formula':
      return prop.formula?.string ?? (prop.formula?.number != null ? String(prop.formula.number) : null);
    case 'url':
      return prop.url ?? null;
    case 'email':
      return prop.email ?? null;
    case 'phone_number':
      return prop.phone_number ?? null;
    default:
      return plainText(prop.rich_text) || plainText(prop.title) || null;
  }
}

export function propertyNumber(prop: NotionProperty | undefined): number | null {
  if (!prop) return null;
  if (typeof prop.number === 'number') return prop.number;
  if (prop.type === 'formula' && typeof prop.formula?.number === 'number') return prop.formula.number;
  if (prop.type === 'rollup' && typeof prop.rollup?.number === 'number') return prop.rollup.number;
  const text = propertyText(prop);
  if (text != null && text !== '' && Number.isFinite(Number(text))) return Number(text);
  return null;
}

export function propertyDateStart(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  if (prop.type === 'date') return prop.date?.start ?? null;
  const text = propertyText(prop);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

export function propertyByCandidates(
  properties: Record<string, NotionProperty>,
  candidates: string[],
): NotionProperty | undefined {
  for (const candidate of candidates) {
    if (properties[candidate]) return properties[candidate];
  }
  const lowered = new Map(Object.keys(properties).map((key) => [key.toLowerCase(), key]));
  for (const candidate of candidates) {
    const key = lowered.get(candidate.toLowerCase());
    if (key) return properties[key];
  }
  return undefined;
}

export function normalizeStoreKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function indexKeys(page: NotionPage, properties: Record<string, NotionProperty>): string[] {
  const keys = new Set<string>([`page:${page.id.replace(/-/g, '')}`]);
  const name = propertyText(propertyByCandidates(properties, ['Dispensary Name', 'Store', 'Name', 'Store Name']));
  if (name) keys.add(`name:${normalizeStoreKey(name)}`);
  const distru = propertyText(propertyByCandidates(properties, ['Distru Company ID', 'Distru ID']));
  if (distru) keys.add(`distru:${distru.trim()}`);
  const license = propertyText(propertyByCandidates(properties, ['License Number', 'License']));
  if (license) keys.add(`license:${license.trim()}`);
  const nabis = propertyText(propertyByCandidates(properties, ['Nabis ID', 'Nabis Retailer ID']));
  if (nabis) keys.add(`nabis:${nabis.trim()}`);
  return [...keys];
}

export function parseSyncPage(page: NotionPage): { facts: SyncFacts; keys: string[] } {
  const properties = page.properties ?? {};
  const carries: string[] = [];
  for (const [column, display] of SYNC_PRODUCT_COLUMNS) {
    if (propertyDateStart(properties[column])) carries.push(display);
  }
  const displaysPresent: string[] = [];
  const displaysMissing: string[] = [];
  for (const [column, display] of SYNC_DISPLAY_COLUMNS) {
    if (propertyDateStart(properties[column])) displaysPresent.push(display);
    else displaysMissing.push(display);
  }
  const overdueValues = ['Days Overdue 1', 'Days Overdue 2', 'Days Overdue 3']
    .map((column) => propertyNumber(properties[column]))
    .filter((value): value is number => value != null);
  const facts: SyncFacts = {
    creditStatus: propertyText(propertyByCandidates(properties, ['Credit Status'])),
    nabisRating: propertyText(propertyByCandidates(properties, ['Nabis Credit Rating'])),
    daysOverdue: overdueValues.length > 0 ? Math.max(...overdueValues) : null,
    paymentAverageDays: propertyNumber(propertyByCandidates(properties, ['Payment Average'])),
    ordersPaid: propertyNumber(propertyByCandidates(properties, ['Orders Paid'])),
    totalOrders: propertyNumber(propertyByCandidates(properties, ['Total Orders'])),
    lastOrderDate: propertyDateStart(propertyByCandidates(properties, ['Last Order Delivered'])),
    lastOrderAmount: propertyNumber(propertyByCandidates(properties, ['Last Order Amount'])),
    lastSampleDate: propertyDateStart(propertyByCandidates(properties, ['Last Sample Delivered'])),
    firstOrderDate: propertyDateStart(propertyByCandidates(properties, ['First Order\nCreated', 'First Order Created'])),
    carries,
    displaysPresent,
    displaysMissing,
    distruCompanyId: propertyText(propertyByCandidates(properties, ['Distru Company ID'])),
    licenseNumber: propertyText(propertyByCandidates(properties, ['License Number'])),
    nabisId: propertyText(propertyByCandidates(properties, ['Nabis ID'])),
    asOf: page.last_edited_time ?? new Date().toISOString(),
  };
  return { facts, keys: indexKeys(page, properties) };
}

export function parseHeadsetPage(page: NotionPage): { connected: boolean; keys: string[] } | null {
  const properties = page.properties ?? {};
  const prop = propertyByCandidates(properties, [
    'Headset Connected',
    'Connected',
    'Headset Connection',
    'Headset Status',
    'Status',
  ]);
  if (!prop) return null;
  let connected: boolean | null = null;
  if (prop.type === 'checkbox') connected = Boolean(prop.checkbox);
  else {
    const text = (propertyText(prop) ?? '').toLowerCase();
    if (text.includes('not') || text.includes('no') || text.includes('disconnect')) connected = false;
    else if (text.includes('connect') || text.includes('yes') || text.includes('active')) connected = true;
  }
  if (connected == null) return null;
  return { connected, keys: indexKeys(page, properties) };
}

export function parseArPage(page: NotionPage): { facts: ArFacts; keys: string[] } | null {
  const properties = page.properties ?? {};
  const creditStatus = propertyText(propertyByCandidates(properties, ['Credit Status', 'AR Credit Status']));
  const ruleProp = propertyByCandidates(properties, ['Payment Required Rule', 'Payment Required']);
  let paymentRequired: boolean | null = null;
  if (ruleProp?.type === 'checkbox') paymentRequired = Boolean(ruleProp.checkbox);
  else {
    const ruleText = (propertyText(ruleProp) ?? '').trim().toLowerCase();
    if (ruleText === 'yes' || ruleText === 'true' || ruleText.includes('required')) paymentRequired = true;
    else if (ruleText === 'no' || ruleText === 'false') paymentRequired = false;
  }
  const facts: ArFacts = {
    creditStatus,
    paymentRequired,
    daysOverdue: propertyNumber(propertyByCandidates(properties, ['Days Overdue', 'Overdue Days', 'Days Past Due'])),
    unpaidOrders: propertyNumber(propertyByCandidates(properties, ['Unpaid Orders', 'Orders Unpaid', 'Unpaid'])),
    overdueOrders: propertyNumber(propertyByCandidates(properties, ['Overdue Orders', 'Orders Overdue'])),
    amountPaid: propertyNumber(propertyByCandidates(properties, ['Amount Paid', 'Paid Amount', 'Total Paid'])),
  };
  if (
    facts.creditStatus == null &&
    facts.paymentRequired == null &&
    facts.daysOverdue == null &&
    facts.unpaidOrders == null &&
    facts.overdueOrders == null
  ) {
    return null;
  }
  return { facts, keys: indexKeys(page, properties) };
}

async function queryAllPages(
  env: SalesNyEnv,
  fetchFn: FetchFn,
  databaseId: string,
): Promise<NotionPage[]> {
  const apiKey = env.NOTION_API_KEY?.trim();
  if (!apiKey) return [];
  const base = (env.NOTION_API_BASE?.trim() || 'https://api.notion.com/v1').replace(/\/$/, '');
  const version = env.NOTION_VERSION?.trim() || '2022-06-28';
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard += 1) {
    const response = await fetchFn(`${base}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!response.ok) throw new Error(`Notion query failed (${response.status}) for database ${databaseId}`);
    const payload = (await response.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    pages.push(...(payload.results ?? []));
    if (!payload.has_more || !payload.next_cursor) break;
    cursor = payload.next_cursor;
  }
  return pages;
}

export async function loadSalesNyData(
  env: SalesNyEnv = process.env as SalesNyEnv,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<SalesNyData> {
  const data: SalesNyData = {
    syncByKey: new Map(),
    headsetByKey: new Map(),
    arByKey: new Map(),
    asOf: now.toISOString(),
  };

  if (env.NOTION_SYNC_DATABASE_ID?.trim()) {
    try {
      const pages = await queryAllPages(env, fetchFn, env.NOTION_SYNC_DATABASE_ID.trim());
      for (const page of pages) {
        const { facts, keys } = parseSyncPage(page);
        for (const key of keys) if (!data.syncByKey.has(key)) data.syncByKey.set(key, facts);
      }
    } catch (error) {
      console.debug('[rep-copilot] Sales NY SYNC read failed', error);
    }
  }

  if (env.NOTION_HEADSET_DATABASE_ID?.trim()) {
    try {
      const pages = await queryAllPages(env, fetchFn, env.NOTION_HEADSET_DATABASE_ID.trim());
      for (const page of pages) {
        const parsed = parseHeadsetPage(page);
        if (!parsed) continue;
        for (const key of parsed.keys) if (!data.headsetByKey.has(key)) data.headsetByKey.set(key, parsed.connected);
      }
    } catch (error) {
      console.debug('[rep-copilot] Headset Connections read failed', error);
    }
  }

  if (env.NOTION_AR_DATABASE_ID?.trim()) {
    try {
      const pages = await queryAllPages(env, fetchFn, env.NOTION_AR_DATABASE_ID.trim());
      for (const page of pages) {
        const parsed = parseArPage(page);
        if (!parsed) continue;
        for (const key of parsed.keys) if (!data.arByKey.has(key)) data.arByKey.set(key, parsed.facts);
      }
    } catch (error) {
      console.debug('[rep-copilot] AR read failed', error);
    }
  }

  return data;
}

export function lookupByKeys<T>(
  map: Map<string, T>,
  keys: Array<string | null | undefined>,
): T | null {
  for (const key of keys) {
    if (key && map.has(key)) return map.get(key) ?? null;
  }
  return null;
}
