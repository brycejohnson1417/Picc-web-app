import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export interface AppendAuditEventInput {
  orgId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorClerkUserId?: string | null;
  actorEmail?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function appendAuditEvent(input: AppendAuditEventInput) {
  return prisma.auditEvent.create({
    data: {
      orgId: input.orgId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      actorClerkUserId: input.actorClerkUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      reason: input.reason ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
