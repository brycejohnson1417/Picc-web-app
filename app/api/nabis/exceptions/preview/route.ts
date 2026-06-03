import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { buildNabisExceptionPreview, getNabisExceptionPreviewContext } from '@/lib/server/nabis-exceptions';

const sampleLineSchema = z.object({
  sku: z.string().trim().min(1).max(120),
  productName: z.string().trim().min(1).max(240),
  quantity: z.coerce.number().int().min(1).max(999),
  reason: z.string().trim().min(1).max(240),
  notes: z.string().trim().max(500).optional().nullable(),
});

const previewRequestSchema = z
  .object({
    retailerId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    sampleLines: z.array(sampleLineSchema).max(24).default([]),
    discrepancyNotes: z.array(z.string().trim().min(1).max(1000)).max(24).default([]),
  })
  .refine((payload) => payload.sampleLines.length > 0 || payload.discrepancyNotes.length > 0, {
    message: 'Add at least one sample SKU or discrepancy note.',
    path: ['sampleLines'],
  });

export async function POST(request: NextRequest) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const body = await request.json().catch(() => null);
  const parsed = previewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid Nabis exception request',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const context = await getNabisExceptionPreviewContext(ctx.orgId, parsed.data.retailerId, parsed.data.orderId);
  if (!context) {
    return NextResponse.json({ error: 'Selected retailer/order context was not found in cached Nabis data.' }, { status: 404 });
  }

  const preview = buildNabisExceptionPreview({
    retailer: context.retailer,
    order: context.order,
    sampleLines: parsed.data.sampleLines,
    discrepancyNotes: parsed.data.discrepancyNotes,
    requestedBy: ctx.email,
  });

  return NextResponse.json({ preview });
}
