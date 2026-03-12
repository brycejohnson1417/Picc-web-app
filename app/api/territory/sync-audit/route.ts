import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { getTerritorySyncAudit } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) {
    return access.error;
  }

  try {
    const payload = await getTerritorySyncAudit();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync audit failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
