import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { recordTerritoryStoreCheckIn } from '@/lib/server/notion-territory';

const requestSchema = z.object({
  storeId: z.string().min(1),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const payload = requestSchema.parse(await request.json());
    const result = await recordTerritoryStoreCheckIn(payload.storeId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid check-in payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Check-in failed';
    const status = message === 'Store not found' ? 404 : message.includes('No check-in date property') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
