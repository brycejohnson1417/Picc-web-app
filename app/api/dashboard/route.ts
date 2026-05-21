import { after, NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { withBackgroundManualRefreshStarted } from '@/lib/dashboard/nabis-refresh';
import { resolveNabisDashboardOrgId } from '@/lib/dashboard/nabis-org';
import { ensureDateRange, getDashboardPayload } from '@/lib/dashboard/nabis-server';
import type { NabisDashboardResponse } from '@/lib/dashboard/nabis-types';
import { getUserRole } from '@/lib/rbac/guards';
import { NabisSyncLeaseError, syncNabisRetailersAndOrders } from '@/lib/server/nabis-sync';
import { nabisDashboardRefreshSyncOptions } from '@/lib/server/nabis-sync-options';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DASHBOARD_RESPONSE_CACHE_TTL_MS = 1000 * 60;

type DashboardCacheEntry = {
  expiresAt: number;
  payload: NabisDashboardResponse;
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
    let manualRefreshStartedAt: string | null = null;

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

      manualRefreshStartedAt = new Date().toISOString();
      const actor = {
        clerkUserId: ctx.userId,
        email: ctx.email,
      };

      after(async () => {
        try {
          await syncNabisRetailersAndOrders(dataOrgId, actor, nabisDashboardRefreshSyncOptions());
        } catch (error) {
          if (error instanceof NabisSyncLeaseError) {
            console.info('[picc-nabis-dashboard-refresh]', {
              status: 'already-running',
              active: error.decision,
            });
            return;
          }

          console.error('[picc-nabis-dashboard-refresh]', error);
        }
      });
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
      forceRefresh: false,
      actor: {
        clerkUserId: ctx.userId,
        email: ctx.email,
      },
    });
    const responsePayload =
      forceRefresh && manualRefreshStartedAt ? withBackgroundManualRefreshStarted(payload, manualRefreshStartedAt) : payload;

    if (!forceRefresh) {
      dashboardResponseCache.set(key, {
        expiresAt: Date.now() + DASHBOARD_RESPONSE_CACHE_TTL_MS,
        payload: responsePayload,
      });
    }

    return NextResponse.json(responsePayload, { headers: responseHeaders(forceRefresh) });
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
