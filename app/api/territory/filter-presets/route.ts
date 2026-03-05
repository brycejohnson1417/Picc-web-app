import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { listTerritoryFilterPresets, upsertTerritoryFilterPreset } from '@/lib/server/territory-read-model';

const presetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  search: z.string().max(256).default(''),
  selectedStatuses: z.array(z.string().trim().min(1)).max(25).default([]),
  selectedReps: z.array(z.string().trim().min(1)).max(25).default([]),
  showRouteOnly: z.boolean().default(false),
  pinColorMode: z.enum(['status', 'rep']).default('status'),
});

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const presets = await listTerritoryFilterPresets(access.email, { orgId: access.orgId });
    return NextResponse.json({ presets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load filter presets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const parsed = presetSchema.parse(await request.json());
    const preset = await upsertTerritoryFilterPreset(access.email, parsed, { orgId: access.orgId });
    return NextResponse.json({ preset });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid filter preset payload', details: error.issues }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to save filter preset';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
