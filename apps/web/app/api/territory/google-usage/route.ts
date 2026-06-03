import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { getGoogleUsageSummary } from '@/lib/server/google-usage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const summary = await getGoogleUsageSummary({ forceFresh: true });
    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read Google usage summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
