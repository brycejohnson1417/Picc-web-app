import type { ProposalProduct } from './distru-proposal';

export type StoreSalesContext = {
  coverageStart: string | null;
  coverageEnd: string | null;
  completeCoverage: boolean;
  featuredFamilies?: string[];
  catalog: Array<ProposalProduct & { family?: string; featured?: boolean }>;
  orders: Array<{
    date: string; status: string; included: boolean;
    items: Array<{ productId: string; family?: string; isSample: boolean; quantity: number; returnedQuantity?: number }>;
  }>;
  payment?: {
    creditStatus?: string | null; paymentDaysAvg?: number | null; overdueOrders?: number | null;
    ruleInEffect?: string | null; overdueOrderNumbers?: string | null;
    source?: string; sourceAsOf?: string; sourceUrl?: string; sourceErrors?: string[];
  } | null;
};

export type StoreOpportunity = {
  product: StoreSalesContext['catalog'][number];
  evidence: 'not-ordered-in-period' | 'previously-ordered' | 'available';
  lastOrderDate: string | null;
};

export function buildStoreOpportunities(context: StoreSalesContext) {
  const productDates = new Map<string, string>(), familyDates = new Map<string, string>();
  for (const order of context.orders) {
    if (!order.included || ['PENDING', 'CANCELED', 'CANCELLED', 'REJECTED'].includes(order.status.toUpperCase())) continue;
    for (const item of order.items) {
      if (item.isSample || item.quantity <= 0 || (item.returnedQuantity ?? 0) >= item.quantity) continue;
      productDates.set(item.productId, [productDates.get(item.productId) ?? '', order.date].sort().at(-1)!);
      if (item.family) familyDates.set(item.family, [familyDates.get(item.family) ?? '', order.date].sort().at(-1)!);
    }
  }
  const featured = context.featuredFamilies ?? [];
  const catalog = context.catalog.filter(product => (
    Number.isFinite(product.availableUnits) && (product.availableUnits ?? 0) >= product.unitsPerCase &&
    product.unitsPerCase > 0
  ));
  const ranked = catalog.map(product => {
    const family = product.family ?? product.brand;
    const featuredIndex = featured.indexOf(family);
    return {
      product,
      score: (productDates.has(product.productId) ? 10000 : 0) + (product.featured ? -1 : featuredIndex >= 0 ? featuredIndex : 100),
    };
  }).sort((left, right) => left.score - right.score || left.product.name.localeCompare(right.product.name));
  // Prefer distinct families, while retaining useful choices in a small assortment.
  const distinct = ranked.filter((row, index, all) => all.findIndex(candidate => (candidate.product.family ?? candidate.product.brand) === (row.product.family ?? row.product.brand)) === index);
  const selected = [...distinct, ...ranked.filter(row => !distinct.includes(row))].slice(0, 2);
  const suggestions: StoreOpportunity[] = selected.map(({ product }) => ({
    product,
    evidence: productDates.has(product.productId) ? 'previously-ordered' : context.completeCoverage && context.coverageStart && context.coverageEnd ? 'not-ordered-in-period' : 'available',
    lastOrderDate: productDates.get(product.productId) ?? null,
  }));
  const purchased = [...familyDates].map(([family, lastOrderDate]) => ({ family, lastOrderDate })).sort((left, right) => right.lastOrderDate.localeCompare(left.lastOrderDate));
  return { suggestions, purchased };
}
