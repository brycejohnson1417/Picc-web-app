import 'server-only';

import { prisma } from '@/lib/db/prisma';

const ORDER_STALE_AFTER_DAYS = 7;

export type NabisExceptionOrderLine = {
  productName: string;
  quantity: number | null;
  isSample: boolean;
};

export type NabisExceptionOrder = {
  id: string;
  orderNumber: string | null;
  externalOrderId?: string | null;
  orderCreatedDate: string | null;
  status?: string | null;
  salesRep?: string | null;
  poSoNumber?: string | null;
  orderTotal?: number | null;
  deliveryDate?: string | null;
  lines?: NabisExceptionOrderLine[];
};

export type NabisExceptionRetailer = {
  id?: string;
  accountId?: string | null;
  accountName: string;
  licensedLocationId: string | null;
  licenseNumber: string | null;
  nabisRetailerId: string | null;
  address?: string | null;
  lastOrderAt?: string | null;
  orderCount?: number;
  recentOrders?: NabisExceptionOrder[];
};

export type NabisExceptionSampleLine = {
  sku: string;
  productName: string;
  quantity: number;
  reason: string;
  notes?: string | null;
};

export type NabisExceptionPreviewInput = {
  retailer: NabisExceptionRetailer;
  order: NabisExceptionOrder;
  sampleLines: NabisExceptionSampleLine[];
  discrepancyNotes: string[];
  requestedBy: string;
};

export type NabisExceptionPreview = {
  subject: string;
  message: string;
  summary: {
    requestType: 'sample_addition' | 'order_correction' | 'sample_addition_and_order_correction';
    sampleLineCount: number;
    discrepancyCount: number;
    existingOrderLineCount: number;
  };
  payload: {
    retailer: NabisExceptionRetailer;
    selectedOrder: NabisExceptionOrder;
    sampleLines: NabisExceptionSampleLine[];
    discrepancyNotes: string[];
    requestedBy: string;
    generatedAt: string;
  };
};

export function selectMostRecentOrder<T extends { orderCreatedDate: string | null }>(orders: T[]) {
  return (
    orders
      .filter((order) => {
        if (!order.orderCreatedDate) return false;
        return !Number.isNaN(new Date(order.orderCreatedDate).getTime());
      })
      .sort((left, right) => new Date(right.orderCreatedDate!).getTime() - new Date(left.orderCreatedDate!).getTime())[0] ?? orders[0] ?? null
  );
}

export function buildNabisExceptionPreview(input: NabisExceptionPreviewInput): NabisExceptionPreview {
  const sampleLines = input.sampleLines.map((line) => ({
    sku: line.sku.trim(),
    productName: line.productName.trim(),
    quantity: Math.max(1, Math.trunc(line.quantity)),
    reason: line.reason.trim(),
    notes: line.notes?.trim() || null,
  }));
  const discrepancyNotes = input.discrepancyNotes.map((note) => note.trim()).filter(Boolean);
  const hasSamples = sampleLines.length > 0;
  const hasDiscrepancies = discrepancyNotes.length > 0;
  const requestType = hasSamples && hasDiscrepancies ? 'sample_addition_and_order_correction' : hasSamples ? 'sample_addition' : 'order_correction';
  const orderLabel = input.order.orderNumber || input.order.externalOrderId || input.order.id;

  const lines = [
    `Retailer: ${input.retailer.accountName}`,
    `License: ${input.retailer.licenseNumber || input.retailer.licensedLocationId || 'Not recorded'}`,
    `Nabis retailer ID: ${input.retailer.nabisRetailerId || 'Not recorded'}`,
    `Order: ${orderLabel}`,
    `Order date: ${formatDate(input.order.orderCreatedDate)}`,
    `Order status: ${input.order.status || 'Not recorded'}`,
    input.order.salesRep ? `Sales rep: ${input.order.salesRep}` : null,
    input.order.poSoNumber ? `PO/SO: ${input.order.poSoNumber}` : null,
    '',
    'Requested action:',
    hasSamples ? '- Add the sample SKU lines below to the selected Nabis order or shipment.' : null,
    hasDiscrepancies ? '- Review and correct the discrepancy notes below against the selected Nabis order.' : null,
    '',
    sampleLines.length ? 'Sample additions:' : null,
    ...sampleLines.map((line) => `- ${line.sku} | ${line.productName} | qty ${line.quantity} | ${line.reason}${line.notes ? ` | ${line.notes}` : ''}`),
    sampleLines.length ? '' : null,
    discrepancyNotes.length ? 'Discrepancy / correction notes:' : null,
    ...discrepancyNotes.map((note) => `- ${note}`),
    discrepancyNotes.length ? '' : null,
    input.order.lines?.length ? 'Existing cached order line context:' : null,
    ...(input.order.lines ?? []).slice(0, 12).map((line) => `- ${line.productName}${line.quantity == null ? '' : ` | qty ${line.quantity}`}${line.isSample ? ' | sample' : ''}`),
    '',
    `Requested by: ${input.requestedBy}`,
  ].filter((line): line is string => line !== null);

  return {
    subject: `Nabis exception request for ${input.retailer.accountName} order ${orderLabel}`,
    message: lines.join('\n'),
    summary: {
      requestType,
      sampleLineCount: sampleLines.length,
      discrepancyCount: discrepancyNotes.length,
      existingOrderLineCount: input.order.lines?.length ?? 0,
    },
    payload: {
      retailer: input.retailer,
      selectedOrder: input.order,
      sampleLines,
      discrepancyNotes,
      requestedBy: input.requestedBy,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function hasStaleRecentOrder(latestOrderAt: string | null | undefined, now = new Date()) {
  if (!latestOrderAt) return true;
  const latest = new Date(latestOrderAt);
  if (Number.isNaN(latest.getTime())) return true;
  return now.getTime() - latest.getTime() > ORDER_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export async function getNabisExceptionWorkspace(orgId: string, query = '') {
  const trimmedQuery = query.trim();
  const where =
    trimmedQuery.length > 0
      ? {
          orgId,
          OR: [
            { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { doingBusinessAs: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { licensedLocationId: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { licenseNumber: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { externalRetailerId: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { account: { name: { contains: trimmedQuery, mode: 'insensitive' as const } } },
          ],
        }
      : { orgId };

  const retailers = await prisma.nabisRetailer.findMany({
    where,
    orderBy: [{ lastOrderAt: 'desc' }, { updatedAt: 'desc' }],
    take: 18,
    select: {
      id: true,
      accountId: true,
      licensedLocationId: true,
      externalRetailerId: true,
      licenseNumber: true,
      name: true,
      doingBusinessAs: true,
      address1: true,
      city: true,
      state: true,
      zipcode: true,
      orderCount: true,
      lastOrderAt: true,
      account: {
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          nabisRetailerId: true,
          licensedLocationId: true,
        },
      },
    },
  });

  const retailerSummaries = await Promise.all(
    retailers.map(async (retailer) => {
      const recentOrders = await prisma.nabisOrder.findMany({
        where: {
          orgId,
          OR: [
            retailer.accountId ? { accountId: retailer.accountId } : {},
            retailer.licensedLocationId ? { licensedLocationId: retailer.licensedLocationId } : {},
            retailer.externalRetailerId ? { nabisRetailerId: retailer.externalRetailerId } : {},
          ].filter((clause) => Object.keys(clause).length > 0),
        },
        orderBy: [{ orderCreatedDate: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          externalOrderId: true,
          orderNumber: true,
          orderCreatedDate: true,
          status: true,
          orderTotal: true,
          deliveryDate: true,
          salesRep: true,
          poSoNumber: true,
          lines: {
            orderBy: { createdAt: 'asc' },
            take: 12,
            select: {
              productName: true,
              quantity: true,
              isSample: true,
            },
          },
        },
      });

      return {
        id: retailer.id,
        accountId: retailer.accountId,
        accountName: retailer.account?.name || retailer.doingBusinessAs || retailer.name,
        licensedLocationId: retailer.licensedLocationId || retailer.account?.licensedLocationId || null,
        licenseNumber: retailer.licenseNumber || retailer.account?.licenseNumber || retailer.licensedLocationId || null,
        nabisRetailerId: retailer.externalRetailerId || retailer.account?.nabisRetailerId || null,
        address: [retailer.address1, retailer.city, retailer.state, retailer.zipcode].filter(Boolean).join(', ') || null,
        lastOrderAt: isoOrNull(retailer.lastOrderAt),
        orderCount: retailer.orderCount,
        recentOrders: recentOrders.map(serializeOrder),
      } satisfies NabisExceptionRetailer;
    }),
  );

  const retailerAccountIds = retailerSummaries.flatMap((retailer) => (retailer.accountId ? [retailer.accountId] : []));
  const accountWhere =
    trimmedQuery.length > 0
      ? {
          orgId,
          id: {
            notIn: retailerAccountIds,
          },
          nabisOrders: { some: {} },
          OR: [
            { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { licensedLocationId: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { licenseNumber: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { nabisRetailerId: { contains: trimmedQuery, mode: 'insensitive' as const } },
          ],
        }
      : {
          orgId,
          id: {
            notIn: retailerAccountIds,
          },
          nabisOrders: { some: {} },
        };

  const accountRetailers = await prisma.account.findMany({
    where: accountWhere,
    orderBy: { updatedAt: 'desc' },
    take: Math.max(0, 18 - retailerSummaries.length),
    select: {
      id: true,
      name: true,
      licensedLocationId: true,
      nabisRetailerId: true,
      licenseNumber: true,
      address1: true,
      city: true,
      state: true,
      zipcode: true,
      nabisOrders: {
        orderBy: [{ orderCreatedDate: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          externalOrderId: true,
          orderNumber: true,
          orderCreatedDate: true,
          status: true,
          orderTotal: true,
          deliveryDate: true,
          salesRep: true,
          poSoNumber: true,
          lines: {
            orderBy: { createdAt: 'asc' },
            take: 12,
            select: {
              productName: true,
              quantity: true,
              isSample: true,
            },
          },
        },
      },
    },
  });

  const accountSummaries = accountRetailers.map((account) => serializeAccountRetailer(account));

  const latestOrder = await prisma.nabisOrder.findFirst({
    where: { orgId, orderCreatedDate: { not: null } },
    orderBy: { orderCreatedDate: 'desc' },
    select: { orderCreatedDate: true },
  });

  return {
    retailers: [...retailerSummaries, ...accountSummaries],
    meta: {
      query: trimmedQuery,
      retailerCount: retailerSummaries.length + accountSummaries.length,
      latestOrderCreatedAt: isoOrNull(latestOrder?.orderCreatedDate),
      stale: hasStaleRecentOrder(isoOrNull(latestOrder?.orderCreatedDate)),
      staleAfterDays: ORDER_STALE_AFTER_DAYS,
    },
  };
}

export async function getNabisExceptionPreviewContext(orgId: string, retailerId: string, orderId: string) {
  if (retailerId.startsWith('account:')) {
    const accountId = retailerId.replace(/^account:/, '');
    const account = await prisma.account.findFirst({
      where: { orgId, id: accountId },
      select: {
        id: true,
        name: true,
        licensedLocationId: true,
        nabisRetailerId: true,
        licenseNumber: true,
        address1: true,
        city: true,
        state: true,
        zipcode: true,
        nabisOrders: {
          where: { id: orderId },
          take: 1,
          select: {
            id: true,
            externalOrderId: true,
            orderNumber: true,
            orderCreatedDate: true,
            status: true,
            orderTotal: true,
            deliveryDate: true,
            salesRep: true,
            poSoNumber: true,
            lines: {
              orderBy: { createdAt: 'asc' },
              take: 24,
              select: {
                productName: true,
                quantity: true,
                isSample: true,
              },
            },
          },
        },
      },
    });

    const order = account?.nabisOrders[0] ?? null;
    if (!account || !order) return null;

    return {
      retailer: serializeAccountRetailer({ ...account, nabisOrders: [order] }),
      order: serializeOrder(order),
    };
  }

  const retailer = await prisma.nabisRetailer.findFirst({
    where: { orgId, id: retailerId },
    select: {
      id: true,
      accountId: true,
      licensedLocationId: true,
      externalRetailerId: true,
      licenseNumber: true,
      name: true,
      doingBusinessAs: true,
      address1: true,
      city: true,
      state: true,
      zipcode: true,
      orderCount: true,
      lastOrderAt: true,
      account: {
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          nabisRetailerId: true,
          licensedLocationId: true,
        },
      },
    },
  });

  if (!retailer) {
    return null;
  }

  const order = await prisma.nabisOrder.findFirst({
    where: {
      orgId,
      id: orderId,
      OR: [
        retailer.accountId ? { accountId: retailer.accountId } : {},
        retailer.licensedLocationId ? { licensedLocationId: retailer.licensedLocationId } : {},
        retailer.externalRetailerId ? { nabisRetailerId: retailer.externalRetailerId } : {},
      ].filter((clause) => Object.keys(clause).length > 0),
    },
    select: {
      id: true,
      externalOrderId: true,
      orderNumber: true,
      orderCreatedDate: true,
      status: true,
      orderTotal: true,
      deliveryDate: true,
      salesRep: true,
      poSoNumber: true,
      lines: {
        orderBy: { createdAt: 'asc' },
        take: 24,
        select: {
          productName: true,
          quantity: true,
          isSample: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  return {
    retailer: serializeRetailer(retailer, []),
    order: serializeOrder(order),
  };
}

function serializeOrder(order: {
  id: string;
  externalOrderId: string;
  orderNumber: string | null;
  orderCreatedDate: Date | null;
  status: string | null;
  orderTotal: unknown;
  deliveryDate: Date | null;
  salesRep: string | null;
  poSoNumber: string | null;
  lines: Array<{
    productName: string;
    quantity: unknown;
    isSample: boolean;
  }>;
}): NabisExceptionOrder {
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    orderNumber: order.orderNumber,
    orderCreatedDate: isoOrNull(order.orderCreatedDate),
    status: order.status,
    orderTotal: decimalToNumber(order.orderTotal),
    deliveryDate: isoOrNull(order.deliveryDate),
    salesRep: order.salesRep,
    poSoNumber: order.poSoNumber,
    lines: order.lines.map((line) => ({
      productName: line.productName,
      quantity: decimalToNumber(line.quantity),
      isSample: line.isSample,
    })),
  };
}

function serializeRetailer(
  retailer: {
    id: string;
    accountId: string | null;
    licensedLocationId: string;
    externalRetailerId: string | null;
    licenseNumber: string | null;
    name: string;
    doingBusinessAs: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    zipcode: string | null;
    orderCount: number;
    lastOrderAt: Date | null;
    account: {
      id: string;
      name: string;
      licenseNumber: string;
      nabisRetailerId: string | null;
      licensedLocationId: string | null;
    } | null;
  },
  recentOrders: NabisExceptionOrder[],
): NabisExceptionRetailer {
  return {
    id: retailer.id,
    accountId: retailer.accountId,
    accountName: retailer.account?.name || retailer.doingBusinessAs || retailer.name,
    licensedLocationId: retailer.licensedLocationId || retailer.account?.licensedLocationId || null,
    licenseNumber: retailer.licenseNumber || retailer.account?.licenseNumber || retailer.licensedLocationId || null,
    nabisRetailerId: retailer.externalRetailerId || retailer.account?.nabisRetailerId || null,
    address: [retailer.address1, retailer.city, retailer.state, retailer.zipcode].filter(Boolean).join(', ') || null,
    lastOrderAt: isoOrNull(retailer.lastOrderAt),
    orderCount: retailer.orderCount,
    recentOrders,
  };
}

function serializeAccountRetailer(account: {
  id: string;
  name: string;
  licensedLocationId: string | null;
  nabisRetailerId: string | null;
  licenseNumber: string;
  address1: string;
  city: string;
  state: string;
  zipcode: string;
  nabisOrders: Array<{
    id: string;
    externalOrderId: string;
    orderNumber: string | null;
    orderCreatedDate: Date | null;
    status: string | null;
    orderTotal: unknown;
    deliveryDate: Date | null;
    salesRep: string | null;
    poSoNumber: string | null;
    lines: Array<{
      productName: string;
      quantity: unknown;
      isSample: boolean;
    }>;
  }>;
}): NabisExceptionRetailer {
  const recentOrders = account.nabisOrders.map(serializeOrder);
  const selected = selectMostRecentOrder(recentOrders);
  return {
    id: `account:${account.id}`,
    accountId: account.id,
    accountName: account.name,
    licensedLocationId: account.licensedLocationId,
    licenseNumber: account.licenseNumber || account.licensedLocationId,
    nabisRetailerId: account.nabisRetailerId,
    address: [account.address1, account.city, account.state, account.zipcode].filter(Boolean).join(', ') || null,
    lastOrderAt: selected?.orderCreatedDate ?? null,
    orderCount: recentOrders.length,
    recentOrders,
  };
}

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function decimalToNumber(value: unknown) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
