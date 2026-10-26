import 'server-only';

import { AccountIdentityType, NotificationCategory, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { normalizeIdentityValue } from '@/lib/server/account-identity';
import {
  listNabisIdentityConflicts,
  resolveNabisIdentityConflictRecipient,
  retryNabisIdentityConflictEmail,
  type NabisIdentityConflictMetadata,
} from '@/lib/server/nabis-identity-conflicts';
import { transactionalEmailReady } from '@/lib/server/transactional-email';

export type NabisIdentityResolutionDecision = 'KEEP_CURRENT_OWNER' | 'TRANSFER_TO_INCOMING';

type ResolutionConflict = Pick<
  NabisIdentityConflictMetadata,
  'incomingAccountId' | 'currentOwnerAccountId' | 'candidatePageId' | 'sourceIdentifiers'
>;

export function buildNabisIdentityResolutionActions(
  conflict: ResolutionConflict,
  decision: NabisIdentityResolutionDecision,
) {
  if (decision === 'KEEP_CURRENT_OWNER' && !conflict.currentOwnerAccountId) {
    throw new Error('No current owner is available to keep.');
  }
  const targetAccountId = decision === 'KEEP_CURRENT_OWNER' ? conflict.currentOwnerAccountId! : conflict.incomingAccountId;
  return {
    targetAccountId,
    clearOwnerAccountId:
      decision === 'TRANSFER_TO_INCOMING' && conflict.currentOwnerAccountId !== conflict.incomingAccountId
        ? conflict.currentOwnerAccountId
        : null,
    linkCandidatePageToTarget: decision === 'TRANSFER_TO_INCOMING',
    identifiers: [
      [AccountIdentityType.NOTION_PAGE_ID, conflict.candidatePageId],
      [AccountIdentityType.LICENSED_LOCATION_ID, conflict.sourceIdentifiers.licensedLocationId],
      [AccountIdentityType.NABIS_RETAILER_ID, conflict.sourceIdentifiers.nabisRetailerId],
      [AccountIdentityType.LICENSE_NUMBER, conflict.sourceIdentifiers.licenseNumber],
    ].filter((item): item is [AccountIdentityType, string] => Boolean(item[1])),
  };
}

export async function getNabisIdentityReviewSettings(orgId: string) {
  const [conflicts, recipient] = await Promise.all([
    listNabisIdentityConflicts(orgId),
    resolveNabisIdentityConflictRecipient(orgId),
  ]);
  return {
    conflicts,
    preference: {
      email: recipient.email,
      emailEnabled: recipient.emailEnabled,
      inAppEnabled: recipient.inAppEnabled,
    },
    emailProviderReady: await transactionalEmailReady(orgId),
  };
}

export async function saveNabisIdentityReviewPreference(input: {
  orgId: string;
  clerkUserId: string;
  email: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}) {
  return prisma.notificationPreference.upsert({
    where: {
      orgId_clerkUserId_category: {
        orgId: input.orgId,
        clerkUserId: input.clerkUserId,
        category: NotificationCategory.EXCEPTIONS,
      },
    },
    update: {
      email: input.email.trim().toLowerCase(),
      emailEnabled: input.emailEnabled,
      inAppEnabled: input.inAppEnabled,
    },
    create: {
      orgId: input.orgId,
      clerkUserId: input.clerkUserId,
      category: NotificationCategory.EXCEPTIONS,
      email: input.email.trim().toLowerCase(),
      emailEnabled: input.emailEnabled,
      inAppEnabled: input.inAppEnabled,
    },
  });
}

export async function resolveNabisIdentityConflict(input: {
  orgId: string;
  notificationId: string;
  decision: NabisIdentityResolutionDecision;
  actor: { clerkUserId: string; email: string | null };
}) {
  const conflict = (await listNabisIdentityConflicts(input.orgId)).find((item) => item.id === input.notificationId);
  if (!conflict || conflict.metadata.status !== 'OPEN') {
    throw new Error('Open Nabis identity conflict not found.');
  }

  const liveOwner = await prisma.account.findFirst({
    where: { orgId: input.orgId, notionPageId: conflict.metadata.candidatePageId },
    select: { id: true },
  });
  const actions = buildNabisIdentityResolutionActions(
    { ...conflict.metadata, currentOwnerAccountId: liveOwner?.id ?? conflict.metadata.currentOwnerAccountId },
    input.decision,
  );
  const resolvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const target = await tx.account.findFirst({ where: { id: actions.targetAccountId, orgId: input.orgId }, select: { id: true } });
    if (!target) throw new Error('Selected account no longer exists.');

    if (actions.clearOwnerAccountId) {
      await tx.account.updateMany({
        where: { id: actions.clearOwnerAccountId, orgId: input.orgId, notionPageId: conflict.metadata.candidatePageId },
        data: { notionPageId: null },
      });
    }
    if (actions.linkCandidatePageToTarget) {
      await tx.account.update({ where: { id: actions.targetAccountId }, data: { notionPageId: conflict.metadata.candidatePageId } });
    }
    for (const [identityType, identityValue] of actions.identifiers) {
      await tx.accountIdentityMapping.upsert({
        where: {
          orgId_identityType_normalizedValue: {
            orgId: input.orgId,
            identityType,
            normalizedValue: normalizeIdentityValue(identityType, identityValue),
          },
        },
        update: {
          accountId: actions.targetAccountId,
          identityValue,
          source: 'NABIS_IDENTITY_REVIEW',
          isOverride: true,
          active: true,
          createdByClerkUserId: input.actor.clerkUserId,
          createdByEmail: input.actor.email,
        },
        create: {
          orgId: input.orgId,
          accountId: actions.targetAccountId,
          identityType,
          identityValue,
          normalizedValue: normalizeIdentityValue(identityType, identityValue),
          source: 'NABIS_IDENTITY_REVIEW',
          isOverride: true,
          active: true,
          createdByClerkUserId: input.actor.clerkUserId,
          createdByEmail: input.actor.email,
        },
      });
    }

    const metadata: NabisIdentityConflictMetadata = {
      ...conflict.metadata,
      status: 'RESOLVED',
      resolution: {
        decision: input.decision,
        resolvedAt: resolvedAt.toISOString(),
        resolvedByClerkUserId: input.actor.clerkUserId,
        resolvedByEmail: input.actor.email,
      },
    };
    await tx.notification.update({
      where: { id: input.notificationId },
      data: { readAt: resolvedAt, metadata: metadata as unknown as Prisma.InputJsonValue },
    });
    await tx.auditEvent.create({
      data: {
        orgId: input.orgId,
        actorClerkUserId: input.actor.clerkUserId,
        actorEmail: input.actor.email,
        action: 'nabis_identity_conflict_resolved',
        entityType: 'notification',
        entityId: input.notificationId,
        metadata: {
          decision: input.decision,
          targetAccountId: actions.targetAccountId,
          conflictKey: conflict.metadata.conflictKey,
        },
      },
    });
  });

  return { id: input.notificationId, status: 'RESOLVED' as const };
}

export { retryNabisIdentityConflictEmail };
