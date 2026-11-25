export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  kind: 'pre-roll' | 'display' | 'other' | `gummy:${string}`;
  strain: string | null;
  available: number;
};
export type OrderRow = {
  id: string;
  productId: string;
  quantity: number;
  sample: boolean;
  price: number;
  snapshot: string;
};
export type SalesOrder = {
  id: string;
  number: string;
  status: string;
  date: string;
  updatedAt: string;
  url: string | null;
  editable: boolean;
  locationId: string | null;
  rows: OrderRow[];
  snapshot: string;
};
export type SampleLine = {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  kind: CatalogProduct['kind'];
  quantity: number;
  reason: string;
  availableUnits: number;
};
export type SamplePreview = {
  order: Pick<SalesOrder, 'number' | 'status' | 'url' | 'date'> | null;
  reason: string | null;
  lines: SampleLine[];
  skipped: string[];
  fingerprint?: string;
  unitPriceCents: number;
};

export type SamplePolicy = {
  unitPriceCents: number;
  preRollCap: number;
  preRollBrands: string[];
  brandAliases: Record<string, string[]>;
  exclusions: string[];
  gummyBrand: string;
  gummyGroups: { label: string; terms: string[] }[];
};
export const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export function planSamples(history: SalesOrder[], catalog: CatalogProduct[], previousChannelPurchase: boolean, policy: SamplePolicy): SamplePreview {
  const samplePrice = policy.unitPriceCents / 100;
  const products = new Map(catalog.map(product => [product.id, product]));
  const relevant = history.filter(order => !['canceled', 'cancelled', 'merged'].includes(order.status));
  const commercial = relevant
    .filter(order => order.rows.some(row => !row.sample && row.quantity > 0 && row.price > samplePrice &&
      products.get(row.productId)?.kind !== 'display'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const current = commercial[0];
  const order = current ? { number: current.number, status: current.status, url: current.url, date: current.date } : null;
  const blocked = (reason: string) => ({ order, reason, lines: [], skipped: [], unitPriceCents: policy.unitPriceCents });

  if (!current) return blocked('No commercial order was found for this store location in Distru.');
  if (previousChannelPurchase || commercial.length > 1) return blocked('An additional commercial order was found for this location. First-order samples are unavailable.');
  if (!current.editable || !current.locationId) return blocked('The suggested order cannot accept sample lines. It must be an editable, pending order with a stock location.');
  if (current.rows.some(row => !products.has(row.productId))) return blocked('Distru could not identify every product on the suggested order.');

  const existing = current.rows.reduce((totals, row) =>
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + row.quantity), new Map<string, number>());
  const available = (product: CatalogProduct) => Math.max(0, Math.floor(product.available - (existing.get(product.id) ?? 0)));
  const mostStock = (a: CatalogProduct, b: CatalogProduct) => available(b) - available(a) || a.sku.localeCompare(b.sku);
  const paidProducts = current.rows.flatMap(row => {
    const product = products.get(row.productId);
    return product && !row.sample && row.price > samplePrice && row.quantity > 0 && product.kind !== 'display' ? [product] : [];
  });
  const carried = [...new Set(paidProducts.map(product => product.brand))].filter(brand => brand && !policy.exclusions.some(exclusion => keyOf(exclusion) === keyOf(brand)));
  const lines: SampleLine[] = [];
  const skipped: string[] = [];

  function add(product: CatalogProduct, quantity: number, reason: string) {
    lines.push({ productId: product.id, sku: product.sku, name: product.name, brand: product.brand, kind: product.kind, quantity, reason, availableUnits: available(product) });
  }

  for (const brand of policy.preRollBrands.filter(brand => carried.includes(brand))) {
    const bought = paidProducts.filter(product => product.brand === brand);
    const sameStrain = (product: CatalogProduct) => Boolean(product.strain && bought.some(row => row.strain === product.strain));
    const priority = (product: CatalogProduct) => bought.some(row => row.id === product.id) ? 2 : sameStrain(product) ? 1 : 0;
    const alreadyAdded = current.rows.filter(row => row.sample).reduce((sum, row) => {
      const product = products.get(row.productId);
      return sum + (product?.brand === brand && product.kind === 'pre-roll' ? row.quantity : 0);
    }, 0);
    let remaining = Math.max(0, policy.preRollCap - alreadyAdded);
    if (!remaining) continue;
    const candidates = catalog.filter(p => p.brand === brand && p.kind === 'pre-roll' && available(p) > 0);
    const matches = candidates.filter(product => priority(product) > 0);
    const choices = (matches.length ? matches : candidates.slice().sort(mostStock).slice(0, 1))
      .sort((a, b) => priority(b) - priority(a) || (existing.get(b.id) ?? 0) - (existing.get(a.id) ?? 0) || a.sku.localeCompare(b.sku));
    const quantities = choices.map(() => 0);
    while (remaining > 0 && choices.some((p, index) => available(p) > quantities[index])) {
      choices.forEach((product, index) => {
        if (remaining > 0 && available(product) > quantities[index]) {
          quantities[index]++;
          remaining--;
        }
      });
    }
    choices.forEach((product, index) => {
      if (quantities[index]) add(product, quantities[index], ['Same-brand substitution', 'Ordered strain', 'Ordered SKU'][priority(product)]);
    });
    if (remaining) skipped.push(`${brand}: ${remaining} pre-roll unit${remaining === 1 ? '' : 's'} unavailable.`);
  }

  for (const group of policy.gummyGroups) {
    const kind = `gummy:${group.label}`;
    if (current.rows.some(row => row.sample && row.quantity > 0 && products.get(row.productId)?.kind === kind)) continue;
    const best = catalog.filter(product => product.kind === kind && available(product) > 0).sort(mostStock)[0];
    if (best) add(best, 1, 'Most available in its gummy line');
    else skipped.push(`No verified ${policy.gummyBrand} ${group.label} gummy packs in stock.`);
  }

  const displayHistoryComplete = relevant.every(item => item.rows.every(row => {
    const product = products.get(row.productId);
    return product && (product.kind !== 'display' || (product.brand && keyOf(product.brand) !== 'picc'));
  }));
  for (const brand of carried) {
    if (!displayHistoryComplete) {
      skipped.push(`${brand}: display history could not be verified.`);
      continue;
    }
    if (relevant.some(item => item.rows.some(row => {
      const product = products.get(row.productId);
      return row.quantity > 0 && product?.kind === 'display' && product.brand === brand;
    }))) {
      skipped.push(`${brand} already has a display.`);
      continue;
    }
    const best = catalog.filter(product => product.brand === brand && product.kind === 'display' && available(product) > 0).sort(mostStock)[0];
    if (best) add(best, 1, 'First display for this brand at this location');
    else skipped.push(`No verified ${brand} display in stock.`);
  }

  return { order, lines, skipped, unitPriceCents: policy.unitPriceCents, reason: lines.length ? null : 'There are no eligible additions for this order.' };
}
