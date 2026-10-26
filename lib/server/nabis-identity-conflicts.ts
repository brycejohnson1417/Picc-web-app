import 'server-only';

import { createHash } from 'node:crypto';
import { NotificationCategory, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { sendTransactionalEmail, type TransactionalEmailResult } from '@/lib/server/transactional-email';

export type NabisIdentityReviewReason =
  | 'nabis_retailer_id_conflict'
  | 'license_conflict'
  | 'name_location_conflict'
  | 'page_owned_by_another_account';

export type NabisIdentityConflictStatus = 'OPEN' | 'RESOLVED';

export type NabisIdentityConflictEmail = {
  status: 'PENDING' | 'SENT' | 'FAILED' | 'UNAVAILABLE';
  providerMessageId?: string | null;
  error?: string | null;
  attemptedAt?: string | null;
};

export type NabisIdentityConflictMetadata = {
  schemaVersion: 1;
  kind: 'nabis_identity_conflict';
  conflictKey: string;
  status: NabisIdentityConflictStatus;
  occurrenceCount: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  incomingAccountId: string;
  incomingAccountName: string;
  candidatePageId: string;
  currentOwnerAccountId: string | null;
  currentOwnerAccountName: string | null;
  reason: NabisIdentityReviewReason;
  sourceIdentifiers: {
    licensedLocationId: string | null;
    nabisRetailerId: string | null;
    licenseNumber: string | null;
  };
  email: NabisIdentityConflictEmail;
  resolution?: {
    decision: 'KEEP_CURRENT_OWNER' | 'TRANSFER_TO_INCOMING';
    resolvedAt: string;
    resolvedByClerkUserId: string;
    resolvedByEmail: string | null;
  };
};

export type IdentityConflictNotification = {
  id: string;
  orgId: string;
  recipientKey: string;
  title: string;
  body: string;
  createdAt: string;
  metadata: NabisIdentityConflictMetadata;
};

export type NabisIdentityConflictInput = {
  orgId: string;
  recipientKey: string;
  incomingAccountId: string;
  incomingAccountName: string;
  candidatePageId: string;
  currentOwnerAccountId: string | null;
  currentOwnerAccountName: string | null;
  reason: NabisIdentityReviewReason;
  sourceIdentifiers: NabisIdentityConflictMetadata['sourceIdentifiers'];
};

type IdentityConflictNotificationDraft = Omit<IdentityConflictNotification, 'id'>;

type IdentityConflictRepository = {
  findOpenByKey: (conflictKey: string) => Promise<IdentityConflictNotification | null>;
  create: (notification: IdentityConflictNotificationDraft) => Promise<IdentityConflictNotification>;
  update: (id: string, notification: IdentityConflictNotificationDraft) => Promise<IdentityConflictNotification>;
  onOpened?: (notification: IdentityConflictNotification) => Promise<void>;
  now?: () => Date;
};

type ConflictEmailDependencies = {
  resolveRecipient: () => Promise<{ email: string; enabled: boolean }>;
  send: (message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }) => Promise<TransactionalEmailResult>;
  update: (notification: IdentityConflictNotification) => Promise<void>;
  now?: () => Date;
};

type PrismaNotificationRow = {
  id: string;
  orgId: string;
  userClerkId: string;
  title: string;
  body: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export function assessNabisIdentityLink(input: {
  reviewRequired: boolean;
  incomingAccountId: string;
  ownerAccountId: string | null;
}): 'LINK' | 'REVIEW' {
  if (input.reviewRequired) {
    return 'REVIEW';
  }

  if (input.ownerAccountId && input.ownerAccountId !== input.incomingAccountId) {
    return 'REVIEW';
  }

  return 'LINK';
}

function normalizedKeyPart(value: string) {
  return value.trim().toLowerCase().replaceAll('-', '');
}

export function createNabisIdentityConflictKey(input: {
  orgId: string;
  incomingAccountId: string;
  candidatePageId: string;
  reason: NabisIdentityReviewReason;
}) {
  const payload = [input.orgId, input.incomingAccountId, input.candidatePageId, input.reason]
    .map(normalizedKeyPart)
    .join(':');
  return `nabis-identity:${createHash('sha256').update(payload).digest('hex')}`;
}

export async function recordNabisIdentityConflict(input: NabisIdentityConflictInput, repository: IdentityConflictRepository) {
  const now = (repository.now ?? (() => new Date()))().toISOString();
  const conflictKey = createNabisIdentityConflictKey(input);
  const existing = await repository.findOpenByKey(conflictKey);

  if (existing) {
    const updated = await repository.update(existing.id, {
      ...existing,
      orgId: input.orgId,
      recipientKey: input.recipientKey,
      body: `Review ${input.incomingAccountName} and ${input.currentOwnerAccountName ?? 'the candidate CRM record'}.`,
      metadata: {
        ...existing.metadata,
        occurrenceCount: existing.metadata.occurrenceCount + 1,
        lastDetectedAt: now,
        incomingAccountName: input.incomingAccountName,
        currentOwnerAccountId: input.currentOwnerAccountId,
        currentOwnerAccountName: input.currentOwnerAccountName,
        sourceIdentifiers: input.sourceIdentifiers,
      },
    });
    return { notification: updated, created: false };
  }

  const notification = await repository.create({
    orgId: input.orgId,
    recipientKey: input.recipientKey,
    title: 'Nabis identity review required',
    body: `Review ${input.incomingAccountName} and ${input.currentOwnerAccountName ?? 'the candidate CRM record'}.`,
    createdAt: now,
    metadata: {
      schemaVersion: 1,
      kind: 'nabis_identity_conflict',
      conflictKey,
      status: 'OPEN',
      occurrenceCount: 1,
      firstDetectedAt: now,
      lastDetectedAt: now,
      incomingAccountId: input.incomingAccountId,
      incomingAccountName: input.incomingAccountName,
      candidatePageId: input.candidatePageId,
      currentOwnerAccountId: input.currentOwnerAccountId,
      currentOwnerAccountName: input.currentOwnerAccountName,
      reason: input.reason,
      sourceIdentifiers: input.sourceIdentifiers,
      email: { status: 'PENDING' },
    },
  });

  if (repository.onOpened) {
    try {
      await repository.onOpened(notification);
    } catch {
      // Opening a review item must not fail the sales sync when notification delivery fails.
    }
  }

  return { notification, created: true };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

export async function deliverNabisIdentityConflictEmail(
  notification: IdentityConflictNotification,
  dependencies: ConflictEmailDependencies,
) {
  const recipient = await dependencies.resolveRecipient();
  const attemptedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  if (!recipient.enabled) {
    await dependencies.update({
      ...notification,
      metadata: {
        ...notification.metadata,
        email: {
          status: 'UNAVAILABLE',
          providerMessageId: null,
          error: 'Email alerts are disabled.',
          attemptedAt,
        },
      },
    });
    return;
  }

  const settingsUrl = `${process.env.PICC_APP_BASE_URL?.trim() || 'https://piccnewyork.org'}/settings#nabis-identity-review`;
  const incomingName = notification.metadata.incomingAccountName;
  const currentName = notification.metadata.currentOwnerAccountName ?? 'an existing CRM record';
  const subject = `PICC identity review: ${incomingName}`;
  const text = [
    `${incomingName} needs identity review against ${currentName}.`,
    'Sales ingestion continued; no ambiguous ownership change was made.',
    `Review and resolve: ${settingsUrl}`,
  ].join('\n\n');
  const html = `<p><strong>${escapeHtml(incomingName)}</strong> needs identity review against ${escapeHtml(currentName)}.</p><p>Sales ingestion continued; no ambiguous ownership change was made.</p><p><a href="${escapeHtml(settingsUrl)}">Review and resolve in PICC Settings</a></p>`;
  const result = await dependencies.send({
    to: recipient.email,
    subject,
    text,
    html,
    idempotencyKey: `nabis-identity-review-${notification.id}`,
  });

  await dependencies.update({
    ...notification,
    metadata: {
      ...notification.metadata,
      email: {
        status: result.status,
        providerMessageId: result.providerMessageId,
        error: result.error,
        attemptedAt,
      },
    },
  });
}

export function parseNabisIdentityConflictMetadata(value: Prisma.JsonValue): NabisIdentityConflictMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const metadata = value as Record<string, unknown>;
  if (
    metadata.kind !== 'nabis_identity_conflict' ||
    typeof metadata.conflictKey !== 'string' ||
    (metadata.status !== 'OPEN' && metadata.status !== 'RESOLVED')
  ) {
    return null;
  }
  return metadata as NabisIdentityConflictMetadata;
}

function fromPrismaNotification(row: PrismaNotificationRow): IdentityConflictNotification | null {
  const metadata = parseNabisIdentityConflictMetadata(row.metadata);
  if (!metadata) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    recipientKey: row.userClerkId,
    title: row.title,
    body: row.body ?? '',
    createdAt: row.createdAt.toISOString(),
    metadata,
  };
}

export async function listNabisIdentityConflicts(orgId: string) {
  const rows = await prisma.notification.findMany({
    where: {
      orgId,
      title: 'Nabis identity review required',
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return rows.map(fromPrismaNotification).filter((row): row is IdentityConflictNotification => Boolean(row));
}

export async function resolveNabisIdentityConflictRecipient(orgId: string) {
  const preference = await prisma.notificationPreference.findFirst({
    where: {
      orgId,
      category: NotificationCategory.EXCEPTIONS,
    },
    orderBy: { updatedAt: 'desc' },
  });
  const email = preference?.email?.trim().toLowerCase() || process.env.PICC_ADMIN_EMAIL?.trim().toLowerCase() || 'bryce@piccplatform.com';
  const session = preference?.clerkUserId
    ? null
    : await prisma.appSessionAudit.findFirst({
        where: {
          orgId,
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
        orderBy: { lastSeenAt: 'desc' },
        select: { clerkUserId: true },
      });

  return {
    email,
    emailEnabled: preference?.emailEnabled ?? true,
    inAppEnabled: preference?.inAppEnabled ?? true,
    clerkUserId: preference?.clerkUserId ?? session?.clerkUserId ?? null,
    recipientKey: preference?.clerkUserId ?? session?.clerkUserId ?? `email:${email}`,
  };
}

async function updateConflictEmailState(notification: IdentityConflictNotification) {
  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      metadata: notification.metadata as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function persistNabisIdentityConflict(
  input: NabisIdentityConflictInput,
  options?: { onOpened?: (notification: IdentityConflictNotification) => Promise<void> },
) {
  const recipient = await resolveNabisIdentityConflictRecipient(input.orgId);
  const normalizedInput = {
    ...input,
    recipientKey: recipient.recipientKey,
  };
  return recordNabisIdentityConflict(normalizedInput, {
    findOpenByKey: async (conflictKey) => {
      const conflicts = await listNabisIdentityConflicts(normalizedInput.orgId);
      return conflicts.find((conflict) => conflict.metadata.status === 'OPEN' && conflict.metadata.conflictKey === conflictKey) ?? null;
    },
    create: async (notification) => {
      const row = await prisma.notification.create({
        data: {
          orgId: notification.orgId,
          userClerkId: notification.recipientKey,
          title: notification.title,
          body: notification.body,
          metadata: notification.metadata as unknown as Prisma.InputJsonValue,
        },
      });
      const mapped = fromPrismaNotification(row);
      if (!mapped) throw new Error('Created identity conflict could not be read back.');
      return mapped;
    },
    update: async (id, notification) => {
      const row = await prisma.notification.update({
        where: { id },
        data: {
          userClerkId: notification.recipientKey,
          title: notification.title,
          body: notification.body,
          metadata: notification.metadata as unknown as Prisma.InputJsonValue,
        },
      });
      const mapped = fromPrismaNotification(row);
      if (!mapped) throw new Error('Updated identity conflict could not be read back.');
      return mapped;
    },
    onOpened:
      options?.onOpened ??
      (async (notification) => {
        await deliverNabisIdentityConflictEmail(notification, {
          resolveRecipient: async () => ({ email: recipient.email, enabled: recipient.emailEnabled }),
          send: (message) => sendTransactionalEmail({ ...message, orgId: notification.orgId }),
          update: updateConflictEmailState,
        });
      }),
  });
}

export async function retryNabisIdentityConflictEmail(orgId: string, notificationId: string) {
  const notification = (await listNabisIdentityConflicts(orgId)).find((item) => item.id === notificationId);
  if (!notification || notification.metadata.status !== 'OPEN') {
    throw new Error('Open Nabis identity conflict not found.');
  }
  const recipient = await resolveNabisIdentityConflictRecipient(orgId);
  await deliverNabisIdentityConflictEmail(notification, {
    resolveRecipient: async () => ({ email: recipient.email, enabled: recipient.emailEnabled }),
    send: (message) => sendTransactionalEmail({ ...message, orgId: notification.orgId }),
    update: updateConflictEmailState,
  });
  return (await listNabisIdentityConflicts(orgId)).find((item) => item.id === notificationId) ?? notification;
}
