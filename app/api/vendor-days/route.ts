import { NextResponse } from 'next/server';
import { Role, VendorDayArtifactType, VendorDayRequestSource, VendorDayRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import {
  checkInVendorDay,
  checkOutVendorDay,
  createVendorDayRequest,
  dispatchVendorDayRequest,
  listVendorDayWorkspaceData,
  passOffAssignment,
  respondToVendorDayOffer,
  upsertExecutionArtifact,
} from '@/lib/server/vendor-day-ops';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const createRequestSchema = z.object({
  accountId: z.string().cuid(),
  requestedStart: z.string().datetime(),
  alternateStart: z.string().datetime().optional().nullable(),
  requestedDurationHours: z.number().int().min(1).max(8).optional(),
  pennyBundleRequested: z.boolean().optional(),
  preferredWorkerProfileId: z.string().cuid().optional().nullable(),
  override60DayWindow: z.boolean().optional(),
  overrideReason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('dispatch'),
    requestId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('approve_duration_override'),
    requestId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('approve_rep_request'),
    requestId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('mark_no_show'),
    requestId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('respond_offer'),
    offerId: z.string().cuid(),
    decision: z.enum(['accept', 'decline']),
  }),
  z.object({
    action: z.literal('pass_off'),
    assignmentId: z.string().cuid(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal('add_artifact'),
    assignmentId: z.string().cuid(),
    type: z.nativeEnum(VendorDayArtifactType),
    storageUrl: z.string().min(1),
    originalName: z.string().optional().nullable(),
    mimeType: z.string().optional().nullable(),
    sizeBytes: z.number().int().optional().nullable(),
    syncStatus: z.string().trim().optional().nullable(),
  }),
  z.object({
    action: z.literal('check_in'),
    assignmentId: z.string().cuid(),
    geoLat: z.number().optional().nullable(),
    geoLng: z.number().optional().nullable(),
    accuracyMeters: z.number().optional().nullable(),
    locationUnavailable: z.boolean().optional(),
    distanceFlagged: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
  z.object({
    action: z.literal('check_out'),
    assignmentId: z.string().cuid(),
    geoLat: z.number().optional().nullable(),
    geoLng: z.number().optional().nullable(),
    accuracyMeters: z.number().optional().nullable(),
    locationUnavailable: z.boolean().optional(),
    distanceFlagged: z.boolean().optional(),
    pendingArtifactSync: z.boolean().optional(),
    pennyBundleStatus: z.string().trim().max(120).optional().nullable(),
    trafficLevel: z.string().trim().max(120).optional().nullable(),
    budtenderEngagementScore: z.number().int().min(1).max(5).optional().nullable(),
    checkOutNotes: z.string().trim().max(2000).optional().nullable(),
    restockNeeded: z.string().trim().max(500).optional().nullable(),
    objections: z.string().trim().max(500).optional().nullable(),
    bestConversation: z.string().trim().max(500).optional().nullable(),
  }),
]);

function createSourceForRole(role: Role): VendorDayRequestSource {
  switch (role) {
    case Role.BRAND_AMBASSADOR:
      return VendorDayRequestSource.BA_REQUESTED;
    case Role.ADMIN:
      return VendorDayRequestSource.ADMIN_REQUESTED;
    case Role.OPS_TEAM:
      return VendorDayRequestSource.OPS_REQUESTED;
    default:
      return VendorDayRequestSource.REP_REQUESTED;
  }
}

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'FINANCE', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await listVendorDayWorkspaceData({
      orgId: ctx.orgId,
      viewerUserId: ctx.userId,
      viewerRole: ctx.role as Role,
      viewerEmail: ctx.email ?? null,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load vendor-day workspace' });
  }
}

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, createRequestSchema);
    const currentRole = ctx.role ?? 'SALES_REP';
    if (payload.override60DayWindow && !['ADMIN', 'OPS_TEAM', 'SALES_REP'].includes(currentRole)) {
      return NextResponse.json({ error: 'Only reps, ops, or admin can override the 60-day window' }, { status: 403 });
    }
    if (payload.requestedDurationHours === 4 && currentRole !== 'ADMIN') {
      // allowed, but held for admin approval
    }

    const vendorDayRequest = await createVendorDayRequest({
      orgId: ctx.orgId,
      accountId: payload.accountId,
      source: createSourceForRole(currentRole as Role),
      requestedStart: new Date(payload.requestedStart),
      alternateStart: payload.alternateStart ? new Date(payload.alternateStart) : null,
      requestedDurationHours: payload.requestedDurationHours,
      pennyBundleRequested: payload.pennyBundleRequested,
      preferredWorkerProfileId: payload.preferredWorkerProfileId,
      override60DayWindow: payload.override60DayWindow,
      overrideReason: payload.overrideReason,
      notes: payload.notes,
      actor: {
        userId: ctx.userId,
        email: ctx.email ?? null,
        role: currentRole as Role,
      },
    });

    return NextResponse.json(vendorDayRequest, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create vendor-day request',
      zodMessage: 'Invalid vendor-day request payload',
      statusByMessage: {
        'Account not found': 404,
        'Store already has an active vendor-day request or assignment': 409,
        'Store is inside the 60-day cooldown window': 409,
        'Override 60-Day Window requires a reason': 400,
      },
    });
  }
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'FINANCE', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, actionSchema);
    const currentRole = ctx.role ?? 'SALES_REP';

    if (payload.action === 'dispatch') {
      if (!['ADMIN', 'OPS_TEAM', 'SALES_REP'].includes(currentRole)) {
        return NextResponse.json({ error: 'Only reps, ops, or admin can dispatch vendor-day requests' }, { status: 403 });
      }
      const result = await dispatchVendorDayRequest({
        orgId: ctx.orgId,
        requestId: payload.requestId,
        actor: { userId: ctx.userId, email: ctx.email ?? null, role: currentRole as Role },
      });
      return NextResponse.json(result);
    }

    if (payload.action === 'approve_duration_override') {
      if (currentRole !== 'ADMIN') {
        return NextResponse.json({ error: 'Only admin can approve 4-hour vendor days' }, { status: 403 });
      }
      const updated = await prisma.vendorDayRequest.update({
        where: { id: payload.requestId },
        data: {
          approvedAt: new Date(),
          approvedByClerkUserId: ctx.userId,
          status: VendorDayRequestStatus.READY_FOR_DISPATCH,
        },
      });
      await appendAuditEvent({
        orgId: ctx.orgId,
        actorClerkUserId: ctx.userId,
        actorEmail: ctx.email ?? null,
        action: 'vendor_day.request.duration_override_approved',
        entityType: 'VendorDayRequest',
        entityId: updated.id,
      });
      return NextResponse.json(updated);
    }

    if (payload.action === 'approve_rep_request') {
      if (!['ADMIN', 'OPS_TEAM', 'SALES_REP'].includes(currentRole)) {
        return NextResponse.json({ error: 'Only reps, ops, or admin can approve vendor-day requests' }, { status: 403 });
      }
      const current = await prisma.vendorDayRequest.findFirst({
        where: { id: payload.requestId, orgId: ctx.orgId },
        select: {
          id: true,
          requiresAdminApproval: true,
          approvedAt: true,
        },
      });
      if (!current) {
        return NextResponse.json({ error: 'Vendor-day request not found' }, { status: 404 });
      }
      const updated = await prisma.vendorDayRequest.update({
        where: { id: payload.requestId },
        data: {
          repApprovedAt: new Date(),
          repApprovedByClerkUserId: ctx.userId,
          status: current.requiresAdminApproval && !current.approvedAt ? VendorDayRequestStatus.REQUESTED : VendorDayRequestStatus.READY_FOR_DISPATCH,
        },
      });
      await appendAuditEvent({
        orgId: ctx.orgId,
        actorClerkUserId: ctx.userId,
        actorEmail: ctx.email ?? null,
        action: 'vendor_day.request.rep_approved',
        entityType: 'VendorDayRequest',
        entityId: updated.id,
      });
      return NextResponse.json(updated);
    }

    if (payload.action === 'mark_no_show') {
      if (!['ADMIN', 'OPS_TEAM'].includes(currentRole)) {
        return NextResponse.json({ error: 'Only admin or ops can mark a no-show' }, { status: 403 });
      }
      const updated = await prisma.vendorDayRequest.update({
        where: { id: payload.requestId },
        data: { status: VendorDayRequestStatus.NO_SHOW },
      });
      await appendAuditEvent({
        orgId: ctx.orgId,
        actorClerkUserId: ctx.userId,
        actorEmail: ctx.email ?? null,
        action: 'vendor_day.request.no_show_marked',
        entityType: 'VendorDayRequest',
        entityId: updated.id,
      });
      return NextResponse.json(updated);
    }

    if (payload.action === 'respond_offer') {
      const result = await respondToVendorDayOffer({
        orgId: ctx.orgId,
        offerId: payload.offerId,
        decision: payload.decision,
        actor: {
          userId: ctx.userId,
          email: ctx.email ?? '',
          role: currentRole as Role,
        },
      });
      return NextResponse.json(result);
    }

    if (payload.action === 'pass_off') {
      const result = await passOffAssignment({
        orgId: ctx.orgId,
        assignmentId: payload.assignmentId,
        reason: payload.reason,
        actor: {
          userId: ctx.userId,
          email: ctx.email ?? '',
        },
      });
      return NextResponse.json(result);
    }

    if (payload.action === 'add_artifact') {
      const artifact = await upsertExecutionArtifact({
        orgId: ctx.orgId,
        assignmentId: payload.assignmentId,
        type: payload.type,
        storageUrl: payload.storageUrl,
        originalName: payload.originalName,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        syncStatus: payload.syncStatus,
      });
      return NextResponse.json(artifact);
    }

    if (payload.action === 'check_in') {
      const execution = await checkInVendorDay({
        orgId: ctx.orgId,
        assignmentId: payload.assignmentId,
        actor: { userId: ctx.userId, email: ctx.email ?? '' },
        geoLat: payload.geoLat,
        geoLng: payload.geoLng,
        accuracyMeters: payload.accuracyMeters,
        locationUnavailable: payload.locationUnavailable,
        distanceFlagged: payload.distanceFlagged,
        notes: payload.notes,
      });
      return NextResponse.json(execution);
    }

    if (payload.action === 'check_out') {
      const execution = await checkOutVendorDay({
        orgId: ctx.orgId,
        assignmentId: payload.assignmentId,
        actor: { userId: ctx.userId, email: ctx.email ?? '' },
        geoLat: payload.geoLat,
        geoLng: payload.geoLng,
        accuracyMeters: payload.accuracyMeters,
        locationUnavailable: payload.locationUnavailable,
        distanceFlagged: payload.distanceFlagged,
        pendingArtifactSync: payload.pendingArtifactSync,
        pennyBundleStatus: payload.pennyBundleStatus,
        trafficLevel: payload.trafficLevel,
        budtenderEngagementScore: payload.budtenderEngagementScore,
        checkOutNotes: payload.checkOutNotes,
        restockNeeded: payload.restockNeeded,
        objections: payload.objections,
        bestConversation: payload.bestConversation,
      });
      return NextResponse.json(execution);
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to update vendor-day workflow',
      zodMessage: 'Invalid vendor-day action payload',
      statusByMessage: {
        'Offer not found': 404,
        'Offer is no longer open': 409,
        'Pass-off window has closed': 409,
        'Penny Bundle proof is required before checkout': 409,
        'Request requires admin approval before dispatch': 409,
      },
    });
  }
}
