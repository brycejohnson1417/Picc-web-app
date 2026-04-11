import 'server-only';

import { prisma } from '@/lib/db/prisma';

interface RecordAppSessionInput {
  orgId: string;
  clerkUserId: string;
  sessionId: string | null | undefined;
  email?: string | null;
  displayName?: string | null;
}

const SESSION_TOUCH_THROTTLE_MS = 1000 * 60 * 30;

type SessionTouchState = {
  lastTouchedAt: number;
  email: string | null;
  displayName: string | null;
  orgId: string;
  clerkUserId: string;
};

const recentSessionTouches = new Map<string, SessionTouchState>();
const inFlightSessionWrites = new Map<string, Promise<void>>();

export async function recordAppSession(input: RecordAppSessionInput) {
  const sessionId = input.sessionId;
  if (!sessionId) {
    return;
  }

  const email = input.email ?? null;
  const displayName = input.displayName ?? null;
  const currentState = recentSessionTouches.get(sessionId);
  const now = Date.now();

  if (
    currentState &&
    currentState.email === email &&
    currentState.displayName === displayName &&
    currentState.orgId === input.orgId &&
    currentState.clerkUserId === input.clerkUserId &&
    now - currentState.lastTouchedAt < SESSION_TOUCH_THROTTLE_MS
  ) {
    return;
  }

  const inFlight = inFlightSessionWrites.get(sessionId);
  if (inFlight) {
    return inFlight;
  }

  const write = prisma.appSessionAudit
    .upsert({
      where: { sessionId },
      update: {
        lastSeenAt: new Date(),
        email,
        displayName,
        orgId: input.orgId,
        clerkUserId: input.clerkUserId,
      },
      create: {
        orgId: input.orgId,
        clerkUserId: input.clerkUserId,
        sessionId,
        email,
        displayName,
      },
    })
    .then(() => {
      recentSessionTouches.set(sessionId, {
        lastTouchedAt: Date.now(),
        email,
        displayName,
        orgId: input.orgId,
        clerkUserId: input.clerkUserId,
      });
    })
    .finally(() => {
      inFlightSessionWrites.delete(sessionId);
    });

  inFlightSessionWrites.set(sessionId, write);
  return write;
}
