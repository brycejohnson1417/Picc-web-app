import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { resolveNabisDashboardOrgId } from '@/lib/dashboard/nabis-org';
import { ensureDateRange, getDashboardPayload } from '@/lib/dashboard/nabis-server';
import { getUserRole } from '@/lib/rbac/guards';

export const dynamic = 'force-dynamic';

const DASHBOARD_RESPONSE_CACHE_TTL_MS = 1000 * 60;

type DashboardCacheEntry = {
  expiresAt: number;
  payload: Awaited<ReturnType<typeof getDashboardPayload>>;
};

const dashboardResponseCache = new Map<string, DashboardCacheEntry>();

function responseHeaders(forceRefresh: boolean) {
  return {
    'Cache-Control': forceRefresh ? 'private, no-store, max-age=0, must-revalidate' : 'private, max-age=30, stale-while-revalidate=120',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(forceRefresh ? { Pragma: 'no-cache' } : {}),
  };
}

function cacheKey(orgId: string, start: string, end: string) {
  return `${orgId}::${start}::${end}`;
}

function readDashboardCache(key: string) {
  const cached = dashboardResponseCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    dashboardResponseCache.delete(key);
    return null;
  }

  return cached.payload;
}

export async function GET(request: Request) {
  const ctx = await guard();
  if ('error' in ctx) {
    return ctx.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const { start, end } = ensureDateRange({
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });
    const forceRefresh = searchParams.get('refresh') === '1';
    const dataOrgId = resolveNabisDashboardOrgId();
    const key = cacheKey(dataOrgId, start, end);

    if (forceRefresh) {
      const role = await getUserRole(ctx.orgId, ctx.userId);
      if (!['ADMIN', 'OPS_TEAM', 'FINANCE'].includes(role)) {
        return NextResponse.json(
          { error: 'Only admin, ops, or finance can trigger a Nabis refresh.' },
          {
            status: 403,
            headers: responseHeaders(true),
          },
        );
      }
    }

    if (!forceRefresh) {
      const cached = readDashboardCache(key);
      if (cached) {
        return NextResponse.json(cached, { headers: responseHeaders(false) });
      }
    }

    const payload = await getDashboardPayload({
      orgId: dataOrgId,
      start,
      end,
      forceRefresh,
      actor: {
        clerkUserId: ctx.userId,
        email: ctx.email,
      },
    });

    if (!forceRefresh) {
      dashboardResponseCache.set(key, {
        expiresAt: Date.now() + DASHBOARD_RESPONSE_CACHE_TTL_MS,
        payload,
      });
    }

    return NextResponse.json(payload, { headers: responseHeaders(forceRefresh) });
  } catch (error) {
    const statusCode = Number((error as Error & { statusCode?: number })?.statusCode || 500);
    const publicMessage =
      statusCode >= 500
        ? 'Unable to load cached Nabis dashboard data right now.'
        : error instanceof Error
          ? error.message
          : 'Request failed.';

    console.error('[picc-nabis-dashboard]', error);
    return NextResponse.json(
      { error: publicMessage },
      {
        status: statusCode,
        headers: responseHeaders(true),
      },
    );
  }
}
