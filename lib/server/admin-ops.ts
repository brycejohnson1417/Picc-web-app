import 'server-only';

import { AccountIdentityType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { DEFAULT_PICC_POLICY_VALUES, ensureActivePolicySnapshot, type PiccPolicyValues } from '@/lib/server/policy-snapshots';
import { upsertAccountIdentityMapping } from '@/lib/server/account-identity';

type Actor = {
  userId?: string | null;
  email?: string | null;
};

export async function getAdminOpsData(orgId: string) {
  const [currentPolicy, policyHistory, overrides, accounts, auditEvents] = await Promise.all([
    ensureActivePolicySnapshot(orgId),
    prisma.policySnapshot.findMany({
      where: { orgId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    }),
    prisma.accountIdentityMapping.findMany({
      where: { orgId, isOverride: true },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            licensedLocationId: true,
            licenseNumber: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    }),
    prisma.account.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        licensedLocationId: true,
        licenseNumber: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.auditEvent.findMany({
      where: {
        orgId,
        OR: [
          { action: { startsWith: 'policy.' } },
          { action: { startsWith: 'account_identity.' } },
          { action: { startsWith: 'vendor_day.request.override_60_day_window' } },
          { action: { startsWith: 'vendor_day_archive.sync_failed' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    currentPolicy,
    policyHistory,
    identityOverrides: overrides,
    accounts,
    auditEvents,
  };
}

export async function createPolicySnapshot(input: {
  orgId: string;
  actor?: Actor;
  values: Partial<PiccPolicyValues>;
  reason?: string | null;
}) {
  const current = await ensureActivePolicySnapshot(input.orgId, {
    clerkUserId: input.actor?.userId ?? null,
    email: input.actor?.email ?? null,
  });
  const currentValues = current.values as Partial<PiccPolicyValues>;
  const nextValues: PiccPolicyValues = {
    ...DEFAULT_PICC_POLICY_VALUES,
    ...currentValues,
    ...input.values,
    priorityWeights: {
      ...DEFAULT_PICC_POLICY_VALUES.priorityWeights,
      ...(currentValues.priorityWeights ?? {}),
      ...(input.values.priorityWeights ?? {}),
    },
  };

  const snapshot = await prisma.policySnapshot.create({
    data: {
      orgId: input.orgId,
      name: `Policy snapshot ${new Date().toISOString()}`,
      values: nextValues as unknown as Prisma.InputJsonValue,
      effectiveFrom: new Date(),
      createdByClerkUserId: input.actor?.userId ?? null,
      createdByEmail: input.actor?.email ?? null,
      reason: input.reason?.trim() || 'Updated from admin policy controls.',
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'policy.snapshot.created',
    entityType: 'PolicySnapshot',
    entityId: snapshot.id,
    reason: input.reason?.trim() || null,
    metadata: nextValues as unknown as Record<string, unknown>,
  });

  return snapshot;
}

export async function saveAccountIdentityOverride(input: {
  orgId: string;
  actor?: Actor;
  accountId: string;
  identityType: AccountIdentityType;
  identityValue: string;
}) {
  const mapping = await upsertAccountIdentityMapping({
    orgId: input.orgId,
    accountId: input.accountId,
    identityType: input.identityType,
    identityValue: input.identityValue,
    source: 'ADMIN_OVERRIDE',
    isOverride: true,
    active: true,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'account_identity.override_saved',
    entityType: 'AccountIdentityMapping',
    entityId: mapping?.id ?? null,
    metadata: {
      accountId: input.accountId,
      identityType: input.identityType,
      identityValue: input.identityValue,
    },
  });

  return mapping;
}
