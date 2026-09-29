import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_BYPASS_MODE, AUTH_CONFIGURATION_MESSAGE, PRODUCTION_AUTH_MISCONFIGURED } from '@/lib/config/runtime';

const isProtectedRoute = createRouteMatcher([
  '/home(.*)',
  '/dashboard(.*)',
  '/territory(.*)',
  '/accounts(.*)',
  '/contacts(.*)',
  '/route(.*)',
  '/calendar(.*)',
  '/settings(.*)',
  '/tasks(.*)',
  '/api/(.*)',
]);
const isApiRoute = createRouteMatcher(['/api/(.*)']);
const isAuthEntryRoute = createRouteMatcher(['/', '/sign-in(.*)', '/sso-callback(.*)']);
const isCronSyncRoute = createRouteMatcher(['/api/cron/notion-sync', '/api/cron/nabis-sync', '/api/cron/daily-briefing']);
const isPublicWebhookRoute = createRouteMatcher(['/api/webhooks/notion']);
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const secretKey = process.env.CLERK_SECRET_KEY ?? '';
const isLiveClerkConfig = publishableKey.startsWith('pk_live_') && secretKey.startsWith('sk_live_');
const hasTestClerkConfig = publishableKey.startsWith('pk_test_') && secretKey.startsWith('sk_test_');
const canUseClerk = Boolean(publishableKey && secretKey);

const protectedMiddleware =
  !PRODUCTION_AUTH_MISCONFIGURED && canUseClerk && (hasTestClerkConfig || isLiveClerkConfig)
    ? (() => {
        try {
          return clerkMiddleware(async (auth, req) => {
            if (isCronSyncRoute(req)) {
              return;
            }

            if (isPublicWebhookRoute(req)) {
              return;
            }

            if (isProtectedRoute(req)) {
              await auth.protect();
            }
          });
        } catch (error) {
          console.error('Failed to initialize Clerk middleware:', error);
          return null;
        }
      })()
    : null;

function fallbackBypassMiddleware(req: NextRequest) {
  if (AUTH_BYPASS_MODE) {
    return NextResponse.next();
  }

  if (isCronSyncRoute(req)) {
    return NextResponse.next();
  }

  if (isPublicWebhookRoute(req)) {
    return NextResponse.next();
  }

  if (isApiRoute(req)) {
    return NextResponse.json(
      {
        error: AUTH_CONFIGURATION_MESSAGE,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  if (isProtectedRoute(req) || isAuthEntryRoute(req)) {
    return new NextResponse(AUTH_CONFIGURATION_MESSAGE, {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.next();
}

export default protectedMiddleware && !AUTH_BYPASS_MODE ? protectedMiddleware : fallbackBypassMiddleware;

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
