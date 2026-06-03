import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadLiveNotionContactsForAccount } from '@/lib/server/notion-live-crm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const storePageId = searchParams.get('storePageId')?.trim();

  if (!storePageId) {
    return NextResponse.json({ error: 'storePageId is required' }, { status: 400 });
  }

  try {
    const contacts = await loadLiveNotionContactsForAccount(storePageId);
    return NextResponse.json({ contacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load associated contacts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
