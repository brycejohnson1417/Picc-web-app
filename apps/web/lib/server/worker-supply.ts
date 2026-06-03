import 'server-only';

import {
  CalendarConnectionProvider,
  CalendarConnectionStatus,
  NotificationCategory,
  type Prisma,
  Role,
  WorkerSkillTier,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { appendAuditEvent } from '@/lib/server/audit-log';

type Actor = {
  userId?: string | null;
  email?: string | null;
  role?: Role | null;
};

export type WorkerSupplyUpsertInput = {
  orgId: string;
  actor?: Actor;
  workerProfileId?: string | null;
  displayName?: string;
  phone?: string | null;
  photoUrl?: string | null;
  homeAddress?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
  maxTravelMinutes?: number;
  travelRadiusMiles?: number | null;
  hasVehicle?: boolean;
  vehicleType?: string | null;
  employerId?: string | null;
  employerName?: string | null;
  tier?: WorkerSkillTier;
  canAcceptOffers?: boolean;
  notes?: string | null;
  availabilityRules?: Array<{
    id?: string;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    timezone?: string;
    active?: boolean;
  }>;
  availabilityBlocks?: Array<{
    id?: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string | null;
    source?: string;
  }>;
  gearItems?: Array<{
    name: string;
    quantity?: number;
    notes?: string | null;
    needsRestock?: boolean;
  }>;
  certifications?: Array<{
    code: string;
    label?: string;
    certifiedAt?: Date | null;
    expiresAt?: Date | null;
  }>;
  brandTrainings?: Array<{
    brandName: string;
    level?: string | null;
    trainedAt?: Date | null;
  }>;
  skillTags?: Array<{
    tag: string;
    label?: string | null;
  }>;
  notificationPreferences?: Array<{
    category: NotificationCategory;
    emailEnabled?: boolean;
    inAppEnabled?: boolean;
    quietHoursEnabled?: boolean;
    quietHoursStartMinute?: number;
    quietHoursEndMinute?: number;
    timezone?: string;
  }>;
};

type DateParts = {
  dayOfWeek: number;
  minuteOfDay: number;
};

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getDefaultNotificationPreferenceRows(input: {
  orgId: string;
  workerProfileId?: string | null;
  clerkUserId?: string | null;
  email?: string | null;
}) {
  const defaults: Partial<Record<NotificationCategory, { emailEnabled: boolean; inAppEnabled: boolean }>> = {
    [NotificationCategory.OFFERS]: { emailEnabled: true, inAppEnabled: true },
    [NotificationCategory.ASSIGNMENTS]: { emailEnabled: true, inAppEnabled: true },
    [NotificationCategory.APPROVALS]: { emailEnabled: true, inAppEnabled: true },
    [NotificationCategory.PAYROLL]: { emailEnabled: true, inAppEnabled: true },
    [NotificationCategory.SYSTEM_ALERTS]: { emailEnabled: true, inAppEnabled: true },
    [NotificationCategory.EVENT_RECAPS]: { emailEnabled: true, inAppEnabled: true },
    [NotificationCategory.EXCEPTIONS]: { emailEnabled: true, inAppEnabled: true },
  };

  return Object.values(NotificationCategory).map((category) => ({
    orgId: input.orgId,
    workerProfileId: input.workerProfileId ?? null,
    clerkUserId: input.clerkUserId ?? null,
    email: input.email ?? null,
    category,
    emailEnabled: defaults[category]?.emailEnabled ?? true,
    inAppEnabled: defaults[category]?.inAppEnabled ?? true,
    quietHoursEnabled: true,
    quietHoursStartMinute: 22 * 60,
    quietHoursEndMinute: 7 * 60,
    timezone: 'America/New_York',
  }));
}

function normalizeTag(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function getPartsInTimezone(value: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(value);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return {
    dayOfWeek: DAY_INDEX[weekday] ?? 0,
    minuteOfDay: hour * 60 + minute,
  };
}

export function windowFitsAvailabilityRules(
  start: Date,
  end: Date,
  rules: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; timezone: string; active: boolean }>,
) {
  if (rules.length === 0) return true;
  return rules.some((rule) => {
    if (!rule.active) return false;
    const startParts = getPartsInTimezone(start, rule.timezone);
    const endParts = getPartsInTimezone(end, rule.timezone);
    if (startParts.dayOfWeek !== endParts.dayOfWeek) return false;
    if (startParts.dayOfWeek !== rule.dayOfWeek) return false;
    return startParts.minuteOfDay >= rule.startMinute && endParts.minuteOfDay <= rule.endMinute;
  });
}

export function hasAvailabilityBlock(
  start: Date,
  end: Date,
  blocks: Array<{ startsAt: Date; endsAt: Date }>,
) {
  return blocks.some((block) => block.startsAt < end && block.endsAt > start);
}

export function calendarConnectionMode(
  connections: Array<{ status: CalendarConnectionStatus; lastSuccessfulSyncAt: Date | null }>,
): 'healthy' | 'stale' | 'manual-only' {
  if (connections.length === 0) return 'manual-only';
  const lastSuccessful = connections
    .map((connection) => connection.lastSuccessfulSyncAt?.getTime() ?? null)
    .filter((value): value is number => value != null)
    .sort((a, b) => b - a)[0];
  if (!lastSuccessful) return 'manual-only';
  const lagHours = (Date.now() - lastSuccessful) / (60 * 60 * 1000);
  if (lagHours >= 72 || connections.some((connection) => connection.status === CalendarConnectionStatus.REVOKED || connection.status === CalendarConnectionStatus.MANUAL_ONLY)) {
    return 'manual-only';
  }
  if (lagHours >= 24 || connections.some((connection) => connection.status === CalendarConnectionStatus.STALE || connection.status === CalendarConnectionStatus.ERROR)) {
    return 'stale';
  }
  return 'healthy';
}

async function resolveEmployerId(input: {
  orgId: string;
  employerId?: string | null;
  employerName?: string | null;
}) {
  if (input.employerId) return input.employerId;
  if (!input.employerName?.trim()) return null;

  const existing = await prisma.employer.findFirst({
    where: {
      orgId: input.orgId,
      name: input.employerName.trim(),
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.employer.create({
    data: {
      orgId: input.orgId,
      name: input.employerName.trim(),
      isServiceCompany: true,
    },
    select: { id: true },
  });
  return created.id;
}

export async function ensureWorkerProfileForViewer(input: {
  orgId: string;
  actor?: Actor;
}) {
  if (!input.actor?.userId && !input.actor?.email) return null;

  const existing = await prisma.workerProfile.findFirst({
    where: {
      orgId: input.orgId,
      OR: [
        ...(input.actor?.userId ? [{ clerkUserId: input.actor.userId }] : []),
        ...(input.actor?.email ? [{ email: input.actor.email }] : []),
      ],
    },
  });
  if (existing) return existing;
  if (!input.actor?.email) return null;

  return prisma.workerProfile.create({
    data: {
      orgId: input.orgId,
      clerkUserId: input.actor.userId ?? null,
      email: input.actor.email,
      displayName: input.actor.email,
      active: true,
      canAcceptOffers: true,
    },
  });
}

export async function listWorkerSupplyData(input: {
  orgId: string;
  actor?: Actor;
  includeAll?: boolean;
}) {
  const viewerWorker = await ensureWorkerProfileForViewer(input);
  const where =
    input.includeAll && ['ADMIN', 'OPS_TEAM'].includes(input.actor?.role ?? '')
      ? { orgId: input.orgId }
      : {
          orgId: input.orgId,
          ...(viewerWorker ? { id: viewerWorker.id } : { id: '__none__' }),
        };

  const [workers, employers, preferences] = await Promise.all([
    prisma.workerProfile.findMany({
      where,
      include: {
        employer: true,
        availabilityRules: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
        availabilityBlocks: { where: { endsAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, orderBy: { startsAt: 'asc' } },
        calendarConnections: { orderBy: { updatedAt: 'desc' } },
        gearItems: { orderBy: { name: 'asc' } },
        certifications: { orderBy: { label: 'asc' } },
        brandTrainings: { orderBy: { brandName: 'asc' } },
        skillTags: { orderBy: { tag: 'asc' } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 8, include: { account: { select: { id: true, name: true } } } },
      },
      orderBy: { displayName: 'asc' },
    }),
    prisma.employer.findMany({
      where: { orgId: input.orgId },
      orderBy: [{ isServiceCompany: 'desc' }, { name: 'asc' }],
    }),
    prisma.notificationPreference.findMany({
      where: {
        orgId: input.orgId,
        ...(viewerWorker ? { OR: [{ workerProfileId: viewerWorker.id }, { clerkUserId: input.actor?.userId ?? undefined }] } : {}),
      },
      orderBy: [{ category: 'asc' }],
    }),
  ]);

  return {
    viewerWorkerProfileId: viewerWorker?.id ?? null,
    employers,
    workers,
    notificationPreferences:
      preferences.length > 0
        ? preferences
        : getDefaultNotificationPreferenceRows({
            orgId: input.orgId,
            workerProfileId: viewerWorker?.id ?? null,
            clerkUserId: input.actor?.userId ?? null,
            email: input.actor?.email ?? null,
          }),
  };
}

export async function saveWorkerSupplyData(input: WorkerSupplyUpsertInput) {
  const actorWorker = await ensureWorkerProfileForViewer({ orgId: input.orgId, actor: input.actor });
  const targetWorkerId = input.workerProfileId ?? actorWorker?.id ?? null;
  if (!targetWorkerId) {
    throw new Error('Worker profile not found');
  }

  if (
    input.workerProfileId &&
    input.workerProfileId !== actorWorker?.id &&
    !['ADMIN', 'OPS_TEAM'].includes(input.actor?.role ?? '')
  ) {
    throw new Error('Only admin or ops can edit other workers');
  }

  const employerId = await resolveEmployerId({
    orgId: input.orgId,
    employerId: input.employerId,
    employerName: input.employerName,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const worker = await tx.workerProfile.update({
      where: { id: targetWorkerId },
      data: {
        displayName: input.displayName?.trim() || undefined,
        phone: input.phone?.trim() || null,
        photoUrl: input.photoUrl?.trim() || null,
        homeAddress: input.homeAddress?.trim() || null,
        homeLat: input.homeLat ?? undefined,
        homeLng: input.homeLng ?? undefined,
        maxTravelMinutes: input.maxTravelMinutes ?? undefined,
        travelRadiusMiles: input.travelRadiusMiles ?? null,
        hasVehicle: input.hasVehicle ?? undefined,
        vehicleType: input.vehicleType?.trim() || null,
        employerId,
        employerName: input.employerName?.trim() || undefined,
        tier: input.tier ?? undefined,
        canAcceptOffers: input.canAcceptOffers ?? undefined,
        notes: input.notes?.trim() || null,
      },
    });

    if (input.availabilityRules) {
      await tx.workerAvailabilityRule.deleteMany({ where: { workerProfileId: targetWorkerId } });
      if (input.availabilityRules.length > 0) {
        await tx.workerAvailabilityRule.createMany({
          data: input.availabilityRules.map((rule) => ({
            orgId: input.orgId,
            workerProfileId: targetWorkerId,
            dayOfWeek: rule.dayOfWeek,
            startMinute: rule.startMinute,
            endMinute: rule.endMinute,
            timezone: rule.timezone?.trim() || 'America/New_York',
            active: rule.active ?? true,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (input.availabilityBlocks) {
      await tx.workerAvailabilityBlock.deleteMany({ where: { workerProfileId: targetWorkerId, source: 'manual' } });
      if (input.availabilityBlocks.length > 0) {
        await tx.workerAvailabilityBlock.createMany({
          data: input.availabilityBlocks.map((block) => ({
            orgId: input.orgId,
            workerProfileId: targetWorkerId,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            reason: block.reason?.trim() || null,
            source: block.source?.trim() || 'manual',
          })),
        });
      }
    }

    if (input.gearItems) {
      await tx.workerGearItem.deleteMany({ where: { workerProfileId: targetWorkerId } });
      if (input.gearItems.length > 0) {
        await tx.workerGearItem.createMany({
          data: input.gearItems.map((item) => ({
            orgId: input.orgId,
            workerProfileId: targetWorkerId,
            name: item.name.trim(),
            quantity: Math.max(1, item.quantity ?? 1),
            notes: item.notes?.trim() || null,
            needsRestock: item.needsRestock ?? false,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (input.certifications) {
      await tx.workerCertification.deleteMany({ where: { workerProfileId: targetWorkerId } });
      if (input.certifications.length > 0) {
        await tx.workerCertification.createMany({
          data: input.certifications.map((certification) => ({
            orgId: input.orgId,
            workerProfileId: targetWorkerId,
            code: normalizeTag(certification.code),
            label: certification.label?.trim() || certification.code.trim(),
            certifiedAt: certification.certifiedAt ?? null,
            expiresAt: certification.expiresAt ?? null,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (input.brandTrainings) {
      await tx.workerBrandTraining.deleteMany({ where: { workerProfileId: targetWorkerId } });
      if (input.brandTrainings.length > 0) {
        await tx.workerBrandTraining.createMany({
          data: input.brandTrainings.map((training) => ({
            orgId: input.orgId,
            workerProfileId: targetWorkerId,
            brandName: training.brandName.trim(),
            level: training.level?.trim() || null,
            trainedAt: training.trainedAt ?? null,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (input.skillTags) {
      await tx.workerSkillTag.deleteMany({ where: { workerProfileId: targetWorkerId } });
      if (input.skillTags.length > 0) {
        await tx.workerSkillTag.createMany({
          data: input.skillTags.map((tag) => ({
            orgId: input.orgId,
            workerProfileId: targetWorkerId,
            tag: normalizeTag(tag.tag),
            label: tag.label?.trim() || null,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (input.notificationPreferences) {
      await tx.notificationPreference.deleteMany({
        where: {
          orgId: input.orgId,
          OR: [{ workerProfileId: worker.id }, ...(worker.clerkUserId ? [{ clerkUserId: worker.clerkUserId }] : [])],
        },
      });
      await tx.notificationPreference.createMany({
        data: buildPreferenceUpsertRows(
          input.orgId,
          worker.id,
          worker.clerkUserId ?? input.actor?.userId ?? null,
          worker.email ?? input.actor?.email ?? null,
          input.notificationPreferences,
        ),
      });
    }

    return worker;
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'worker_profile.updated',
    entityType: 'WorkerProfile',
    entityId: updated.id,
    metadata: {
      workerProfileId: updated.id,
      tier: input.tier ?? null,
      hasAvailabilityRules: Boolean(input.availabilityRules?.length),
      hasGearItems: Boolean(input.gearItems?.length),
      hasCertifications: Boolean(input.certifications?.length),
      hasBrandTrainings: Boolean(input.brandTrainings?.length),
      hasSkillTags: Boolean(input.skillTags?.length),
    },
  });

  return updated;
}

export async function updateWorkerCalendarConnection(input: {
  orgId: string;
  actor?: Actor;
  workerProfileId?: string | null;
  provider: CalendarConnectionProvider;
  calendarEmail?: string | null;
  status?: CalendarConnectionStatus;
  lastSuccessfulSyncAt?: Date | null;
  lastAttemptAt?: Date | null;
  accessTokenExpiresAt?: Date | null;
  revokedAt?: Date | null;
  lastError?: string | null;
}) {
  const actorWorker = await ensureWorkerProfileForViewer({ orgId: input.orgId, actor: input.actor });
  const targetWorkerId = input.workerProfileId ?? actorWorker?.id ?? null;
  if (!targetWorkerId) throw new Error('Worker profile not found');
  if (
    input.workerProfileId &&
    input.workerProfileId !== actorWorker?.id &&
    !['ADMIN', 'OPS_TEAM'].includes(input.actor?.role ?? '')
  ) {
    throw new Error('Only admin or ops can update other workers');
  }

  const connection = await prisma.workerCalendarConnection.upsert({
    where: {
      workerProfileId_provider: {
        workerProfileId: targetWorkerId,
        provider: input.provider,
      },
    },
    update: {
      calendarEmail: input.calendarEmail?.trim() || null,
      status: input.status ?? CalendarConnectionStatus.MANUAL_ONLY,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? undefined,
      lastAttemptAt: input.lastAttemptAt ?? new Date(),
      accessTokenExpiresAt: input.accessTokenExpiresAt ?? undefined,
      revokedAt: input.revokedAt ?? null,
      lastError: input.lastError?.trim() || null,
    },
    create: {
      orgId: input.orgId,
      workerProfileId: targetWorkerId,
      provider: input.provider,
      calendarEmail: input.calendarEmail?.trim() || null,
      status: input.status ?? CalendarConnectionStatus.MANUAL_ONLY,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? null,
      lastAttemptAt: input.lastAttemptAt ?? new Date(),
      accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      revokedAt: input.revokedAt ?? null,
      lastError: input.lastError?.trim() || null,
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'worker_calendar_connection.updated',
    entityType: 'WorkerCalendarConnection',
    entityId: connection.id,
    metadata: {
      workerProfileId: targetWorkerId,
      provider: input.provider,
      status: connection.status,
    },
  });

  return connection;
}

export async function getWorkerDispatchReadModel(orgId: string) {
  return prisma.workerProfile.findMany({
    where: { orgId, active: true, canAcceptOffers: true },
    include: {
      employer: true,
      availabilityRules: true,
      availabilityBlocks: {
        where: {
          endsAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      },
      calendarConnections: true,
      gearItems: true,
      certifications: true,
      brandTrainings: true,
      skillTags: true,
      assignments: {
        where: {
          scheduledStart: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          scheduledStart: true,
          status: true,
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });
}

export function buildPreferenceUpsertRows(
  orgId: string,
  workerProfileId: string,
  clerkUserId: string | null,
  email: string | null,
  rows?: WorkerSupplyUpsertInput['notificationPreferences'],
): Prisma.NotificationPreferenceCreateManyInput[] {
  if (!rows?.length) {
    return getDefaultNotificationPreferenceRows({
      orgId,
      workerProfileId,
      clerkUserId,
      email,
    });
  }

  return rows.map((preference) => ({
    orgId,
    workerProfileId,
    clerkUserId,
    email,
    category: preference.category,
    emailEnabled: preference.emailEnabled ?? true,
    inAppEnabled: preference.inAppEnabled ?? true,
    quietHoursEnabled: preference.quietHoursEnabled ?? true,
    quietHoursStartMinute: preference.quietHoursStartMinute ?? 22 * 60,
    quietHoursEndMinute: preference.quietHoursEndMinute ?? 7 * 60,
    timezone: preference.timezone?.trim() || 'America/New_York',
  }));
}
