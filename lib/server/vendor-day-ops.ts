import 'server-only';

import { Prisma, Role, VendorDayArtifactType, VendorDayAssignmentStatus, VendorDayOfferStatus, VendorDayRequestSource, VendorDayRequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { DEFAULT_PICC_POLICY_VALUES, ensureActivePolicySnapshot, type PiccPolicyValues } from '@/lib/server/policy-snapshots';
import { syncVendorDayArchiveForAssignmentId, syncVendorDayArchiveForRequestId } from '@/lib/server/notion-vendor-days';
import {
  calendarConnectionMode,
  getWorkerDispatchReadModel,
  hasAvailabilityBlock,
  windowFitsAvailabilityRules,
} from '@/lib/server/worker-supply';
import { ensurePayrollLineItemForAssignment } from '@/lib/server/payroll';
import { ensureVendorDayRoiSnapshot } from '@/lib/server/roi';

type Actor = {
  userId?: string | null;
  email?: string | null;
  role?: Role | null;
};

type CreateRequestInput = {
  orgId: string;
  accountId: string;
  source: VendorDayRequestSource;
  requestedStart: Date;
  alternateStart?: Date | null;
  requestedDurationHours?: number;
  pennyBundleRequested?: boolean;
  preferredWorkerProfileId?: string | null;
  override60DayWindow?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  actor?: Actor;
};

type DispatchInput = {
  orgId: string;
  requestId: string;
  actor?: Actor;
  excludeWorkerProfileIds?: string[];
};

function asPolicyValues(source: Prisma.JsonValue | PiccPolicyValues | null | undefined): PiccPolicyValues {
  const raw = source as Partial<PiccPolicyValues> | null | undefined;
  return {
    ...DEFAULT_PICC_POLICY_VALUES,
    ...raw,
    priorityWeights: {
      ...DEFAULT_PICC_POLICY_VALUES.priorityWeights,
      ...(raw?.priorityWeights ?? {}),
    },
  };
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function notionPageUrl(pageId: string | null | undefined) {
  if (!pageId) return null;
  return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}

async function syncVendorDayArchiveSafely(sync: () => Promise<unknown>) {
  try {
    await sync();
  } catch {
    return null;
  }
  return null;
}

function haversineMiles(startLat: number, startLng: number, endLat: number, endLng: number) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(endLat - startLat);
  const dLng = toRadians(endLng - startLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(startLat)) * Math.cos(toRadians(endLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function deriveOneWayTravel(input: {
  homeLat?: number | null;
  homeLng?: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
}) {
  if (
    input.homeLat == null ||
    input.homeLng == null ||
    input.storeLat == null ||
    input.storeLng == null
  ) {
    return { travelMilesOneWay: null, travelMinutesOneWay: null };
  }

  const miles = haversineMiles(input.homeLat, input.homeLng, input.storeLat, input.storeLng);
  const bufferedMiles = miles * 1.18;
  const minutes = Math.round((bufferedMiles / 35) * 60);
  return {
    travelMilesOneWay: Number(bufferedMiles.toFixed(1)),
    travelMinutesOneWay: minutes,
  };
}

async function getLastVendorDayAt(orgId: string, accountId: string) {
  const [event, assignment] = await Promise.all([
    prisma.vendorDayEvent.findFirst({
      where: { orgId, accountId },
      orderBy: { eventDate: 'desc' },
      select: { eventDate: true },
    }),
    prisma.vendorDayAssignment.findFirst({
      where: {
        orgId,
        request: { accountId },
        status: {
          in: [
            VendorDayAssignmentStatus.CHECKED_IN,
            VendorDayAssignmentStatus.CHECKED_OUT,
            VendorDayAssignmentStatus.COMPLETED,
          ],
        },
      },
      orderBy: { scheduledStart: 'desc' },
      select: { scheduledStart: true },
    }),
  ]);

  const timestamps = [event?.eventDate?.getTime(), assignment?.scheduledStart?.getTime()].filter(
    (value): value is number => typeof value === 'number',
  );
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

async function hasConflictingLiveRequest(orgId: string, accountId: string) {
  const count = await prisma.vendorDayRequest.count({
    where: {
      orgId,
      accountId,
      status: {
        in: [
          VendorDayRequestStatus.PROPOSED,
          VendorDayRequestStatus.REQUESTED,
          VendorDayRequestStatus.AWAITING_REP_APPROVAL,
          VendorDayRequestStatus.READY_FOR_DISPATCH,
          VendorDayRequestStatus.OFFER_PENDING,
          VendorDayRequestStatus.ASSIGNED,
          VendorDayRequestStatus.PASSED_OFF,
          VendorDayRequestStatus.NO_SHOW,
          VendorDayRequestStatus.EXCEPTION,
          VendorDayRequestStatus.DISPUTED,
        ],
      },
    },
  });
  return count > 0;
}

function scorePriority(input: {
  hasPriorVendorDay: boolean;
  daysSinceLastVendorDay: number | null;
  recentOrderRevenue: number;
  recentOrderCount: number;
  source: VendorDayRequestSource;
}, policy: PiccPolicyValues) {
  const weights = policy.priorityWeights;
  const dayFactor = input.daysSinceLastVendorDay == null ? 1 : Math.min(1, input.daysSinceLastVendorDay / policy.cooldownDays);
  const velocityFactor = Math.min(1, input.recentOrderCount / 10);
  const revenueFactor = Math.min(1, input.recentOrderRevenue / 5000);
  const score =
    dayFactor * weights.daysSinceLastVendorDay +
    velocityFactor * weights.orderVelocity +
    revenueFactor * weights.accountValue +
    (!input.hasPriorVendorDay ? weights.neverHadVendorDay : 0) +
    (input.source === VendorDayRequestSource.REP_REQUESTED ? weights.repRequestFlag : 0);

  return {
    score: Number(score.toFixed(2)),
    breakdown: {
      daysSinceLastVendorDay: Number((dayFactor * weights.daysSinceLastVendorDay).toFixed(2)),
      orderVelocity: Number((velocityFactor * weights.orderVelocity).toFixed(2)),
      accountValue: Number((revenueFactor * weights.accountValue).toFixed(2)),
      neverHadVendorDay: !input.hasPriorVendorDay ? weights.neverHadVendorDay : 0,
      repRequestFlag: input.source === VendorDayRequestSource.REP_REQUESTED ? weights.repRequestFlag : 0,
    },
  };
}

export async function ensureWorkerProfileForActor(input: {
  orgId: string;
  actor: { userId: string; email: string };
  displayName?: string | null;
}) {
  const existing = await prisma.workerProfile.findFirst({
    where: {
      orgId: input.orgId,
      OR: [{ clerkUserId: input.actor.userId }, { email: input.actor.email }],
    },
  });
  if (existing) return existing;

  return prisma.workerProfile.create({
    data: {
      orgId: input.orgId,
      clerkUserId: input.actor.userId,
      email: input.actor.email,
      displayName: input.displayName?.trim() || input.actor.email,
      active: true,
      canAcceptOffers: true,
    },
  });
}

export async function createVendorDayRequest(input: CreateRequestInput) {
  const policySnapshot = await ensureActivePolicySnapshot(input.orgId, {
    clerkUserId: input.actor?.userId ?? null,
    email: input.actor?.email ?? null,
  });
  const policy = asPolicyValues(policySnapshot.values);
  const requestedDurationHours = input.requestedDurationHours ?? policy.standardEventDurationHours;
  const requestedEnd = addHours(input.requestedStart, requestedDurationHours);
  const alternateEnd = input.alternateStart ? addHours(input.alternateStart, requestedDurationHours) : null;

  const [account, liveConflict, lastVendorDayAt, orderAggregate] = await Promise.all([
    prisma.account.findFirst({
      where: { id: input.accountId, orgId: input.orgId },
      select: {
        id: true,
        name: true,
        status: true,
        geoLat: true,
        geoLng: true,
        address1: true,
        city: true,
        state: true,
        zipcode: true,
        vendorDaySuppressed: true,
        vendorDaySuppressionReason: true,
      },
    }),
    hasConflictingLiveRequest(input.orgId, input.accountId),
    getLastVendorDayAt(input.orgId, input.accountId),
    prisma.nabisStoreMetricDaily.aggregate({
      where: {
        orgId: input.orgId,
        accountId: input.accountId,
        metricDate: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      _sum: { orderCount: true, revenue: true },
    }),
  ]);

  if (!account) {
    throw new Error('Account not found');
  }

  if (normalizeStatus(account.status) !== 'active' && !input.override60DayWindow) {
    throw new Error('Store is not active for vendor-day requests');
  }
  if (account.vendorDaySuppressed) {
    throw new Error(account.vendorDaySuppressionReason?.trim() || 'Store is currently suppressed from vendor-day outreach');
  }

  if (liveConflict) {
    throw new Error('Store already has an active vendor-day request or assignment');
  }

  const daysSinceLastVendorDay = lastVendorDayAt
    ? Math.floor((Date.now() - lastVendorDayAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const cooldownSatisfied = daysSinceLastVendorDay == null || daysSinceLastVendorDay >= policy.cooldownDays;

  if (!cooldownSatisfied && !input.override60DayWindow) {
    throw new Error('Store is inside the 60-day cooldown window');
  }

  if (input.override60DayWindow && !input.overrideReason?.trim()) {
    throw new Error('Override 60-Day Window requires a reason');
  }

  const requiresAdminApproval = requestedDurationHours > policy.standardEventDurationHours;
  const repApprovalRequired =
    input.source === VendorDayRequestSource.STORE_REQUESTED || input.source === VendorDayRequestSource.BA_REQUESTED;
  const initialStatus =
    repApprovalRequired
      ? VendorDayRequestStatus.AWAITING_REP_APPROVAL
      : requiresAdminApproval
        ? VendorDayRequestStatus.REQUESTED
        : VendorDayRequestStatus.READY_FOR_DISPATCH;

  const priority = scorePriority(
    {
      hasPriorVendorDay: Boolean(lastVendorDayAt),
      daysSinceLastVendorDay,
      recentOrderRevenue: Number(orderAggregate._sum?.revenue ?? 0),
      recentOrderCount: orderAggregate._sum?.orderCount ?? 0,
      source: input.source,
    },
    policy,
  );

  const request = await prisma.vendorDayRequest.create({
    data: {
      orgId: input.orgId,
      accountId: input.accountId,
      source: input.source,
      status: initialStatus,
      requestedStart: input.requestedStart,
      requestedEnd,
      alternateStart: input.alternateStart ?? null,
      alternateEnd,
      requestedDurationHours,
      pennyBundleRequested: input.pennyBundleRequested ?? false,
      repApprovalRequired,
      preferredWorkerProfileId: input.preferredWorkerProfileId ?? null,
      override60DayWindow: Boolean(input.override60DayWindow),
      overrideReason: input.overrideReason?.trim() || null,
      requiresAdminApproval,
      requestedByClerkUserId: input.actor?.userId ?? null,
      requestedByRole: input.actor?.role ?? null,
      requestedByEmail: input.actor?.email ?? null,
      priorityScore: priority.score,
      priorityBreakdown: priority.breakdown as Prisma.InputJsonValue,
      notes: input.notes?.trim() || null,
      policySnapshotId: policySnapshot.id,
    },
    include: {
      account: true,
    },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: input.override60DayWindow ? 'vendor_day.request.override_60_day_window' : 'vendor_day.request.created',
    entityType: 'VendorDayRequest',
    entityId: request.id,
    reason: input.overrideReason?.trim() || null,
    metadata: {
      accountId: input.accountId,
      requestedStart: input.requestedStart.toISOString(),
      requestedDurationHours,
      source: input.source,
      requiresAdminApproval,
      priorityScore: priority.score,
    },
  });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForRequestId({
      orgId: input.orgId,
      requestId: request.id,
      actor: {
        userId: input.actor?.userId ?? null,
        email: input.actor?.email ?? null,
      },
    }),
  );

  return request;
}

async function loadEligibleWorkersForRequest(input: {
  orgId: string;
  requestId: string;
  excludeWorkerProfileIds?: string[];
}) {
  const request = await prisma.vendorDayRequest.findFirst({
    where: { id: input.requestId, orgId: input.orgId },
    include: { account: true },
  });
  if (!request) {
    throw new Error('Vendor-day request not found');
  }

  const workers = await getWorkerDispatchReadModel(input.orgId);

  const conflicts = await prisma.vendorDayAssignment.findMany({
    where: {
      orgId: input.orgId,
      status: {
        in: [
          VendorDayAssignmentStatus.ASSIGNED,
          VendorDayAssignmentStatus.CHECKED_IN,
          VendorDayAssignmentStatus.CHECKED_OUT,
          VendorDayAssignmentStatus.EXCEPTION,
          VendorDayAssignmentStatus.DISPUTED,
        ],
      },
      OR: [
        {
          scheduledStart: {
            lt: request.requestedEnd,
          },
          scheduledEnd: {
            gt: request.requestedStart,
          },
        },
      ],
    },
    select: { workerProfileId: true },
  });
  const conflictIds = new Set(conflicts.map((conflict) => conflict.workerProfileId));

  const candidates = workers
    .filter((worker) => !conflictIds.has(worker.id))
    .filter((worker) => !input.excludeWorkerProfileIds?.includes(worker.id))
    .map((worker) => {
      const travel = deriveOneWayTravel({
        homeLat: worker.homeLat,
        homeLng: worker.homeLng,
        storeLat: request.account.geoLat,
        storeLng: request.account.geoLng,
      });
      const withinTravelMinutes =
        travel.travelMinutesOneWay == null || travel.travelMinutesOneWay <= worker.maxTravelMinutes;
      const withinTravelRadius =
        worker.travelRadiusMiles == null || travel.travelMilesOneWay == null || travel.travelMilesOneWay <= worker.travelRadiusMiles;
      const fitsAvailability = windowFitsAvailabilityRules(
        request.requestedStart,
        request.requestedEnd,
        worker.availabilityRules,
      );
      const hasBlock = hasAvailabilityBlock(request.requestedStart, request.requestedEnd, worker.availabilityBlocks);
      const calendarMode = calendarConnectionMode(worker.calendarConnections);
      const hasPennyBundleCertification =
        worker.certifications.some((certification) => certification.code === 'PENNY_BUNDLE') ||
        worker.skillTags.some((tag) => tag.tag === 'PENNY_BUNDLE');
      const matchesBundleNeed = !request.pennyBundleRequested || hasPennyBundleCertification;
      const recentAssignmentCount = worker.assignments.filter((assignment) => {
        const lookback = Date.now() - 14 * 24 * 60 * 60 * 1000;
        return assignment.scheduledStart.getTime() >= lookback;
      }).length;

      if (!withinTravelMinutes || !withinTravelRadius || !fitsAvailability || hasBlock || !matchesBundleNeed) {
        return null;
      }

      const travelScore = travel.travelMinutesOneWay == null ? 0.45 : Math.max(0, 1 - travel.travelMinutesOneWay / 180);
      const availabilityScore = fitsAvailability ? (calendarMode === 'healthy' ? 1 : calendarMode === 'stale' ? 0.8 : 0.7) : 0;
      const skillScore =
        (request.pennyBundleRequested ? (hasPennyBundleCertification ? 1 : 0) : 0.6) +
        (worker.hasVehicle ? 0.15 : 0) +
        (worker.gearItems.some((item) => item.name.toLowerCase().includes('table')) ? 0.25 : 0);
      const workloadScore = Math.max(0, 1 - recentAssignmentCount / 8);
      const preferenceBonus = request.preferredWorkerProfileId === worker.id ? 1 : 0;
      const rankScore = Number(
        (
          travelScore * 40 +
          availabilityScore * 25 +
          Math.min(skillScore, 1) * 20 +
          workloadScore * 10 +
          preferenceBonus * 5
        ).toFixed(2),
      );

      const rankReasonBits = [
        travel.travelMinutesOneWay == null ? 'travel estimate unavailable' : `${travel.travelMinutesOneWay} min one-way travel`,
        `availability ${calendarMode}`,
        request.pennyBundleRequested ? (hasPennyBundleCertification ? 'Penny Bundle certified' : 'missing Penny Bundle certification') : 'standard event fit',
        recentAssignmentCount > 0 ? `${recentAssignmentCount} assignments in last 14 days` : 'light workload',
        preferenceBonus ? 'preferred worker' : null,
      ].filter(Boolean);

      return {
        worker,
        rankScore,
        travel,
        rankReason: rankReasonBits.join(' · '),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.rankScore - a.rankScore);

  return { request, candidates };
}

export async function dispatchVendorDayRequest(input: DispatchInput) {
  const policySnapshot = await ensureActivePolicySnapshot(input.orgId, {
    clerkUserId: input.actor?.userId ?? null,
    email: input.actor?.email ?? null,
  });
  const policy = asPolicyValues(policySnapshot.values);
  const { request, candidates } = await loadEligibleWorkersForRequest({
    orgId: input.orgId,
    requestId: input.requestId,
    excludeWorkerProfileIds: input.excludeWorkerProfileIds,
  });

  if (request.requiresAdminApproval && !request.approvedAt) {
    throw new Error('Request requires admin approval before dispatch');
  }
  if (request.repApprovalRequired && !request.repApprovedAt) {
    throw new Error('Request requires rep approval before dispatch');
  }
  if (request.status === VendorDayRequestStatus.ASSIGNED) {
    throw new Error('Request is already assigned');
  }

  if (candidates.length === 0) {
    await prisma.vendorDayRequest.update({
      where: { id: request.id },
      data: { status: VendorDayRequestStatus.EXCEPTION },
    });
    await appendAuditEvent({
      orgId: input.orgId,
      actorClerkUserId: input.actor?.userId ?? null,
      actorEmail: input.actor?.email ?? null,
      action: 'vendor_day.dispatch.no_candidates',
      entityType: 'VendorDayRequest',
      entityId: request.id,
      metadata: {
        requestedStart: request.requestedStart.toISOString(),
      },
    });
    return { requestId: request.id, offersCreated: 0 };
  }

  const expiresAt = addHours(new Date(), policy.offerWindowHours);
  const createdOffers = await prisma.$transaction(async (tx) => {
    await tx.vendorDayOffer.updateMany({
      where: { requestId: request.id, status: VendorDayOfferStatus.OPEN },
      data: { status: VendorDayOfferStatus.WITHDRAWN, respondedAt: new Date() },
    });

    const offers = [];
    for (const candidate of candidates) {
      const offer = await tx.vendorDayOffer.upsert({
        where: {
          requestId_workerProfileId: {
            requestId: request.id,
            workerProfileId: candidate.worker.id,
          },
        },
        update: {
          status: VendorDayOfferStatus.OPEN,
          offeredAt: new Date(),
          expiresAt,
          respondedAt: null,
          rankScore: candidate.rankScore,
          rankReason:
            candidate.rankReason,
        },
        create: {
          orgId: input.orgId,
          requestId: request.id,
          workerProfileId: candidate.worker.id,
          status: VendorDayOfferStatus.OPEN,
          expiresAt,
          rankScore: candidate.rankScore,
          rankReason:
            candidate.rankReason,
        },
      });
      offers.push(offer);
    }

    await tx.vendorDayRequest.update({
      where: { id: request.id },
      data: { status: VendorDayRequestStatus.OFFER_PENDING },
    });

    return offers;
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor?.userId ?? null,
    actorEmail: input.actor?.email ?? null,
    action: 'vendor_day.dispatch.offers_opened',
    entityType: 'VendorDayRequest',
    entityId: request.id,
    metadata: {
      offerCount: createdOffers.length,
      workerProfileIds: createdOffers.map((offer) => offer.workerProfileId),
      expiresAt: expiresAt.toISOString(),
    },
  });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForRequestId({
      orgId: input.orgId,
      requestId: request.id,
      actor: {
        userId: input.actor?.userId ?? null,
        email: input.actor?.email ?? null,
      },
    }),
  );

  return { requestId: request.id, offersCreated: createdOffers.length };
}

export async function respondToVendorDayOffer(input: {
  orgId: string;
  offerId: string;
  decision: 'accept' | 'decline';
  actor: { userId: string; email: string; role?: Role | null };
}) {
  const worker = await ensureWorkerProfileForActor({
    orgId: input.orgId,
    actor: { userId: input.actor.userId, email: input.actor.email },
  });
  const offer = await prisma.vendorDayOffer.findFirst({
    where: { id: input.offerId, orgId: input.orgId, workerProfileId: worker.id },
    include: {
      request: {
        include: { account: true, policySnapshot: true },
      },
    },
  });

  if (!offer) {
    throw new Error('Offer not found');
  }
  if (offer.status !== VendorDayOfferStatus.OPEN) {
    throw new Error('Offer is no longer open');
  }

  if (input.decision === 'decline') {
    await prisma.vendorDayOffer.update({
      where: { id: offer.id },
      data: { status: VendorDayOfferStatus.DECLINED, respondedAt: new Date() },
    });
    await appendAuditEvent({
      orgId: input.orgId,
      actorClerkUserId: input.actor.userId,
      actorEmail: input.actor.email,
      action: 'vendor_day.offer.declined',
      entityType: 'VendorDayOffer',
      entityId: offer.id,
      metadata: { requestId: offer.requestId, workerProfileId: worker.id },
    });
    await syncVendorDayArchiveSafely(() =>
      syncVendorDayArchiveForRequestId({
        orgId: input.orgId,
        requestId: offer.requestId,
        actor: {
          userId: input.actor.userId,
          email: input.actor.email,
        },
      }),
    );
    return { accepted: false };
  }

  const policy = asPolicyValues(offer.request.policySnapshot?.values ?? DEFAULT_PICC_POLICY_VALUES);
  const oneWayTravel = deriveOneWayTravel({
    homeLat: worker.homeLat,
    homeLng: worker.homeLng,
    storeLat: offer.request.account.geoLat,
    storeLng: offer.request.account.geoLng,
  });
  const eventPayAmount = offer.request.requestedDurationHours * policy.eventPayRateDollars;
  const travelPayAmount =
    oneWayTravel.travelMinutesOneWay != null && oneWayTravel.travelMinutesOneWay > policy.oneWayTravelThresholdMinutes
      ? Number((((oneWayTravel.travelMinutesOneWay * 2) / 60) * policy.travelPayRateDollars).toFixed(2))
      : 0;

  const assignment = await prisma.$transaction(async (tx) => {
    const current = await tx.vendorDayOffer.findUnique({
      where: { id: offer.id },
      select: { status: true, requestId: true },
    });
    if (!current || current.status !== VendorDayOfferStatus.OPEN) {
      throw new Error('Offer is no longer open');
    }

    await tx.vendorDayOffer.update({
      where: { id: offer.id },
      data: { status: VendorDayOfferStatus.ACCEPTED, respondedAt: new Date() },
    });

    await tx.vendorDayOffer.updateMany({
      where: {
        requestId: offer.requestId,
        id: { not: offer.id },
        status: VendorDayOfferStatus.OPEN,
      },
      data: { status: VendorDayOfferStatus.WITHDRAWN, respondedAt: new Date() },
    });

    await tx.vendorDayRequest.update({
      where: { id: offer.requestId },
      data: { status: VendorDayRequestStatus.ASSIGNED },
    });

    return tx.vendorDayAssignment.upsert({
      where: {
        requestId_workerProfileId: {
          requestId: offer.requestId,
          workerProfileId: worker.id,
        },
      },
      update: {
        acceptedOfferId: offer.id,
        status: VendorDayAssignmentStatus.ASSIGNED,
        scheduledStart: offer.request.requestedStart,
        scheduledEnd: offer.request.requestedEnd,
        travelMinutesOneWay: oneWayTravel.travelMinutesOneWay,
        travelMilesOneWay: oneWayTravel.travelMilesOneWay,
        eventPayRateDollars: policy.eventPayRateDollars,
        travelPayRateDollars: policy.travelPayRateDollars,
        oneWayTravelThresholdMin: policy.oneWayTravelThresholdMinutes,
        eventPayAmount,
        travelPayAmount,
        override60DayWindow: offer.request.override60DayWindow,
        overrideReason: offer.request.overrideReason,
        policySnapshotId: offer.request.policySnapshotId,
      },
      create: {
        orgId: input.orgId,
        requestId: offer.requestId,
        workerProfileId: worker.id,
        acceptedOfferId: offer.id,
        status: VendorDayAssignmentStatus.ASSIGNED,
        scheduledStart: offer.request.requestedStart,
        scheduledEnd: offer.request.requestedEnd,
        travelMinutesOneWay: oneWayTravel.travelMinutesOneWay,
        travelMilesOneWay: oneWayTravel.travelMilesOneWay,
        eventPayRateDollars: policy.eventPayRateDollars,
        travelPayRateDollars: policy.travelPayRateDollars,
        oneWayTravelThresholdMin: policy.oneWayTravelThresholdMinutes,
        eventPayAmount,
        travelPayAmount,
        override60DayWindow: offer.request.override60DayWindow,
        overrideReason: offer.request.overrideReason,
        policySnapshotId: offer.request.policySnapshotId,
      },
    });
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor.userId,
    actorEmail: input.actor.email,
    action: 'vendor_day.offer.accepted',
    entityType: 'VendorDayAssignment',
    entityId: assignment.id,
    metadata: {
      requestId: offer.requestId,
      workerProfileId: worker.id,
      eventPayAmount,
      travelPayAmount,
    },
  });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForRequestId({
      orgId: input.orgId,
      requestId: offer.requestId,
      actor: {
        userId: input.actor.userId,
        email: input.actor.email,
      },
    }),
  );

  return { accepted: true, assignmentId: assignment.id };
}

export async function passOffAssignment(input: {
  orgId: string;
  assignmentId: string;
  reason: string;
  actor: { userId: string; email: string };
}) {
  const assignment = await prisma.vendorDayAssignment.findFirst({
    where: { id: input.assignmentId, orgId: input.orgId },
    include: { request: { include: { policySnapshot: true } }, workerProfile: true },
  });
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  if (assignment.workerProfile.clerkUserId !== input.actor.userId && assignment.workerProfile.email !== input.actor.email) {
    throw new Error('Only the assigned BA can pass off this vendor day');
  }

  const policy = asPolicyValues(assignment.request.policySnapshot?.values ?? DEFAULT_PICC_POLICY_VALUES);
  const cutoffTime = new Date(assignment.scheduledStart.getTime() - policy.passOffCutoffHours * 60 * 60 * 1000);
  if (Date.now() > cutoffTime.getTime()) {
    throw new Error('Pass-off window has closed');
  }

  await prisma.$transaction(async (tx) => {
    await tx.vendorDayAssignment.update({
      where: { id: assignment.id },
      data: {
        status: VendorDayAssignmentStatus.PASSED_OFF,
        passOffRequestedAt: new Date(),
        passOffReason: input.reason.trim(),
      },
    });

    await tx.vendorDayRequest.update({
      where: { id: assignment.requestId },
      data: { status: VendorDayRequestStatus.PASSED_OFF },
    });
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor.userId,
    actorEmail: input.actor.email,
    action: 'vendor_day.assignment.passed_off',
    entityType: 'VendorDayAssignment',
    entityId: assignment.id,
    reason: input.reason.trim(),
    metadata: {
      requestId: assignment.requestId,
      workerProfileId: assignment.workerProfileId,
    },
  });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForRequestId({
      orgId: input.orgId,
      requestId: assignment.requestId,
      actor: {
        userId: input.actor.userId,
        email: input.actor.email,
      },
    }),
  );

  return dispatchVendorDayRequest({
    orgId: input.orgId,
    requestId: assignment.requestId,
    actor: input.actor,
    excludeWorkerProfileIds: [assignment.workerProfileId],
  });
}

export async function upsertExecutionArtifact(input: {
  orgId: string;
  assignmentId: string;
  type: VendorDayArtifactType;
  storageUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  syncStatus?: string | null;
}) {
  const execution = await prisma.vendorDayExecution.upsert({
    where: { assignmentId: input.assignmentId },
    update: {},
    create: {
      orgId: input.orgId,
      assignmentId: input.assignmentId,
    },
  });

  const artifact = await prisma.vendorDayArtifact.create({
    data: {
      orgId: input.orgId,
      executionId: execution.id,
      type: input.type,
      storageUrl: input.storageUrl,
      originalName: input.originalName ?? null,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      syncStatus: input.syncStatus ?? 'synced',
    },
  });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForAssignmentId({
      orgId: input.orgId,
      assignmentId: input.assignmentId,
      actor: undefined,
    }),
  );

  return artifact;
}

export async function checkInVendorDay(input: {
  orgId: string;
  assignmentId: string;
  actor: { userId: string; email: string };
  geoLat?: number | null;
  geoLng?: number | null;
  accuracyMeters?: number | null;
  locationUnavailable?: boolean;
  distanceFlagged?: boolean;
  notes?: string | null;
}) {
  const assignment = await prisma.vendorDayAssignment.findFirst({
    where: { id: input.assignmentId, orgId: input.orgId },
    include: { workerProfile: true },
  });
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  if (assignment.workerProfile.clerkUserId !== input.actor.userId && assignment.workerProfile.email !== input.actor.email) {
    throw new Error('Only the assigned BA can check in');
  }

  const execution = await prisma.vendorDayExecution.upsert({
    where: { assignmentId: assignment.id },
    update: {
      checkInAt: new Date(),
      checkInGeoLat: input.geoLat ?? null,
      checkInGeoLng: input.geoLng ?? null,
      checkInAccuracyMeters: input.accuracyMeters ?? null,
      locationUnavailable: Boolean(input.locationUnavailable),
      distanceFlagged: Boolean(input.distanceFlagged),
      checkInNotes: input.notes?.trim() || null,
    },
    create: {
      orgId: input.orgId,
      assignmentId: assignment.id,
      checkInAt: new Date(),
      checkInGeoLat: input.geoLat ?? null,
      checkInGeoLng: input.geoLng ?? null,
      checkInAccuracyMeters: input.accuracyMeters ?? null,
      locationUnavailable: Boolean(input.locationUnavailable),
      distanceFlagged: Boolean(input.distanceFlagged),
      checkInNotes: input.notes?.trim() || null,
    },
  });

  await prisma.vendorDayAssignment.update({
    where: { id: assignment.id },
    data: { status: VendorDayAssignmentStatus.CHECKED_IN },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor.userId,
    actorEmail: input.actor.email,
    action: 'vendor_day.execution.checked_in',
    entityType: 'VendorDayExecution',
    entityId: execution.id,
      metadata: { assignmentId: assignment.id },
    });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForAssignmentId({
      orgId: input.orgId,
      assignmentId: assignment.id,
      actor: {
        userId: input.actor.userId,
        email: input.actor.email,
      },
    }),
  );

  return execution;
}

export async function checkOutVendorDay(input: {
  orgId: string;
  assignmentId: string;
  actor: { userId: string; email: string };
  geoLat?: number | null;
  geoLng?: number | null;
  accuracyMeters?: number | null;
  locationUnavailable?: boolean;
  distanceFlagged?: boolean;
  pendingArtifactSync?: boolean;
  pennyBundleStatus?: string | null;
  trafficLevel?: string | null;
  budtenderEngagementScore?: number | null;
  checkOutNotes?: string | null;
  restockNeeded?: string | null;
  objections?: string | null;
  bestConversation?: string | null;
}) {
  const assignment = await prisma.vendorDayAssignment.findFirst({
    where: { id: input.assignmentId, orgId: input.orgId },
    include: { workerProfile: true, request: true, execution: { include: { artifacts: true } } },
  });
  if (!assignment) {
    throw new Error('Assignment not found');
  }

  if (assignment.workerProfile.clerkUserId !== input.actor.userId && assignment.workerProfile.email !== input.actor.email) {
    throw new Error('Only the assigned BA can check out');
  }

  const artifactCount = assignment.execution?.artifacts.filter((artifact) => artifact.type === VendorDayArtifactType.POS_REPORT || artifact.type === VendorDayArtifactType.SCREENSHOT).length ?? 0;
  const hasCheckInPhoto = (assignment.execution?.artifacts ?? []).some((artifact) => artifact.type === VendorDayArtifactType.CHECK_IN_PHOTO);
  const hasCheckOutPhoto = (assignment.execution?.artifacts ?? []).some((artifact) => artifact.type === VendorDayArtifactType.CHECK_OUT_PHOTO);
  const bundleActive = ['accepted', 'offered', 'pending credit'].includes(normalizeStatus(input.pennyBundleStatus));
  if (!input.pendingArtifactSync && !hasCheckInPhoto) {
    throw new Error('Setup photo is required before checkout');
  }
  if (!input.pendingArtifactSync && !hasCheckOutPhoto) {
    throw new Error('End photo is required before checkout');
  }
  if (!input.checkOutNotes?.trim()) {
    throw new Error('Checkout notes are required before checkout');
  }
  if (!input.trafficLevel?.trim()) {
    throw new Error('Traffic level is required before checkout');
  }
  if (input.budtenderEngagementScore == null) {
    throw new Error('Budtender engagement score is required before checkout');
  }
  if ((assignment.request.pennyBundleRequested || bundleActive) && artifactCount === 0 && !input.pendingArtifactSync) {
    throw new Error('Penny Bundle proof is required before checkout');
  }

  const execution = await prisma.vendorDayExecution.upsert({
    where: { assignmentId: assignment.id },
    update: {
      checkOutAt: new Date(),
      checkOutGeoLat: input.geoLat ?? null,
      checkOutGeoLng: input.geoLng ?? null,
      checkOutAccuracyMeters: input.accuracyMeters ?? null,
      locationUnavailable: Boolean(input.locationUnavailable),
      distanceFlagged: Boolean(input.distanceFlagged),
      pendingArtifactSync: Boolean(input.pendingArtifactSync),
      pennyBundleStatus: input.pennyBundleStatus?.trim() || null,
      trafficLevel: input.trafficLevel?.trim() || null,
      budtenderEngagementScore: input.budtenderEngagementScore ?? null,
      checkOutNotes: input.checkOutNotes?.trim() || null,
      restockNeeded: input.restockNeeded?.trim() || null,
      objections: input.objections?.trim() || null,
      bestConversation: input.bestConversation?.trim() || null,
    },
    create: {
      orgId: input.orgId,
      assignmentId: assignment.id,
      checkOutAt: new Date(),
      checkOutGeoLat: input.geoLat ?? null,
      checkOutGeoLng: input.geoLng ?? null,
      checkOutAccuracyMeters: input.accuracyMeters ?? null,
      locationUnavailable: Boolean(input.locationUnavailable),
      distanceFlagged: Boolean(input.distanceFlagged),
      pendingArtifactSync: Boolean(input.pendingArtifactSync),
      pennyBundleStatus: input.pennyBundleStatus?.trim() || null,
      trafficLevel: input.trafficLevel?.trim() || null,
      budtenderEngagementScore: input.budtenderEngagementScore ?? null,
      checkOutNotes: input.checkOutNotes?.trim() || null,
      restockNeeded: input.restockNeeded?.trim() || null,
      objections: input.objections?.trim() || null,
      bestConversation: input.bestConversation?.trim() || null,
    },
  });

  await prisma.vendorDayAssignment.update({
    where: { id: assignment.id },
    data: { status: VendorDayAssignmentStatus.CHECKED_OUT },
  });
  await prisma.vendorDayRequest.update({
    where: { id: assignment.requestId },
    data: { status: VendorDayRequestStatus.COMPLETED },
  });

  await appendAuditEvent({
    orgId: input.orgId,
    actorClerkUserId: input.actor.userId,
    actorEmail: input.actor.email,
    action: 'vendor_day.execution.checked_out',
    entityType: 'VendorDayExecution',
    entityId: execution.id,
    metadata: {
      assignmentId: assignment.id,
      pendingArtifactSync: Boolean(input.pendingArtifactSync),
      pennyBundleStatus: input.pennyBundleStatus ?? null,
    },
  });

  await ensurePayrollLineItemForAssignment({
    orgId: input.orgId,
    assignmentId: assignment.id,
    actor: {
      userId: input.actor.userId,
      email: input.actor.email,
    },
  });
  await ensureVendorDayRoiSnapshot({
    orgId: input.orgId,
    assignmentId: assignment.id,
    actor: {
      userId: input.actor.userId,
      email: input.actor.email,
    },
  });

  await syncVendorDayArchiveSafely(() =>
    syncVendorDayArchiveForAssignmentId({
      orgId: input.orgId,
      assignmentId: assignment.id,
      actor: {
        userId: input.actor.userId,
        email: input.actor.email,
      },
    }),
  );

  return execution;
}

export async function listVendorDayWorkspaceData(input: {
  orgId: string;
  viewerUserId?: string | null;
  viewerRole?: Role | null;
  viewerEmail?: string | null;
}) {
  const worker =
    input.viewerUserId || input.viewerEmail
      ? await prisma.workerProfile.findFirst({
          where: {
            orgId: input.orgId,
            OR: [
              ...(input.viewerUserId ? [{ clerkUserId: input.viewerUserId }] : []),
              ...(input.viewerEmail ? [{ email: input.viewerEmail }] : []),
            ],
          },
        })
      : null;

  const isBrandAmbassador = input.viewerRole === Role.BRAND_AMBASSADOR;

  const [requests, assignments, accounts, workers] = await Promise.all([
    prisma.vendorDayRequest.findMany({
      where: {
        orgId: input.orgId,
        ...(isBrandAmbassador && worker
          ? {
              OR: [
                {
                  offers: {
                    some: {
                      workerProfileId: worker.id,
                    },
                  },
                },
                {
                  assignments: {
                    some: {
                      workerProfileId: worker.id,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        account: true,
        offers: {
          where: isBrandAmbassador && worker ? { workerProfileId: worker.id } : undefined,
          include: {
            workerProfile: true,
          },
          orderBy: [{ rankScore: 'desc' }, { createdAt: 'asc' }],
        },
        assignments: {
          where: isBrandAmbassador && worker ? { workerProfileId: worker.id } : undefined,
          include: {
            workerProfile: true,
            execution: {
              include: { artifacts: true },
            },
          },
        },
      },
      orderBy: [{ requestedStart: 'asc' }, { createdAt: 'desc' }],
      take: isBrandAmbassador ? 40 : 120,
    }),
    prisma.vendorDayAssignment.findMany({
      where: {
        orgId: input.orgId,
        ...(isBrandAmbassador && worker ? { workerProfileId: worker.id } : {}),
      },
      include: {
        request: { include: { account: true } },
        execution: { include: { artifacts: true } },
      },
      orderBy: [{ scheduledStart: 'asc' }],
      take: isBrandAmbassador ? 30 : 60,
    }),
    isBrandAmbassador
      ? Promise.resolve([])
      : prisma.account.findMany({
          where: { orgId: input.orgId, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            licensedLocationId: true,
            nabisRetailerId: true,
          },
          orderBy: { name: 'asc' },
          take: 400,
        }),
    isBrandAmbassador
      ? Promise.resolve([])
      : prisma.workerProfile.findMany({
          where: { orgId: input.orgId, active: true },
          orderBy: { displayName: 'asc' },
        }),
  ]);

  const requestIds = requests.map((request) => request.id);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const executionIds = assignments.map((assignment) => assignment.execution?.id).filter((value): value is string => Boolean(value));

  const archiveMaps = await prisma.externalRecordMap.findMany({
    where: {
      orgId: input.orgId,
      provider: 'NOTION',
      OR: [
        ...(requestIds.length > 0 ? [{ localModel: 'VendorDayRequest', externalId: { in: requestIds } }] : []),
        ...(assignmentIds.length > 0 ? [{ localModel: 'VendorDayAssignment', externalId: { in: assignmentIds } }] : []),
        ...(executionIds.length > 0 ? [{ localModel: 'VendorDayExecution', externalId: { in: executionIds } }] : []),
      ],
    },
    select: {
      localModel: true,
      externalId: true,
      localId: true,
    },
  });

  const requestArchiveMap = new Map(
    archiveMaps.filter((entry) => entry.localModel === 'VendorDayRequest').map((entry) => [entry.externalId, entry.localId]),
  );
  const assignmentArchiveMap = new Map(
    archiveMaps.filter((entry) => entry.localModel === 'VendorDayAssignment').map((entry) => [entry.externalId, entry.localId]),
  );
  const executionArchiveMap = new Map(
    archiveMaps.filter((entry) => entry.localModel === 'VendorDayExecution').map((entry) => [entry.externalId, entry.localId]),
  );

  const enrichedRequests = requests.map((request) => {
    const pageId = requestArchiveMap.get(request.id) ?? null;
    return {
      ...request,
      notionArchivePageId: pageId,
      notionArchiveUrl: notionPageUrl(pageId),
    };
  });

  const enrichedAssignments = assignments.map((assignment) => {
    const assignmentPageId = assignmentArchiveMap.get(assignment.id) ?? null;
    const executionPageId = assignment.execution?.id ? executionArchiveMap.get(assignment.execution.id) ?? null : null;
    const requestPageId = requestArchiveMap.get(assignment.requestId) ?? null;
    const notionArchivePageId = assignmentPageId ?? executionPageId ?? requestPageId;
    return {
      ...assignment,
      notionArchivePageId,
      notionArchiveUrl: notionPageUrl(notionArchivePageId),
      execution: assignment.execution
        ? {
            ...assignment.execution,
            notionArchivePageId: executionPageId ?? notionArchivePageId,
            notionArchiveUrl: notionPageUrl(executionPageId ?? notionArchivePageId),
          }
        : assignment.execution,
    };
  });

  return {
    viewerWorkerProfileId: worker?.id ?? null,
    requests: enrichedRequests,
    assignments: enrichedAssignments,
    accounts,
    workers,
  };
}

export async function listPublicEligibleStores(orgId: string) {
  const accounts = await prisma.account.findMany({
    where: {
      orgId,
      status: 'ACTIVE',
      licensedLocationId: { not: null },
      vendorDaySuppressed: false,
    },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      licensedLocationId: true,
    },
    orderBy: { name: 'asc' },
    take: 500,
  });

  const results = [];
  for (const account of accounts) {
    const [liveConflict, lastVendorDayAt] = await Promise.all([
      hasConflictingLiveRequest(orgId, account.id),
      getLastVendorDayAt(orgId, account.id),
    ]);

    const daysSinceLastVendorDay = lastVendorDayAt
      ? Math.floor((Date.now() - lastVendorDayAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const eligible = !liveConflict && (daysSinceLastVendorDay == null || daysSinceLastVendorDay >= DEFAULT_PICC_POLICY_VALUES.cooldownDays);

    if (!eligible) continue;

    results.push({
      ...account,
      daysSinceLastVendorDay,
    });
  }

  return results;
}

export async function runVendorDayMaintenance(orgId: string) {
  const policySnapshot = await ensureActivePolicySnapshot(orgId);
  const policy = asPolicyValues(policySnapshot.values);
  const now = new Date();

  const expiredOffers = await prisma.vendorDayOffer.findMany({
    where: {
      orgId,
      status: VendorDayOfferStatus.OPEN,
      expiresAt: {
        lte: now,
      },
    },
    select: {
      id: true,
      requestId: true,
    },
  });

  const expiredOfferIds = expiredOffers.map((offer) => offer.id);
  if (expiredOfferIds.length > 0) {
    await prisma.vendorDayOffer.updateMany({
      where: { id: { in: expiredOfferIds } },
      data: {
        status: VendorDayOfferStatus.EXPIRED,
        respondedAt: now,
      },
    });
  }

  const expiredRequestIds = [...new Set(expiredOffers.map((offer) => offer.requestId))];
  for (const requestId of expiredRequestIds) {
    const acceptedCount = await prisma.vendorDayAssignment.count({
      where: {
        orgId,
        requestId,
        status: {
          in: [
            VendorDayAssignmentStatus.ASSIGNED,
            VendorDayAssignmentStatus.CHECKED_IN,
            VendorDayAssignmentStatus.CHECKED_OUT,
            VendorDayAssignmentStatus.COMPLETED,
          ],
        },
      },
    });
    const openOfferCount = await prisma.vendorDayOffer.count({
      where: {
        orgId,
        requestId,
        status: VendorDayOfferStatus.OPEN,
      },
    });
    if (acceptedCount === 0 && openOfferCount === 0) {
      await prisma.vendorDayRequest.update({
        where: { id: requestId },
        data: { status: VendorDayRequestStatus.EXCEPTION },
      });
      await appendAuditEvent({
        orgId,
        action: 'vendor_day.offers.expired_to_exception',
        entityType: 'VendorDayRequest',
        entityId: requestId,
        metadata: { expiredAt: now.toISOString() },
      });
    }
  }

  const noShowCutoff = new Date(now.getTime() - policy.noShowGracePeriodMinutes * 60 * 1000);
  const noShowAssignments = await prisma.vendorDayAssignment.findMany({
    where: {
      orgId,
      status: VendorDayAssignmentStatus.ASSIGNED,
      scheduledStart: {
        lte: noShowCutoff,
      },
      execution: {
        is: null,
      },
    },
    select: {
      id: true,
      requestId: true,
    },
  });

  for (const assignment of noShowAssignments) {
    await prisma.vendorDayAssignment.update({
      where: { id: assignment.id },
      data: { status: VendorDayAssignmentStatus.NO_SHOW },
    });
    await prisma.vendorDayRequest.update({
      where: { id: assignment.requestId },
      data: { status: VendorDayRequestStatus.NO_SHOW },
    });
    await appendAuditEvent({
      orgId,
      action: 'vendor_day.assignment.auto_no_show',
      entityType: 'VendorDayAssignment',
      entityId: assignment.id,
      metadata: {
        requestId: assignment.requestId,
        gracePeriodMinutes: policy.noShowGracePeriodMinutes,
      },
    });
  }

  return {
    expiredOffers: expiredOfferIds.length,
    requestsEscalated: expiredRequestIds.length,
    noShowsMarked: noShowAssignments.length,
  };
}
