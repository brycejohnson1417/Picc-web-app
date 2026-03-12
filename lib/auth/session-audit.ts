import 'server-only';

import { prisma } from '@/lib/db/prisma';

interface RecordAppSessionInput {
  orgId: string;
  clerkUserId: string;
  sessionId: string | null | undefined;
  email?: string | null;
  displayName?: string | null;
}

export async function recordAppSession(input: RecordAppSessionInput) {
  if (!input.sessionId) {
    return;
  }

  await prisma.appSessionAudit.upsert({
    where: { sessionId: input.sessionId },
    update: {
      lastSeenAt: new Date(),
      email: input.email ?? undefined,
      displayName: input.displayName ?? undefined,
    },
    create: {
      orgId: input.orgId,
      clerkUserId: input.clerkUserId,
      sessionId: input.sessionId,
      email: input.email ?? null,
      displayName: input.displayName ?? null,
    },
  });
}
