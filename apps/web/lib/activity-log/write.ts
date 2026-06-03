import { ActivityType, Channel, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export interface ActivityPayload {
  orgId: string;
  accountId: string;
  actorClerkUserId: string;
  type: ActivityType;
  title: string;
  description?: string;
  channel?: Channel;
  metadata?: Record<string, unknown>;
  contactId?: string;
  opportunityId?: string;
  taskId?: string;
  appointmentId?: string;
  messageId?: string;
}

export async function writeActivity(payload: ActivityPayload) {
  return prisma.activityLog.create({
    data: {
      orgId: payload.orgId,
      accountId: payload.accountId,
      actorClerkUserId: payload.actorClerkUserId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      channel: payload.channel,
      metadata: payload.metadata as Prisma.InputJsonValue | undefined,
      contactId: payload.contactId,
      opportunityId: payload.opportunityId,
      taskId: payload.taskId,
      appointmentId: payload.appointmentId,
      messageId: payload.messageId,
    },
  });
}
