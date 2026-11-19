// Rep Copilot MCP: deterministic rules. The action plan (PRD section 2.4)
// and the attack-list ranking (PRD section 3.2) are pure functions of
// StoreFacts so the same input always produces the same report.

import {
  PRODUCT_CATALOG,
  effectiveHeadsetConnected,
  isGoodPayer,
  isPaymentRequired,
  type ActionItem,
  type AttackFilters,
  type RankedStore,
  type StoreFacts,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return ms / (30.4375 * DAY_MS);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function monthsQuiet(facts: StoreFacts, now: Date): number | null {
  const last = parseDate(facts.lastOrderDate);
  if (!last) return null;
  return Math.round(monthsBetween(last, now) * 10) / 10;
}

export function missingSkus(facts: StoreFacts, catalog: string[] = PRODUCT_CATALOG): string[] {
  const carried = new Set(facts.carries.map((name) => name.toLowerCase()));
  return catalog.filter((line) => !carried.has(line.toLowerCase()));
}

/**
 * Action plan in Travis's priority order (PRD 2.4):
 * (a) payment required first, with named open invoices;
 * (b) push the SKUs and brands the store does not carry;
 * (c) no order in about 2 months: get an order and find out why they stopped;
 * (d) not on PPP: get them on PPP;
 * (e) good payer: pitch the 25 percent one-day-a-week sale day;
 * (f) not on Headset: get them on Headset (required by the PRD fixture).
 */
export function buildActionPlan(facts: StoreFacts, now: Date): ActionItem[] {
  const items: Omit<ActionItem, 'priority'>[] = [];

  if (isPaymentRequired(facts)) {
    const invoices = facts.arOpenInvoices ?? [];
    const named = invoices
      .slice(0, 5)
      .map((inv) => `${inv.invoice_number} $${inv.amount.toLocaleString('en-US')} (${inv.days_overdue}d overdue)`)
      .join('; ');
    if (named) {
      items.push({ action: 'Collect payment before anything else', detail: `Open invoices: ${named}.` });
    } else {
      const arBits: string[] = [];
      if (facts.arOverdueOrders != null) arBits.push(`${facts.arOverdueOrders} overdue orders per AR`);
      if (facts.arDaysOverdue != null) arBits.push(`${facts.arDaysOverdue} days overdue per AR`);
      const overdue = (facts.daysOverdue ?? 0) > 0 ? ` ${facts.daysOverdue} days overdue.` : '';
      items.push({
        action: 'Collect payment before anything else',
        detail: `Payment is required on this account.${arBits.length > 0 ? ` ${arBits.join(', ')} (Credit Status tab, Nabis Master Sheet).` : overdue}`.trim(),
      });
    }
  }

  const missing = missingSkus(facts);
  if (missing.length > 0 && missing.length < PRODUCT_CATALOG.length) {
    items.push({
      action: 'Push the lines they do not carry',
      detail: `Missing: ${missing.join(', ')}.`,
    });
  } else if (missing.length === PRODUCT_CATALOG.length && facts.pinKind !== 'lead') {
    items.push({
      action: 'Push the lines they do not carry',
      detail: `They carry none of the current catalog. Lead with the core lines: ${missing.slice(0, 6).join(', ')}.`,
    });
  }

  const quiet = monthsQuiet(facts, now);
  const hasOrdered = (facts.totalOrders ?? 0) > 0 || facts.lastOrderDate != null;
  if (hasOrdered && (quiet == null || quiet >= 2)) {
    const why = facts.whyStopped
      ? ` Follow Up Reason on file: "${facts.whyStopped}". Confirm it and work the fix.`
      : ' No Follow Up Reason on file; find out why they stopped and log it.';
    items.push({
      action: 'Get an order and find out why they stopped',
      detail: `Last order ${facts.lastOrderDate ?? 'on record without a date'}${quiet != null ? `, ${quiet} months quiet` : ''}.${why}`,
    });
  }

  if (!facts.pppEnrolled) {
    items.push({
      action: 'Get them on PPP',
      detail: 'Not enrolled in the Preferred Partner Program. Pitch PPP enrollment on this visit.',
    });
  }

  if (isGoodPayer(facts) && !isPaymentRequired(facts)) {
    items.push({
      action: 'Pitch the 25% sale day',
      detail:
        'Good payer. Pitch the 25 percent one-day-a-week sale day. Check the sale-day pricing before you pitch it.',
    });
  }

  if (effectiveHeadsetConnected(facts) === false) {
    items.push({
      action: 'Get them on Headset',
      detail: 'Not connected on Headset. Get the sell-through connection set up so their numbers stay current.',
    });
  }

  return items.map((item, index) => ({ priority: index + 1, ...item }));
}

const MANHATTAN_ZIP_PREFIXES = ['100', '101', '102'];

export function areaMatches(facts: StoreFacts, area: string): boolean {
  const target = area.trim().toLowerCase();
  if (!target) return true;
  const neighborhood = (facts.neighborhood ?? '').trim().toLowerCase();
  const city = (facts.city ?? '').trim().toLowerCase();
  if (neighborhood && (neighborhood === target || neighborhood.includes(target))) return true;
  if (city && city === target) return true;
  if (target === 'manhattan') {
    if (city === 'new york' || city === 'new york city') {
      const zip = (facts.zipcode ?? '').trim();
      return MANHATTAN_ZIP_PREFIXES.some((prefix) => zip.startsWith(prefix));
    }
    return neighborhood.length > 0;
  }
  if (target === 'brooklyn' || target === 'queens' || target === 'bronx' || target === 'staten island') {
    return city === target;
  }
  return false;
}

function creditRank(creditStatus: string | null): { bonus: number; label: string | null } {
  const credit = (creditStatus ?? '').trim().toLowerCase();
  if (!credit) return { bonus: 0, label: null };
  if (credit.includes('good')) return { bonus: 50, label: 'credit good' };
  if (credit === 'cod' || credit === 'cod/pr') return { bonus: -50, label: 'COD' };
  if (credit === 'payment required') return { bonus: -80, label: 'payment required' };
  return { bonus: 0, label: creditStatus };
}

function passesFilters(facts: StoreFacts, filters: AttackFilters, now: Date): boolean {
  if (filters.sampledWithinDays != null) {
    const sample = parseDate(facts.lastSampleDate);
    if (!sample) return false;
    if (now.getTime() - sample.getTime() > filters.sampledWithinDays * DAY_MS) return false;
  }
  if (filters.sampledNotClosed) {
    if (!facts.lastSampleDate) return false;
    if ((facts.totalOrders ?? 0) > 0) return false;
  }
  if (filters.notCarryingPcc) {
    // "Stores in the area PICC is not in yet": they carry none of the catalog.
    if (facts.carries.length > 0) return false;
  }
  return true;
}

export function rankAttackCandidates(
  stores: StoreFacts[],
  filters: AttackFilters,
  now: Date,
): RankedStore[] {
  const ranked: RankedStore[] = [];

  for (const facts of stores) {
    if (!passesFilters(facts, filters, now)) continue;
    const quiet = monthsQuiet(facts, now);
    const hasOrdered = (facts.totalOrders ?? 0) > 0 || facts.lastOrderDate != null;
    const reasons: string[] = [];
    let score = 0;

    if (hasOrdered) {
      const dormancy = quiet ?? 24;
      score += 1000 + Math.min(dormancy, 36) * 10;
      reasons.push(
        quiet != null
          ? `dormant ${Math.round(dormancy)} months after ${facts.totalOrders ?? 'several'} orders`
          : 'previously ordered, no recent order date',
      );
    } else {
      reasons.push('never ordered');
    }

    const credit = creditRank(facts.creditStatus);
    score += credit.bonus;
    if (credit.label) reasons.push(credit.label);

    const sample = parseDate(facts.lastSampleDate);
    if (sample) {
      const ageDays = (now.getTime() - sample.getTime()) / DAY_MS;
      if (ageDays <= 90) {
        score += 30;
        reasons.push('sampled recently');
      } else if (ageDays <= 180) {
        score += 15;
        reasons.push('sampled in the last 6 months');
      }
    }

    if (facts.interactionsScore != null && facts.interactionsScore > 0) {
      score += Math.min(facts.interactionsScore, 20);
      reasons.push('recent engagement on file');
    }

    if (facts.doNotTarget) {
      reasons.push('difficult account (Do Not Target)');
    }

    ranked.push({
      storeId: facts.storeId,
      name: facts.name,
      address: facts.address,
      neighborhood: facts.neighborhood,
      ordersCount: facts.totalOrders,
      lastOrderAmount: facts.lastOrderAmount,
      lastOrderDate: facts.lastOrderDate,
      monthsQuiet: quiet,
      creditStatus: facts.creditStatus,
      rankReason: reasons.join('; '),
      score,
      doNotTarget: facts.doNotTarget,
    });
  }

  const byName = (a: RankedStore, b: RankedStore) => a.name.localeCompare(b.name);
  ranked.sort((a, b) => {
    // Difficult accounts always sort last; they are filtered out by the
    // caller unless include_difficult was requested.
    if (a.doNotTarget !== b.doNotTarget) return a.doNotTarget ? 1 : -1;
    if (filters.sampledSort) {
      const aSample = a.storeId ? stores.find((s) => s.storeId === a.storeId)?.lastSampleDate : null;
      const bSample = b.storeId ? stores.find((s) => s.storeId === b.storeId)?.lastSampleDate : null;
      const aTime = aSample ? new Date(aSample).getTime() : 0;
      const bTime = bSample ? new Date(bSample).getTime() : 0;
      if (aTime !== bTime) return filters.sampledSort === 'earliest_first' ? aTime - bTime : bTime - aTime;
    }
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    return byName(a, b);
  });

  return ranked;
}

export function applyAttackListWindow(
  ranked: RankedStore[],
  input: { limit: number; offset: number; includeDifficult: boolean },
): RankedStore[] {
  const visible = input.includeDifficult ? ranked : ranked.filter((store) => !store.doNotTarget);
  return visible.slice(input.offset, input.offset + input.limit);
}
