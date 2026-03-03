import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();

  return NextResponse.json({
    app: {
      name: 'PICC Field',
      version: '0.1.0',
      minSupportedVersion: '0.1.0',
    },
    session: {
      authenticated: Boolean(userId),
      userId: userId ?? null,
      orgId: process.env.TERRITORY_ORG_ID ?? 'org_picc_demo',
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
