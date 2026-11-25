import 'server-only';

import { z } from 'zod';
import { keyOf, type CatalogProduct, type SalesOrder, type SampleLine, type SamplePolicy } from './plan';

export class SampleOrderError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

const entity = z.object({ id: z.string(), name: z.string().nullish() });
const location = entity.extend({ address: z.string() });
const rowSchema = z.object({
  id: z.string(), product: entity, quantity: z.string(), price: z.string(), priceBase: z.string(), isSample: z.boolean(),
  batch: entity.nullish(), package: entity.nullish(), location: entity.nullish(),
  note: z.string().nullish(), priceTierMode: z.string().nullish(), priceTier: z.unknown().optional(),
});
const orderSchema = z.object({
  id: z.string(), orderNumber: z.string(), orderDate: z.string(), updatedDate: z.string(), status: z.string(),
  url: z.string(), customer: entity.nullish(), shippingLocation: location.nullish(), location: entity.nullish(),
  combinedOrder: entity.nullish(), invoices: z.array(entity), orderCharges: z.array(z.unknown()),
  complianceManifestNumber: z.string().nullish(), orderItems: z.array(rowSchema),
});
const productSchema = entity.extend({
  name: z.string(), sku: z.string(), brand: entity.nullish(), category: entity.nullish(), subcategory: entity.nullish(),
  group: entity.nullish(), strain: entity.nullish(), unitType: entity, unitNetWeight: z.string().nullish(),
  unitNetWeightAndServingSizeUnitType: entity.nullish(),
});
const headerSchema = z.object({ id: z.string(), status: z.string(), recordOnly: z.boolean() });
const rpcSchema = z.object({
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
const toolSchema = z.object({
  structuredContent: z.unknown().optional(), isError: z.boolean().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
});
const mcpUrl = 'https://mcp.distru.com/mcp';
const restUrl = 'https://app.distru.com/public/v1/inventory';

function denied(status: number) {
  return new SampleOrderError(status === 401 || status === 403
    ? 'Distru declined the shared MCP connection. Ask a PICC admin to check access.'
    : 'Distru’s shared MCP connection is unavailable. Try again in a moment.', 502);
}

async function connectDistru() {
  const key = process.env.DISTRU_MCP_API_KEY?.trim();
  if (!key) throw new SampleOrderError('The shared Distru MCP connection has not been set up.', 503);
  let session: string | null = null;
  let protocol = '2025-03-26';

  async function rpc(method: string, params: unknown, id?: number) {
    const response = await fetch(mcpUrl, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${key}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
        ...(session ? { 'Mcp-Session-Id': session } : {}),
        ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': protocol }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
    });
    session = response.headers.get('Mcp-Session-Id') ?? session;
    if (!response.ok) throw denied(response.status);
    if (!id) return;
    const raw = await response.text();
    const messages = response.headers.get('content-type')?.includes('text/event-stream')
      ? raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)))
      : [JSON.parse(raw)];
    const parsed = rpcSchema.parse(messages.find(message => message?.id === id));
    if (parsed.error || !parsed.result) throw denied(502);
    return parsed.result;
  }

  const init = z.object({ protocolVersion: z.string() }).parse(await rpc('initialize', {
    protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'picc-rep-copilot', version: '1.0.0' },
  }, 1));
  protocol = init.protocolVersion;
  await rpc('notifications/initialized', {});
  let nextId = 2;
  const toolList = new Map<string, { inputSchema?: { properties?: { account?: { enum?: string[] } }; required?: string[] } }>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = z.object({
      tools: z.array(z.object({ name: z.string(), inputSchema: z.object({
        properties: z.object({ account: z.object({ enum: z.array(z.string()).optional() }).optional() }).optional(),
        required: z.array(z.string()).optional(),
      }).optional() })),
      nextCursor: z.string().nullish(),
    }).parse(await rpc('tools/list', cursor ? { cursor } : {}, nextId++));
    result.tools.forEach(tool => toolList.set(tool.name, tool));
    cursor = result.nextCursor ?? undefined;
    if (!cursor) break;
  }
  if (cursor) throw denied(502);
  const identityTool = toolList.get('distru-get-me');
  if (!identityTool) throw denied(502);
  const accounts = identityTool.inputSchema?.properties?.account?.enum ?? [];
  const allowed = accounts.filter(account => /^emcann\s*\(ny\)/i.test(account));
  const configuredAccount = process.env.DISTRU_MCP_ACCOUNT?.trim();
  const account = configuredAccount && allowed.includes(configuredAccount) ? configuredAccount : allowed.length === 1 ? allowed[0] : null;
  if ((accounts.length || identityTool.inputSchema?.required?.includes('account')) && !account) {
    throw new SampleOrderError('A unique EMCANN New York connection could not be verified.', 503);
  }

  async function tool(name: string, args: Record<string, unknown>) {
    if (!toolList.has(name)) throw new SampleOrderError('The shared Distru connection does not have the required access.', 503);
    const value = toolSchema.parse(await rpc('tools/call', { name, arguments: account ? { ...args, account } : args }, nextId++));
    if (value.isError) throw new SampleOrderError('Distru could not complete the requested action. Refresh to check the order before retrying.', 502);
    if (value.structuredContent != null) return value.structuredContent;
    const message = value.content?.find(entry => entry.type === 'text' && entry.text)?.text;
    return message ? JSON.parse(message) as unknown : null;
  }

  const identity = z.object({
    myCompany: z.object({ name: z.string(), legalBusinessName: z.string().nullish() }), usState: z.string(),
    user: z.object({ isAdmin: z.boolean(), permissions: z.array(z.string()).optional() }),
  }).parse(await tool('distru-get-me', { includePermissions: true }));
  if (!/^emcann\b/i.test(identity.myCompany.name) && !/^emcann\b/i.test(identity.myCompany.legalBusinessName ?? '')) {
    throw new SampleOrderError('The shared Distru credential is not connected to the EMCANN workspace.', 503);
  }
  if (identity.usState !== 'NY') throw new SampleOrderError('The shared Distru connection is outside the New York workspace.', 503);
  const canWrite = toolList.has('distru-mutate-sales-order') && (identity.user.isAdmin ||
    (identity.user.permissions ?? []).some(permission => /editproductprice/i.test(keyOf(permission))));
  return { tool, canWrite };
}

async function search<T>(client: Awaited<ReturnType<typeof connectDistru>>, toolName: string, args: Record<string, unknown>, schema: z.ZodType<T>) {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = z.object({
      items: z.array(schema), hasMore: z.boolean(), nextCursor: z.string().nullish(),
    }).parse(await client.tool(toolName, { ...args, limit: 100, ...(cursor ? { cursor } : {}) }));
    rows.push(...result.items);
    if (!result.hasMore) return rows;
    if (!result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }
  throw new SampleOrderError('Distru did not provide a complete result. The order was left untouched.', 502);
}

function normalizedAddress(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).map(word => ({
    street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd',
    drive: 'dr', place: 'pl', lane: 'ln', parkway: 'pkwy', suite: 'ste',
  }[word] ?? word)).join(' ');
}

function addressMatches(address: string, store: StoreIdentity) {
  const actual = ` ${normalizedAddress(address)} `;
  const street = normalizedAddress(store.address1);
  const unit = normalizedAddress(store.address2 ?? '');
  const zip = /^\d{5}/.exec(store.zipcode)?.[0];
  return Boolean(/^\d/.test(street) && zip && actual.startsWith(` ${street} `) &&
    actual.includes(` ${zip} `) && (!unit || actual.includes(` ${unit} `)));
}

type StoreIdentity = { name: string; address1: string; address2: string | null; zipcode: string };
const detailsArgs = { includeOrderItems: true, includeInvoices: true, includeOrderCharges: true, includeOrderItemPriceTiers: true };

function number(value: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw denied(502);
  return Number(value);
}

function normalizeOrder(raw: z.infer<typeof orderSchema>, recordOnly = false): SalesOrder {
  const status = raw.status.toLowerCase().trim();
  const url = /^https:\/\/app\.distru\.com\//.test(raw.url) ? raw.url : null;
  const rows = raw.orderItems.map(line => ({
    id: line.id, productId: line.product.id, quantity: number(line.quantity), price: number(line.price),
    sample: line.isSample,
    snapshot: JSON.stringify([line.product.id, number(line.quantity), number(line.price), number(line.priceBase),
      line.isSample, line.batch?.id, line.package?.id, line.location?.id, line.note, line.priceTierMode,
      line.priceTier ?? null]),
  }));
  return {
    id: raw.id, number: raw.orderNumber, status, date: raw.orderDate, updatedAt: raw.updatedDate, url,
    editable: status === 'pending' && !recordOnly && !raw.complianceManifestNumber &&
      !raw.combinedOrder && raw.invoices.length === 0 && rows.length > 0,
    locationId: raw.location?.id ?? null,
    rows,
    snapshot: JSON.stringify([raw.customer?.id, raw.shippingLocation?.id, raw.location?.id,
      raw.status, raw.invoices, raw.orderCharges, raw.complianceManifestNumber]),
  };
}

export function classifySampleProduct(product: z.infer<typeof productSchema>, available: number, policy: SamplePolicy): CatalogProduct {
  const labels = [product.name, product.category?.name, product.subcategory?.name, product.group?.name].filter(Boolean).join(' ');
  const rawBrand = product.brand?.name ?? '';
  // Some catalogs put the house brand on the record and the retail brand in
  // the first title segment. Prefer an exact catalog name or declared alias.
  const identifiers = [keyOf(rawBrand), keyOf(product.name.split('|')[0])];
  const configured = [...policy.preRollBrands, policy.gummyBrand, ...policy.exclusions];
  const brand = configured.find(name =>
    [name, ...(policy.brandAliases[name] ?? [])].some(alias => identifiers.includes(keyOf(alias)))) ?? rawBrand;
  const individual = /^(each|unit|units|pack|piece)$/i.test(product.unitType.name ?? '');
  const netWeight = product.unitNetWeight == null ? null : Number(product.unitNetWeight);
  const weightType = product.unitNetWeightAndServingSizeUnitType?.name ?? '';
  const oneGram = netWeight === 1 && /^(g|gram|grams)$/i.test(weightType);
  const labeledOneGram = /(?:^|[^.\d])1(?:\.0+)?\s*g\b/i.test(product.name);
  const multipack = /\b(?:[2-9]|\d{2,})[\s-]*(?:pack|pk)\b/i.test(product.name);
  let kind: CatalogProduct['kind'] = 'other';
  if (/\bdisplays?\b/i.test(labels)) kind = 'display';
  else if (brand === policy.gummyBrand && /gumm/i.test(labels) && !/uninfused/i.test(labels)) {
    const words = new Set<string>(labels.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const groups = policy.gummyGroups.filter(group => group.terms.some(term => words.has(term.toLowerCase())));
    if (groups.length === 1) kind = `gummy:${groups[0].label}`;
  } else if (/pre[\s-]?roll|hash hole/i.test(labels) && !multipack && (oneGram || (netWeight === null && labeledOneGram))) {
    kind = 'pre-roll';
  }
  return { id: product.id, sku: product.sku, name: product.name, brand, kind,
    strain: product.strain?.id ?? null, available: individual ? available : 0 };
}

async function stockAt(locationId: string) {
  const token = process.env.DISTRU_API_TOKEN?.trim();
  if (!token) throw new SampleOrderError('Distru warehouse availability has not been configured.', 503);
  const quantities = new Map<string, number>();
  let url: URL | null = new URL(restUrl);
  url.searchParams.append('groupings[]', 'PRODUCT');
  url.searchParams.append('groupings[]', 'LOCATION');
  url.searchParams.append('location_ids[]', locationId);
  for (let page = 0; url && page < 20; page++) {
    if (url.origin + url.pathname !== restUrl) throw denied(502);
    const response = await fetch(url, { cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!response.ok) throw new SampleOrderError('Distru warehouse stock could not be verified.', 502);
    const result = z.object({
      data: z.array(z.object({ product_id: z.string(), location_id: z.string(), available: z.string() })),
      next_page: z.string().nullable(),
    }).parse(await response.json());
    for (const row of result.data) if (row.location_id === locationId) quantities.set(row.product_id, number(row.available));
    url = result.next_page ? new URL(result.next_page, restUrl) : null;
  }
  if (url) throw denied(502);
  return quantities;
}

export async function openDistruSampleOrders(store: StoreIdentity, policy: SamplePolicy) {
  const client = await connectDistru();
  async function readRaw(id: string) {
    return z.object({ salesOrder: orderSchema }).parse(await client.tool('distru-get-sales-order', { id, ...detailsArgs })).salesOrder;
  }

  const candidates = await search(client, 'distru-search-sales-orders', { search: store.name }, headerSchema);
  const byId = new Map<string, z.infer<typeof orderSchema>>();
  const readOrders = async (headers: z.infer<typeof headerSchema>[]) => {
    const editableHistory = headers.filter(row => !['canceled', 'cancelled', 'merged'].includes(row.status.toLowerCase()));
    if (editableHistory.length > 100) throw new SampleOrderError('The store’s full order history could not be verified.');
    for (let index = 0; index < editableHistory.length; index += 5) {
      await Promise.all(editableHistory.slice(index, index + 5).map(async ({ id }) => {
        if (!byId.has(id)) byId.set(id, await readRaw(id));
      }));
    }
  };
  await readOrders(candidates);
  const customers = [...new Set([...byId.values()].flatMap(raw =>
    raw.customer && raw.shippingLocation && addressMatches(raw.shippingLocation.address, store) ? [raw.customer.id] : []))];
  if (customers.length !== 1) {
    return { history: [], catalog: [], canWrite: false as const, notice: customers.length
      ? 'Multiple Distru customers matched the store’s street address. No order was selected.'
      : 'No Distru order matched the store’s street address and ZIP code.' };
  }
  const headers = await search(client, 'distru-search-sales-orders', {
    customerIds: customers, sortBy: { field: 'ORDER_DATE', direction: 'DESC' },
  }, headerSchema);
  await readOrders(headers);
  const relevant = headers.flatMap(header => {
    const raw = byId.get(header.id);
    if (!raw) return [];
    if (!raw.shippingLocation) throw new SampleOrderError('A previous order has no verified shipping location. First-purchase eligibility is uncertain.');
    return addressMatches(raw.shippingLocation.address, store) ? [normalizeOrder(raw, header.recordOnly)] : [];
  });
  const matchedAddresses = new Set(relevant.map(order => normalizedAddress(byId.get(order.id)?.shippingLocation?.address ?? '')));
  if (matchedAddresses.size > 1) {
    return { history: [], catalog: [], canWrite: false as const, notice: 'Multiple Distru shipping addresses matched this store. No order was selected.' };
  }
  const catalogRows = await search(client, 'distru-search-products', { status: 'ACTIVE' }, productSchema);
  const catalog = new Map(catalogRows.map(product => [product.id, classifySampleProduct(product, 0, policy)]));
  const missing = [...new Set(relevant.flatMap(order => order.rows.map(row => row.productId)))].filter(id => !catalog.has(id));
  for (const id of missing) {
    const product = z.object({ product: productSchema.nullish() }).parse(await client.tool('distru-get-product', { id })).product;
    if (product) catalog.set(id, classifySampleProduct(product, 0, policy));
  }

  const order = relevant.filter(item => item.rows.some(row => !row.sample && row.price > policy.unitPriceCents / 100 &&
    row.quantity > 0 && catalog.get(row.productId)?.kind !== 'display')).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (order?.editable && order.locationId) {
    const source = z.object({ rows: z.array(z.object({ orderNumber: z.string() })), meta: z.object({ truncated: z.boolean() }) })
      .parse(await client.tool('distru-report-sales-orders', { rowsPer: 'ORDER', search: order.number, orderSources: ['LEAFLINK'] }));
    if (source.meta.truncated || source.rows.some(row => row.orderNumber === order.number)) order.editable = false;
    else {
      const stock = await stockAt(order.locationId);
      for (const product of catalogRows) catalog.set(product.id, classifySampleProduct(product, stock.get(product.id) ?? 0, policy));
    }
  }

  return {
    history: relevant, catalog: [...catalog.values()], canWrite: client.canWrite,
    async readOrder(id: string) { return normalizeOrder(await readRaw(id)); },
    async apply(order: SalesOrder, lines: SampleLine[]) {
      await client.tool('distru-mutate-sales-order', {
        action: 'UPDATE', id: order.id,
        orderItems: [
          ...order.rows.map(row => ({ id: row.id })),
          ...lines.map(line => ({
            productId: line.productId, quantity: line.quantity, priceBase: (policy.unitPriceCents / 100).toFixed(2),
            priceTierMode: 'NONE', isSample: true, locationId: order.locationId,
          })),
        ],
      });
    },
  };
}
