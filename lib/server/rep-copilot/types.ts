// Rep Copilot MCP: shared types for the store-intelligence tool layer.
// See docs/PRD-REP-COPILOT-MCP.md. Every tool output is assembled from a
// StoreFacts record so the rules engine and ranking stay pure and testable.

export interface OpenInvoice {
  invoice_number: string;
  amount: number;
  days_overdue: number;
  source_note: string;
}

export interface SourceStamp {
  field_group: string;
  source_system: string;
  as_of: string;
}

/**
 * One store, merged across the field-ownership boundaries (PRD section 4,
 * refined by the 2026-11-18 data merge): CRM wins identity/contacts/PPP/
 * status; the AR Credit Status tab (Nabis Master Sheet) wins credit status,
 * payment-required, days overdue, and open-invoice detail over Sales NY
 * SYNC, which supplies the remaining order and carry facts; the Headset
 * Connections DB wins headset status; Distru wins live inventory and
 * marketplace orders; app Postgres wins check-ins and routes.
 */
export interface StoreFacts {
  // Identity and CRM (Notion Dispensary Master List via app territory data)
  storeId: string;
  notionPageId: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  primaryContactName: string | null;
  accountStatus: string | null;
  pinKind: 'lead' | 'customer' | 'other';
  pppEnrolled: boolean;
  pppType: string | null;
  headsetConnectedCrm: boolean | null;
  mediaKitSent: boolean | null;
  followUpDate: string | null;
  lastCheckIn: string | null;
  interactionsScore: number | null;

  // Sales NY SYNC financial and carry facts
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
  syncAsOf: string | null;

  // Why this store slowed or stopped: CRM "Follow Up Reason" is the in-app
  // source; the Proposal Tracker rep tabs' Quick Notes / Store Notes columns
  // carry the same content upstream. (There is no "Sales and Why" sheet.)
  whyStopped: string | null;

  // Headset Connections (Notion DB "NY Headset Connections — CSV
  // (Sheet2-2)"), authoritative for headset status over CRM text.
  headsetConnectedSheet: boolean | null;

  // AR: the "Credit Status" tab of the Google workbook "Nabis Master
  // Sheet". Per-store unpaid orders, amount paid, overdue orders, days
  // overdue, and its own Payment Required Rule. It has NO balance-due
  // column; a balance is never modeled from it. AR wins credit status,
  // payment-required, days overdue, and open-invoice detail over SYNC.
  arCreditStatus: string | null;
  arPaymentRequired: boolean | null;
  arDaysOverdue: number | null;
  arUnpaidOrders: number | null;
  arOverdueOrders: number | null;
  arAmountPaid: number | null;
  arOpenInvoices: OpenInvoice[] | null;

  // Raw SYNC money facts, kept for conflict logging when AR disagrees.
  syncCreditStatus: string | null;
  syncDaysOverdue: number | null;

  // Distru linkage
  distruCompanyId: string | null;

  // Difficult account flag (Do Not Target). Semantics: the account is a real
  // dispensary that is difficult to work; it is excluded from default attack
  // lists, never treated as bad data.
  doNotTarget: boolean;
}

export interface MonthlyOrder {
  month: string; // YYYY-MM
  orderCount: number;
  orderTotal: number;
}

export interface ActionItem {
  priority: number;
  action: string;
  detail: string;
}

export interface RankedStore {
  storeId: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  ordersCount: number | null;
  lastOrderAmount: number | null;
  lastOrderDate: string | null;
  monthsQuiet: number | null;
  creditStatus: string | null;
  rankReason: string;
  // Internal ranking score; stripped from tool output by the service.
  score?: number;
  doNotTarget: boolean;
}

export interface AttackFilters {
  sampledWithinDays?: number;
  sampledSort?: 'earliest_first' | 'latest_first';
  sampledNotClosed?: boolean;
  notCarryingPcc?: boolean;
  includeDifficult?: boolean;
}

// The PICC product catalog as modeled by the Sales NY SYNC order-date
// columns. carries/missing are computed against this list when Distru's live
// catalog is unavailable; display names match the SYNC-derived names.
export const PRODUCT_CATALOG: string[] = [
  'SMACK 1G',
  'SMACK 0.5G',
  'CHAMPS 1G',
  'Sushi 1G',
  'Sushi 5pk',
  'Ichi-Roll 1G',
  'Ichi-Roll 4pk',
  '#Juan 1G',
  '#Juan 4pk',
  'Nom Nom',
  'Oh Yeah (O-Yeah) 1G',
  'Oh Yeah (O-Yeah) 5pk',
  'State of Mind (SoM) 1G',
  'State of Mind (SoM) 5pk',
  'Chopsticks',
  'Smack Bag 1oz',
  'Smack Bag 1/2oz',
  'Bandolier Belt',
];

export const DISPLAY_CATALOG: string[] = [
  'SMACK Display',
  'CHAMPS Display',
  'Sushi Hash Display',
  'Chopsticks Display',
  'Oh Yeah (O-Yeah) Display',
  'Ichi/Juan Display',
  'SoM Display',
  'LED Screen',
  'Neon Sign',
];

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function effectiveHeadsetConnected(facts: StoreFacts): boolean | null {
  // Headset Connections sheet is authoritative; CRM text is the fallback.
  return facts.headsetConnectedSheet ?? facts.headsetConnectedCrm;
}

export function isPaymentRequired(facts: StoreFacts): boolean {
  // The AR Payment Required Rule is authoritative when present.
  if (facts.arPaymentRequired != null) return facts.arPaymentRequired;
  const credit = (facts.creditStatus ?? '').trim().toLowerCase();
  if (credit === 'payment required' || credit === 'cod' || credit === 'cod/pr') return true;
  if ((facts.daysOverdue ?? 0) > 0) return true;
  if (facts.arOpenInvoices && facts.arOpenInvoices.length > 0) return true;
  return false;
}

/**
 * Field ownership for money facts: the AR Credit Status tab wins credit
 * status, payment-required, and days overdue over SYNC. Returns a copy of
 * the facts with the effective values in the primary fields; the raw SYNC
 * values stay in syncCreditStatus / syncDaysOverdue for conflict logging.
 */
export function applyArOwnership(facts: StoreFacts): StoreFacts {
  return {
    ...facts,
    creditStatus: facts.arCreditStatus ?? facts.creditStatus,
    daysOverdue: facts.arDaysOverdue ?? facts.daysOverdue,
  };
}

export function isGoodPayer(facts: StoreFacts): boolean {
  const credit = (facts.creditStatus ?? '').trim().toLowerCase();
  if (credit.includes('good')) return true;
  if ((facts.daysOverdue ?? 0) > 0) return false;
  return facts.paymentAverageDays != null && facts.paymentAverageDays <= 7;
}
