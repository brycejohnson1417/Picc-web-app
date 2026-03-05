import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { DEMO_MODE } from '@/lib/config/runtime';

const isProtectedRoute = createRouteMatcher(['/(main)(.*)', '/api/(.*)']);
const isCronSyncRoute = createRouteMatcher(['/api/cron/notion-sync']);
const hasClerkEnv = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const protectedMiddleware = clerkMiddleware(async (auth, req) => {
  if (isCronSyncRoute(req)) {
    return;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default hasClerkEnv
  ? DEMO_MODE
    ? function demoBypassMiddleware() {
        return NextResponse.next();
      }
    : protectedMiddleware
  : function bypassMiddleware(req: NextRequest) {
      if (isCronSyncRoute(req)) {
        return NextResponse.next();
      }
      if (req.url.includes('/api/')) {
        return NextResponse.json(
          {
            error: 'Auth environment not configured',
          },
          { status: 503 },
        );
      }
      return NextResponse.next();
    };

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
