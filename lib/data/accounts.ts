import { prisma } from '@/lib/db/prisma';

export async function getAccounts(orgId: string) {
  return prisma.account.findMany({
    where: { orgId },
    orderBy: { updatedAt: 'desc' },
    include: {
      contacts: { select: { id: true } },
      opportunities: {
        where: { status: 'OPEN' },
        select: { value: true },
      },
      overdueSnapshots: {
        orderBy: { snapshotDate: 'desc' },
        take: 1,
      },
    },
  });
}

export async function getAccountDetail(orgId: string, accountId: string) {
  return prisma.account.findFirst({
    where: {
      orgId,
      OR: [{ id: accountId }, { notionPageId: accountId }],
    },
    include: {
      contacts: true,
      opportunities: { include: { stage: true }, orderBy: { updatedAt: 'desc' } },
      tasks: { orderBy: { dueDate: 'asc' } },
      activityLogs: { orderBy: { createdAt: 'desc' }, take: 200 },
      conversations: {
        include: { messages: { orderBy: { sentAt: 'desc' }, take: 3 } },
        orderBy: { updatedAt: 'desc' },
      },
      vendorDayEvents: { orderBy: { eventDate: 'desc' }, take: 20 },
      referrals: { orderBy: { createdAt: 'desc' }, take: 20 },
      pennyBundles: { orderBy: { createdAt: 'desc' }, take: 20 },
      sampleBoxRequests: { orderBy: { createdAt: 'desc' }, take: 20 },
      overdueSnapshots: { orderBy: { snapshotDate: 'desc' }, take: 20 },
    },
  });
}
