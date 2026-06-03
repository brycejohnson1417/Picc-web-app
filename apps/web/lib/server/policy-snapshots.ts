import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export interface PiccPolicyValues {
  cooldownDays: number;
  standardEventDurationHours: number;
  fourHourEventRequiresAdminApproval: boolean;
  offerWindowHours: number;
  eventPayRateDollars: number;
  travelPayRateDollars: number;
  oneWayTravelThresholdMinutes: number;
  passOffCutoffHours: number;
  noShowGracePeriodMinutes: number;
  priorityWeights: {
    daysSinceLastVendorDay: number;
    orderVelocity: number;
    accountValue: number;
    neverHadVendorDay: number;
    repRequestFlag: number;
    reorderPotential: number;
    preferredPartner: number;
  };
}

export const DEFAULT_PICC_POLICY_VALUES: PiccPolicyValues = {
  cooldownDays: 60,
  standardEventDurationHours: 3,
  fourHourEventRequiresAdminApproval: true,
  offerWindowHours: 4,
  eventPayRateDollars: 50,
  travelPayRateDollars: 25,
  oneWayTravelThresholdMinutes: 60,
  passOffCutoffHours: 12,
  noShowGracePeriodMinutes: 30,
  priorityWeights: {
    daysSinceLastVendorDay: 30,
    orderVelocity: 20,
    accountValue: 15,
    neverHadVendorDay: 10,
    repRequestFlag: 10,
    reorderPotential: 10,
    preferredPartner: 5,
  },
};

export async function ensureActivePolicySnapshot(orgId: string, actor?: { clerkUserId?: string | null; email?: string | null }) {
  const existing = await prisma.policySnapshot.findFirst({
    where: { orgId },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });

  if (existing) {
    return existing;
  }

  return prisma.policySnapshot.create({
    data: {
      orgId,
      name: 'Launch defaults',
      values: DEFAULT_PICC_POLICY_VALUES as unknown as Prisma.InputJsonValue,
      createdByClerkUserId: actor?.clerkUserId ?? null,
      createdByEmail: actor?.email ?? null,
      reason: 'Seeded automatically from application defaults.',
    },
  });
}
