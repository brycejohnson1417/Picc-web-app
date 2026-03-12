import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_BYPASS_MODE } from '@/lib/config/runtime';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/territory(.*)',
  '/accounts(.*)',
  '/contacts(.*)',
  '/route(.*)',
  '/calendar(.*)',
  '/settings(.*)',
  '/reports(.*)',
  '/tasks(.*)',
  '/vendor-days(.*)',
  '/api/(.*)',
]);
const isApiRoute = createRouteMatcher(['/api/(.*)']);
const isCronSyncRoute = createRouteMatcher(['/api/cron/notion-sync']);
const isPublicWebhookRoute = createRouteMatcher(['/api/webhooks/notion']);
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const secretKey = process.env.CLERK_SECRET_KEY ?? '';
const isProduction = process.env.NODE_ENV === 'production';
const isLiveClerkConfig = publishableKey.startsWith('pk_live_') && secretKey.startsWith('sk_live_');
const hasTestClerkConfig = publishableKey.startsWith('pk_test_') && secretKey.startsWith('sk_test_');
const canUseClerk = Boolean(publishableKey && secretKey);
const shouldSkipProtect = AUTH_BYPASS_MODE || (isProduction && hasTestClerkConfig);

const protectedMiddleware =
  canUseClerk && (hasTestClerkConfig || isLiveClerkConfig)
    ? (() => {
        try {
          return clerkMiddleware(async (auth, req) => {
            if (isCronSyncRoute(req)) {
              return;
            }

            if (isPublicWebhookRoute(req)) {
              return;
            }

            if (shouldSkipProtect && isApiRoute(req)) {
              return;
            }

            if (shouldSkipProtect) {
              return;
            }

            if (isProtectedRoute(req)) {
              await auth.protect();
            }
          });
        } catch (error) {
          console.error('Failed to initialize Clerk middleware, bypassing auth in middleware:', error);
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

  if (req.url.includes('/api/')) {
    return NextResponse.json(
      {
        error: 'Auth environment not configured for production.',
      },
      {
        status: 503,
      },
    );
  }

  return NextResponse.next();
}

export default protectedMiddleware && !AUTH_BYPASS_MODE ? protectedMiddleware : fallbackBypassMiddleware;

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
