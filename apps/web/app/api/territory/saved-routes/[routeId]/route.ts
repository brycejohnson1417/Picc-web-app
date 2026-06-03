import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { deleteSavedRouteForUser } from '@/lib/server/territory-saved-routes';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ routeId: string }> }) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
  }

  const { routeId } = await context.params;
  const deleted = await deleteSavedRouteForUser({
    orgId: access.orgId,
    routeId,
    userId: access.userId,
    email: access.email,
  });

  if (!deleted) {
    return NextResponse.json({ error: 'Saved route not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
