import { Channel, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export async function getDashboardData(orgId: string) {
  const [activeAccounts, openOpps, upcomingTasks, recentActivity, pipelineByStage] = await Promise.all([
    prisma.account.count({ where: { orgId, status: 'ACTIVE' } }),
    prisma.opportunity.aggregate({ where: { orgId, status: 'OPEN' }, _sum: { value: true } }),
    prisma.task.count({ where: { orgId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { gte: new Date() } } }),
    prisma.activityLog.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 20, include: { account: true } }),
    prisma.stage.findMany({
      where: { orgId },
      include: {
        opportunities: {
          where: { status: 'OPEN' },
          select: { id: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  return {
    activeAccounts,
    openOppValue: openOpps._sum.value ?? new Prisma.Decimal(0),
    upcomingFollowUps: upcomingTasks,
    avgResponseTime: '2h 18m',
    recentActivity,
    pipelineByStage: pipelineByStage.map((s) => ({ name: s.name, count: s.opportunities.length, color: s.color })),
  };
}

export async function getConversationOverview(orgId: string, channel?: Channel) {
  return prisma.conversation.findMany({
    where: {
      orgId,
      ...(channel ? { channel } : {}),
    },
    include: {
      account: true,
      contact: true,
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
  });
}
