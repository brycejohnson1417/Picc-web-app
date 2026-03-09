import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';
import { AUTH_BYPASS_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (AUTH_BYPASS_MODE) {
    return NextResponse.json({
      app: {
        name: 'PICC Field',
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
        territoryLayers: '/api/territory/layers',
      },
      features: {
        mapLayers: true,
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
  const allowlist = parseEmailAllowlist(process.env.TERRITORY_ALLOWED_EMAILS);
  if (allowlist.entries.length === 0) {
    return NextResponse.json({ error: 'TERRITORY_ALLOWED_EMAILS is not configured' }, { status: 503 });
  }
  if (!isEmailAllowed(email, allowlist)) {
    return NextResponse.json({ error: 'Access denied for this user' }, { status: 403 });
  }

  return NextResponse.json({
    app: {
      name: 'PICC Field',
      version: '0.1.0',
      minSupportedVersion: '0.1.0',
    },
    session: {
      authenticated: true,
      userId,
      orgId: process.env.TERRITORY_ORG_ID ?? null,
    },
    api: {
      territoryStores: '/api/territory/stores',
      checkIn: '/api/territory/check-in',
      accountContacts: '/api/territory/account-contacts',
      optimizeRoute: '/api/territory/optimize-route',
      filterPresets: '/api/territory/filter-presets',
      territoryLayers: '/api/territory/layers',
    },
    features: {
      mapLayers: true,
      filterPresets: true,
      offlineQueue: true,
      routeOptimization: true,
    },
    generatedAt: new Date().toISOString(),
  });
}
