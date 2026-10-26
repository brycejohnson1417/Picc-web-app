import { IntegrationSyncStatus } from '@prisma/client';
import { buildDailyBriefing, isBriefingDeliveryWindow, type BriefingStore } from '@/lib/follow-up/follow-up-intelligence';
import { prisma } from '@/lib/db/prisma';
import { renderDailyBriefingEmail, sendDailyBriefingEmail } from '@/lib/server/daily-briefing-email';
import { loadTerritoryStores } from '@/lib/server/notion-territory';

function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function toBriefingStore(store: Awaited<ReturnType<typeof loadTerritoryStores>>['stores'][number]): BriefingStore {
  return {
    id: store.id,
    name: store.name,
    repEmails: store.repEmails,
    followUpNeeded: Boolean(store.followUpNeeded),
    followUpDate: store.followUpDate ?? null,
    followUpReason: store.followUpReason ?? null,
    statusKey: store.statusKey,
    pppStatus: store.pppStatus ?? null,
    lastSampleDate: store.lastSampleDeliveryDate ?? store.lastSampleOrderDate ?? null,
  };
}

export async function sendBriefingForUser(input: { orgId: string; clerkUserId: string; force?: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  const [preference, gmail] = await Promise.all([
    prisma.userFollowUpPreference.findUnique({ where: { orgId_clerkUserId: { orgId: input.orgId, clerkUserId: input.clerkUserId } } }),
    prisma.gmailConnection.findUnique({ where: { orgId_clerkUserId: { orgId: input.orgId, clerkUserId: input.clerkUserId } }, select: { mailboxEmail: true } }),
  ]);
  if (!preference?.briefingRecipientEmail) throw new Error('Add a daily debrief recipient in Settings.');
  if (!input.force && (!preference.dailyBriefingEnabled || !isBriefingDeliveryWindow(now, preference.timezone, preference.dailyBriefingTime))) return { status: 'not_due' as const };
  const date = localDate(now, preference.timezone);
  if (!input.force) {
    const existing = await prisma.dailyBriefingDelivery.findUnique({ where: { orgId_clerkUserId_localDate: { orgId: input.orgId, clerkUserId: input.clerkUserId, localDate: date } } });
    if (existing?.status === IntegrationSyncStatus.SUCCESS) return { status: 'already_sent' as const };
  }
  const territory = await loadTerritoryStores({ orgId: input.orgId, preferredPartnerFilter: 'all' });
  const assignmentEmail = gmail?.mailboxEmail || preference.briefingRecipientEmail;
  const briefing = buildDailyBriefing(territory.stores.map(toBriefingStore), assignmentEmail, date);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://piccnewyork.org').replace(/\/$/, '');
  const email = renderDailyBriefingEmail(briefing, date, appUrl);
  const delivery = input.force ? null : await prisma.dailyBriefingDelivery.upsert({
    where: { orgId_clerkUserId_localDate: { orgId: input.orgId, clerkUserId: input.clerkUserId, localDate: date } },
    create: { orgId: input.orgId, clerkUserId: input.clerkUserId, localDate: date, recipientEmail: preference.briefingRecipientEmail },
    update: { recipientEmail: preference.briefingRecipientEmail, status: IntegrationSyncStatus.RUNNING, lastError: null },
  });
  try {
    await sendDailyBriefingEmail({ to: preference.briefingRecipientEmail, ...email });
    if (delivery) await prisma.dailyBriefingDelivery.update({ where: { id: delivery.id }, data: { status: IntegrationSyncStatus.SUCCESS, sentAt: new Date(), lastError: null } });
    return { status: 'sent' as const, recipientEmail: preference.briefingRecipientEmail, counts: { followUps: briefing.followUps.length, pppOnboarding: briefing.pppOnboarding.length, warmLeads: briefing.warmLeads.length } };
  } catch (error) {
    if (delivery) await prisma.dailyBriefingDelivery.update({ where: { id: delivery.id }, data: { status: IntegrationSyncStatus.ERROR, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed' } }).catch(() => undefined);
    throw error;
  }
}

export async function processDailyBriefings(now = new Date()) {
  const preferences = await prisma.userFollowUpPreference.findMany({ where: { dailyBriefingEnabled: true, briefingRecipientEmail: { not: null } }, select: { orgId: true, clerkUserId: true } });
  const results = [];
  for (const preference of preferences) {
    try {
      results.push({ ...preference, ...(await sendBriefingForUser({ ...preference, now })) });
    } catch (error) {
      results.push({ ...preference, status: 'error' as const, error: error instanceof Error ? error.message : 'Delivery failed' });
    }
  }
  return results;
}
