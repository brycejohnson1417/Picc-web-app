import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryStoreCheckIns } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { storeId } = await context.params;

  try {
    const checkIns = await loadTerritoryStoreCheckIns(storeId);
    return NextResponse.json({ checkIns });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load check-ins';
    return NextResponse.json({ error: message }, { status: message === 'Store not found' ? 404 : 500 });
  }
}
