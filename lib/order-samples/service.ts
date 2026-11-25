import 'server-only';

import { createHash } from 'node:crypto';
import { ActivityType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { openDistruSampleOrders, SampleOrderError } from './distru';
import { planSamples, type SalesOrder, type SampleLine } from './plan';
import { firstOrderSamplePolicy as policy } from './policy';

type Actor = { orgId: string; userId: string };
const activityTitle = 'First-order sample update';

function version(order: SalesOrder) {
  return [order.id, order.updatedAt, order.snapshot, order.rows.map(row => [row.id, row.snapshot]).sort()];
}

function verifySaved(before: SalesOrder, after: SalesOrder, additions: SampleLine[], samplePrice: number) {
  if (before.id !== after.id || before.snapshot !== after.snapshot) return false;
  const byId = new Map(after.rows.map(row => [row.id, row]));
  if (before.rows.some(row => byId.get(row.id)?.snapshot !== row.snapshot)) return false;
  const previousIds = new Set(before.rows.map(row => row.id));
  const newRows = after.rows.filter(row => !previousIds.has(row.id));
  const totals = new Map<string, number>();
  for (const row of newRows) {
    if (!row.sample || row.price !== samplePrice || !Number.isSafeInteger(row.quantity) || row.quantity <= 0) return false;
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + row.quantity);
  }
  return totals.size === additions.length && additions.every(row => totals.get(row.productId) === row.quantity);
}

async function loadAccount(accountIdOrPageId: string, { orgId }: Actor, samplePrice: number) {
  const identity = await resolveAccountIdentity(accountIdOrPageId, orgId);
  const account = identity?.accountId ? await prisma.account.findFirst({
    where: { orgId, id: identity.accountId },
    select: { id: true, name: true, address1: true, address2: true, zipcode: true, licensedLocationId: true, nabisRetailerId: true },
  }) : null;
  if (!account) throw new SampleOrderError('This territory store needs a linked PICC account before Distru can be checked.', 404);
  const otherSale = await prisma.nabisOrder.findFirst({
    where: {
      orgId, isInternalTransfer: false, orderTotal: { gt: samplePrice },
      AND: [
        { OR: [
          { accountId: account.id },
          ...(account.licensedLocationId ? [{ licensedLocationId: account.licensedLocationId }] : []),
          ...(account.nabisRetailerId ? [{ nabisRetailerId: account.nabisRetailerId }] : []),
        ] },
        { NOT: ['canceled', 'cancelled', 'draft', 'void'].map(status => ({ status: { equals: status, mode: 'insensitive' as const } })) },
      ],
    },
    select: { id: true },
  });
  return { account, previousPurchase: Boolean(otherSale) };
}

async function prepare(accountId: string, actor: Actor) {
  const { account, previousPurchase } = await loadAccount(accountId, actor, policy.unitPriceCents / 100);
  const vendors = await openDistruSampleOrders(account, policy);
  const plan = planSamples(vendors.history, vendors.catalog, previousPurchase, policy);
  if ('notice' in vendors) return { account, plan: { ...plan, reason: vendors.notice }, vendors, order: null };
  const order = vendors.history.find(item => item.number === plan.order?.number);
  if (!order || !plan.lines.length) return { account, plan, vendors, order: null };
  if (!vendors.canWrite) return { account, vendors, order: null,
    plan: { ...plan, reason: 'The shared Distru connection can preview this order. Saving requires order and price edit access.' } };

  const digest = createHash('sha256').update(JSON.stringify([
    actor.orgId, actor.userId, account.id, plan.unitPriceCents, vendors.history.map(version).sort(),
    plan.lines.map(line => [line.productId, line.quantity]),
  ])).digest('hex');
  return { account, vendors, order, plan: { ...plan, fingerprint: digest } };
}

export async function previewSamples(accountId: string, actor: Actor) {
  const { plan } = await prepare(accountId, actor);
  return plan;
}

export async function applySamples(accountId: string, actor: Actor, fingerprint: string, selectedIds: string[]) {
  const { account, vendors, order, plan } = await prepare(accountId, actor);
  if (!order || !('apply' in vendors) || !vendors.apply || !vendors.readOrder || plan.fingerprint !== fingerprint) {
    throw new SampleOrderError('The order or its availability changed. Refresh the review before saving.');
  }
  const selection = new Set(selectedIds);
  const lines = plan.lines.filter(line => selection.has(line.productId));
  if (!lines.length || lines.length !== selection.size) throw new SampleOrderError('Select at least one line from the current review.', 400);

  const metadata = { feature: 'first-order-samples', orderId: order.id, orderNumber: order.number,
    additions: lines.map(line => ({ sku: line.sku, productId: line.productId, quantity: line.quantity, unitPrice: (plan.unitPriceCents / 100).toFixed(2), sample: true })) };
  const attempt = await prisma.$transaction(async tx => {
    const lockKey = `first-order-samples:${order.id}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
    const inFlight = await tx.activityLog.findFirst({
      where: {
        orgId: actor.orgId, title: activityTitle,
        AND: [
          { metadata: { path: ['state'], equals: 'unverified' } },
          { metadata: { path: ['orderId'], equals: order.id } },
        ],
      },
      select: { id: true },
    });
    if (inFlight) throw new SampleOrderError('An earlier Distru update is unverified. Check the order in Distru before making another update.');

    // Recheck the target after serializing PICC requests. Distru does not offer
    // a conditional write, so direct edits in Distru can still overlap.
    const fresh = await vendors.readOrder!(order.id);
    if (!fresh.editable || JSON.stringify(version(fresh)) !== JSON.stringify(version(order))) {
      throw new SampleOrderError('The Distru order changed. Refresh the review before saving.');
    }
    return tx.activityLog.create({
      data: { orgId: actor.orgId, accountId: account.id, actorClerkUserId: actor.userId,
        type: ActivityType.ACCOUNT_UPDATED, title: activityTitle, metadata: { ...metadata, state: 'unverified' } },
      select: { id: true },
    });
  }, { timeout: 15000 });

  try {
    await vendors.apply(order, lines);
  } catch {
    // Read back even after a timeout. Never blindly repeat a vendor mutation.
  }
  let verified = false;
  try {
    verified = verifySaved(order, await vendors.readOrder(order.id), lines, plan.unitPriceCents / 100);
  } catch {
    // The durable attempt remains unverified until it can be reconciled.
  }
  if (!verified) throw new SampleOrderError('Distru’s save could not be verified. Open the order in Distru before taking further action.', 502);
  await prisma.activityLog.update({
    where: { id: attempt.id }, data: { metadata: { ...metadata, state: 'verified' } },
  }).catch(() => undefined);
  return { order: plan.order, added: lines.reduce((sum, line) => sum + line.quantity, 0) };
}
