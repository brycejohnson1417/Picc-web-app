import { z } from 'zod';

export type SalesLine = {
  id: string;
  productId: string;
  name: string;
  sku?: string | null;
  family: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  lineValue: number;
  retainedLineValue: number;
  isSample: boolean;
  isPiccCatalogProduct: boolean;
};

export type SalesOrder = {
  id: string;
  number: string;
  date: string;
  deliveryDate?: string | null;
  deliveredDate?: string | null;
  status: string;
  total: number;
  returnValue: number;
  companyId: string | null;
  store: string;
  crmId: string | null;
  rep: string;
  included: boolean;
  hasCommercialLines: boolean;
  checks: string[];
  items: SalesLine[];
};

export type SalesReport = {
  generatedAt: string;
  timezone: string;
  currency: string;
  defaultPeriod: string;
  source: {
    name: string;
    workspace: string;
    scope: string;
    firstAvailableOrder: string;
    lastAvailableOrder: string;
    retrievedOrders: number;
    completePagination: boolean;
  };
  definitions: Record<string, string>;
  coverage: Record<string, string>;
  launchFamilies: string[];
  orders: SalesOrder[];
  accountSummary?: {
    accounts: number;
    customers: number;
    pppApproved: number;
    snapshotAt: string;
    source: string;
    pppStatuses: Record<string, number>;
    reps: Array<{ name: string; accounts: number; customers: number; pppApproved: number; pppStatuses: Record<string, number> }>;
  };
};

export type SalesFilters = { month: string; rep?: string; product?: string; status?: string; query?: string };

const COMMITTED_STATUSES = new Set(['PROCESSING', 'READY_TO_SHIP', 'DELIVERING', 'DELIVERED', 'COMPLETED']);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const dollars = (value: number) => value / 100;
const sumMoney = (values: number[]) => dollars(values.reduce((sum, value) => sum + cents(value), 0));

export function isCommercialOrder(order: SalesOrder) {
  return order.included && order.hasCommercialLines && COMMITTED_STATUSES.has(order.status) && Number.isFinite(order.total)
    && order.items.some(item => item.isPiccCatalogProduct && !item.isSample && item.quantity > 0 && item.unitPrice > 0);
}

export function buildSalesView(allOrders: SalesOrder[], filters: SalesFilters) {
  const scoped = allOrders.filter(order => order.date.startsWith(filters.month) && (!filters.rep || order.rep === filters.rep));
  const query = filters.query?.trim().toLowerCase();
  const orders = scoped.filter(order => isCommercialOrder(order)
    && (!filters.status || order.status === filters.status)
    && (!filters.product || order.items.some(item => !item.isSample && item.isPiccCatalogProduct && item.family === filters.product))
    && (!query || `${order.number} ${order.store} ${order.rep}`.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  const orderValue = sumMoney(orders.map(order => order.total));
  const dailyMap = new Map<string, { date: string; value: number; orders: number }>();
  const repMap = new Map<string, { name: string; value: number; orders: number; stores: Set<string>; returns: number }>();
  const productMap = new Map<string, { name: string; value: number; retainedValue: number; units: number; returnedUnits: number; stores: Set<string>; orders: Set<string> }>();
  for (const order of orders) {
    const day = dailyMap.get(order.date) ?? { date: order.date, value: 0, orders: 0 };
    day.value += cents(order.total); day.orders += 1; dailyMap.set(order.date, day);
    const rep = repMap.get(order.rep) ?? { name: order.rep, value: 0, orders: 0, stores: new Set<string>(), returns: 0 };
    rep.value += cents(order.total); rep.orders += 1; rep.returns += cents(order.returnValue);
    if (order.companyId) rep.stores.add(order.companyId);
    repMap.set(order.rep, rep);
    for (const item of order.items) {
      if (item.isSample || !item.isPiccCatalogProduct) continue;
      if (filters.product && item.family !== filters.product) continue;
      const product = productMap.get(item.family) ?? { name: item.family, value: 0, retainedValue: 0, units: 0, returnedUnits: 0, stores: new Set<string>(), orders: new Set<string>() };
      product.value += cents(item.lineValue); product.retainedValue += cents(item.retainedLineValue);
      product.units += item.quantity; product.returnedUnits += item.returnedQuantity;
      if (order.companyId) product.stores.add(order.companyId);
      product.orders.add(order.id); productMap.set(item.family, product);
    }
  }
  let cumulative = 0;
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => {
    cumulative += day.value;
    return { ...day, value: dollars(day.value), cumulative: dollars(cumulative) };
  });
  return {
    orders,
    excludedDrafts: scoped.filter(order => order.status === 'PENDING').length,
    excludedCanceled: scoped.filter(order => order.status === 'CANCELED').length,
    summary: {
      orderValue,
      orderCount: orders.length,
      buyingStores: new Set(orders.map(order => order.companyId).filter(Boolean)).size,
      averageOrderValue: orders.length ? dollars(Math.round(cents(orderValue) / orders.length)) : 0,
      returnValue: sumMoney(orders.map(order => order.returnValue)),
      deliveredValue: sumMoney(orders.filter(order => ['DELIVERED', 'COMPLETED'].includes(order.status)).map(order => order.total)),
      openValue: sumMoney(orders.filter(order => !['DELIVERED', 'COMPLETED'].includes(order.status)).map(order => order.total)),
      approvalFollowups: orders.filter(order => order.checks.includes('Buyer approval follow-up')).length,
    },
    daily,
    reps: [...repMap.values()].map(rep => ({ ...rep, value: dollars(rep.value), stores: rep.stores.size, returns: dollars(rep.returns) })).sort((a, b) => b.value - a.value),
    products: [...productMap.values()].map(product => ({ ...product, value: dollars(product.value), retainedValue: dollars(product.retainedValue), stores: product.stores.size, orders: product.orders.size })).sort((a, b) => b.retainedValue - a.retainedValue),
    statuses: [...new Set(scoped.filter(isCommercialOrder).map(order => order.status))].sort(),
  };
}

export function ordersToCsv(orders: SalesOrder[]) {
  const escape = (value: string | number) => {
    const text = typeof value === 'number' ? String(value) : /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows: (string | number)[][] = [['Order', 'Order date (New York)', 'Store', 'Current assigned rep', 'Status', 'Order value', 'Linked returns', 'Buyer follow-up']];
  for (const order of orders) rows.push([order.number, order.date, order.store, order.rep, order.status, order.total, order.returnValue, order.checks.join('; ')]);
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n');
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value);
});
const lineSchema = z.object({
  id: z.string().min(1), productId: z.string().min(1), name: z.string(), sku: z.string().nullable().optional(), family: z.string(),
  quantity: z.number().finite(), returnedQuantity: z.number().finite(), unitPrice: z.number().finite(),
  lineValue: z.number().finite(), retainedLineValue: z.number().finite(), isSample: z.boolean(), isPiccCatalogProduct: z.boolean(),
});
const orderSchema = z.object({
  id: z.string().min(1), number: z.string(), date: dateSchema, deliveryDate: dateSchema.nullable().optional(), deliveredDate: dateSchema.nullable().optional(),
  status: z.string(), total: z.number().finite(), returnValue: z.number().finite(), companyId: z.string().nullable(), store: z.string(),
  crmId: z.string().nullable(), rep: z.string(), included: z.boolean(), hasCommercialLines: z.boolean(), checks: z.array(z.string()), items: z.array(lineSchema),
});
const accountCountsSchema = z.object({ accounts: z.number().int().nonnegative(), customers: z.number().int().nonnegative(), pppApproved: z.number().int().nonnegative(), pppStatuses: z.record(z.number().int().nonnegative()) });
const reportSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }), timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; } }),
  currency: z.literal('USD'), defaultPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  source: z.object({ name: z.string(), workspace: z.string(), scope: z.string(), firstAvailableOrder: dateSchema, lastAvailableOrder: dateSchema, retrievedOrders: z.number().int().nonnegative(), completePagination: z.boolean() }),
  definitions: z.record(z.string()), coverage: z.record(z.string()), launchFamilies: z.array(z.string().min(1)).optional().default([]),
  orders: z.array(orderSchema).refine(orders => new Set(orders.map(order => order.id)).size === orders.length),
  accountSummary: accountCountsSchema.extend({ snapshotAt: z.string().datetime({ offset: true }), source: z.string(), reps: z.array(accountCountsSchema.extend({ name: z.string() })) }).optional(),
});

export function parseSalesReport(value: unknown): SalesReport {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) throw new Error('The sales report response is incomplete.');
  return parsed.data;
}

export function salesMonthLabel(month: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
}

export function salesStatusLabel(status: string) {
  return status.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
