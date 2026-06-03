import { NextResponse } from 'next/server';
import {
  CalendarConnectionProvider,
  CalendarConnectionStatus,
  NotificationCategory,
  Role,
  WorkerSkillTier,
} from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { listWorkerSupplyData, saveWorkerSupplyData, updateWorkerCalendarConnection } from '@/lib/server/worker-supply';

export const dynamic = 'force-dynamic';

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  timezone: z.string().trim().optional(),
  active: z.boolean().optional(),
});

const availabilityBlockSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional().nullable(),
  source: z.string().trim().max(64).optional(),
});

const saveProfileSchema = z.object({
  action: z.literal('save_profile'),
  workerProfileId: z.string().cuid().optional().nullable(),
  displayName: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(64).optional().nullable(),
  photoUrl: z.string().trim().max(2000).optional().nullable(),
  homeAddress: z.string().trim().max(500).optional().nullable(),
  homeLat: z.number().optional().nullable(),
  homeLng: z.number().optional().nullable(),
  maxTravelMinutes: z.number().int().min(0).max(600).optional(),
  travelRadiusMiles: z.number().min(0).max(300).optional().nullable(),
  hasVehicle: z.boolean().optional(),
  vehicleType: z.string().trim().max(120).optional().nullable(),
  employerId: z.string().cuid().optional().nullable(),
  employerName: z.string().trim().max(160).optional().nullable(),
  tier: z.nativeEnum(WorkerSkillTier).optional(),
  canAcceptOffers: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  availabilityRules: z.array(availabilityRuleSchema).optional(),
  availabilityBlocks: z.array(availabilityBlockSchema).optional(),
  gearItems: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(100).optional(),
        notes: z.string().trim().max(500).optional().nullable(),
        needsRestock: z.boolean().optional(),
      }),
    )
    .optional(),
  certifications: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(120),
        label: z.string().trim().max(160).optional(),
        certifiedAt: z.string().datetime().optional().nullable(),
        expiresAt: z.string().datetime().optional().nullable(),
      }),
    )
    .optional(),
  brandTrainings: z
    .array(
      z.object({
        brandName: z.string().trim().min(1).max(160),
        level: z.string().trim().max(120).optional().nullable(),
        trainedAt: z.string().datetime().optional().nullable(),
      }),
    )
    .optional(),
  skillTags: z
    .array(
      z.object({
        tag: z.string().trim().min(1).max(120),
        label: z.string().trim().max(160).optional().nullable(),
      }),
    )
    .optional(),
  notificationPreferences: z
    .array(
      z.object({
        category: z.nativeEnum(NotificationCategory),
        emailEnabled: z.boolean().optional(),
        inAppEnabled: z.boolean().optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStartMinute: z.number().int().min(0).max(1439).optional(),
        quietHoursEndMinute: z.number().int().min(0).max(1439).optional(),
        timezone: z.string().trim().max(120).optional(),
      }),
    )
    .optional(),
});

const updateConnectionSchema = z.object({
  action: z.literal('update_calendar_connection'),
  workerProfileId: z.string().cuid().optional().nullable(),
  provider: z.nativeEnum(CalendarConnectionProvider),
  calendarEmail: z.string().trim().email().optional().nullable(),
  status: z.nativeEnum(CalendarConnectionStatus).optional(),
  lastSuccessfulSyncAt: z.string().datetime().optional().nullable(),
  lastAttemptAt: z.string().datetime().optional().nullable(),
  accessTokenExpiresAt: z.string().datetime().optional().nullable(),
  revokedAt: z.string().datetime().optional().nullable(),
  lastError: z.string().trim().max(500).optional().nullable(),
});

const patchSchema = z.discriminatedUnion('action', [saveProfileSchema, updateConnectionSchema]);

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await listWorkerSupplyData({
      orgId: ctx.orgId,
      actor: {
        userId: ctx.userId,
        email: ctx.email ?? null,
        role: ctx.role as Role,
      },
      includeAll: ['ADMIN', 'OPS_TEAM'].includes(ctx.role ?? ''),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load worker supply settings' });
  }
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, patchSchema);

    if (payload.action === 'save_profile') {
      const result = await saveWorkerSupplyData({
        orgId: ctx.orgId,
        actor: {
          userId: ctx.userId,
          email: ctx.email ?? null,
          role: ctx.role as Role,
        },
        workerProfileId: payload.workerProfileId,
        displayName: payload.displayName,
        phone: payload.phone,
        photoUrl: payload.photoUrl,
        homeAddress: payload.homeAddress,
        homeLat: payload.homeLat,
        homeLng: payload.homeLng,
        maxTravelMinutes: payload.maxTravelMinutes,
        travelRadiusMiles: payload.travelRadiusMiles,
        hasVehicle: payload.hasVehicle,
        vehicleType: payload.vehicleType,
        employerId: payload.employerId,
        employerName: payload.employerName,
        tier: payload.tier,
        canAcceptOffers: payload.canAcceptOffers,
        notes: payload.notes,
        availabilityRules: payload.availabilityRules,
        availabilityBlocks: payload.availabilityBlocks?.map((block) => ({
          startsAt: new Date(block.startsAt),
          endsAt: new Date(block.endsAt),
          reason: block.reason,
          source: block.source,
        })),
        gearItems: payload.gearItems,
        certifications: payload.certifications?.map((certification) => ({
          code: certification.code,
          label: certification.label,
          certifiedAt: certification.certifiedAt ? new Date(certification.certifiedAt) : null,
          expiresAt: certification.expiresAt ? new Date(certification.expiresAt) : null,
        })),
        brandTrainings: payload.brandTrainings?.map((training) => ({
          brandName: training.brandName,
          level: training.level,
          trainedAt: training.trainedAt ? new Date(training.trainedAt) : null,
        })),
        skillTags: payload.skillTags,
        notificationPreferences: payload.notificationPreferences,
      });
      return NextResponse.json(result);
    }

    const connection = await updateWorkerCalendarConnection({
      orgId: ctx.orgId,
      actor: {
        userId: ctx.userId,
        email: ctx.email ?? null,
        role: ctx.role as Role,
      },
      workerProfileId: payload.workerProfileId,
      provider: payload.provider,
      calendarEmail: payload.calendarEmail,
      status: payload.status,
      lastSuccessfulSyncAt: payload.lastSuccessfulSyncAt ? new Date(payload.lastSuccessfulSyncAt) : null,
      lastAttemptAt: payload.lastAttemptAt ? new Date(payload.lastAttemptAt) : null,
      accessTokenExpiresAt: payload.accessTokenExpiresAt ? new Date(payload.accessTokenExpiresAt) : null,
      revokedAt: payload.revokedAt ? new Date(payload.revokedAt) : null,
      lastError: payload.lastError,
    });
    return NextResponse.json(connection);
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to update worker supply settings',
      zodMessage: 'Invalid worker supply payload',
      statusByMessage: {
        'Worker profile not found': 404,
        'Only admin or ops can edit other workers': 403,
        'Only admin or ops can update other workers': 403,
      },
    });
  }
}
