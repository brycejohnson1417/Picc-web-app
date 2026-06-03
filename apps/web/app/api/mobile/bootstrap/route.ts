import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { evaluateUserAccess } from '@/lib/auth/access-policy';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { getSharedWorkspaceId } from '@/lib/auth/access-policy';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (AUTH_BYPASS_MODE) {
    return NextResponse.json({
      app: {
        name: 'piccnewyork.org',
        version: '0.1.0',
        minSupportedVersion: '0.1.0',
      },
      session: {
        authenticated: true,
        userId: DEMO_USER_ID,
        orgId: process.env.TERRITORY_ORG_ID ?? DEMO_ORG_ID,
      },
      api: {
        territoryStores: '/api/territory/stores',
        checkIn: '/api/territory/check-in',
        accountContacts: '/api/territory/account-contacts',
        optimizeRoute: '/api/territory/optimize-route',
        filterPresets: '/api/territory/filter-presets',
      },
      features: {
        filterPresets: true,
        offlineQueue: true,
        routeOptimization: true,
      },
      generatedAt: new Date().toISOString(),
    });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { orgId } = await auth();
  const workspaceKey = access.workspaceOrgId ?? orgId ?? getSharedWorkspaceId();
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, {
    email: access.email!,
    accessType: access.accessType ?? 'workspace',
    workspaceOrgId: access.workspaceOrgId,
    invitedRole: access.invitedRole as never,
  });

  return NextResponse.json({
    app: {
      name: 'piccnewyork.org',
      version: '0.1.0',
      minSupportedVersion: '0.1.0',
    },
    session: {
      authenticated: true,
      userId,
      orgId: workspaceOrgId,
    },
    api: {
      territoryStores: '/api/territory/stores',
      checkIn: '/api/territory/check-in',
      accountContacts: '/api/territory/account-contacts',
      optimizeRoute: '/api/territory/optimize-route',
      filterPresets: '/api/territory/filter-presets',
    },
    features: {
      filterPresets: true,
      offlineQueue: true,
      routeOptimization: true,
    },
    generatedAt: new Date().toISOString(),
  });
}
