import { auth, currentUser } from '@clerk/nextjs/server';
import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui';
import { evaluateUserAccess, getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { recordAppSession } from '@/lib/auth/session-audit';
import { AUTH_BYPASS_MODE, DEMO_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';
import { prisma } from '@/lib/db/prisma';
import { getUserRole, getUserRoles } from '@/lib/rbac/guards';
import { AppRoles, type AppRole } from '@/lib/types/rbac';

export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const missing = getMissingEnv();

  if (missing.length > 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-2xl space-y-4 rounded-xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-bold">Setup Required</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This deployment is missing required environment variables. Add them in Vercel Project Settings, then redeploy.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {missing.map((name) => (
              <li key={name} className="font-mono">
                {name}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button asChild>
              <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">
                Open Vercel Dashboard
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (AUTH_BYPASS_MODE) {
    await ensureDemoWorkspace();
    return (
      <AppShell
      access={{
        role: AppRoles.ADMIN,
        availableRoles: [AppRoles.ADMIN],
        testModeEnabled: false,
        isAdmin: true,
        isGuestViewer: false,
          canEdit: true,
        }}
      >
        {children}
      </AppShell>
    );
  }

  const { userId, orgId, sessionId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '';
  const access = await evaluateUserAccess(email);
  if (!access.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-2xl space-y-4 rounded-xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{access.error}</p>
        </div>
      </div>
    );
  }

  const workspaceKey = access.workspaceOrgId ?? orgId ?? getSharedWorkspaceId();
  const workspaceOrgId = await ensureWorkspaceAndMembership(workspaceKey, userId, {
    email: access.email!,
    accessType: access.accessType ?? 'workspace',
    workspaceOrgId: access.workspaceOrgId,
    invitedRole: access.invitedRole as Role | undefined,
  });
  await recordAppSession({
    orgId: workspaceOrgId,
    clerkUserId: userId,
    sessionId,
    email: access.email,
    displayName: user?.fullName ?? user?.firstName ?? access.email,
  });

  const membership = await prisma.membership.findUnique({
    where: {
      orgId_clerkUserId: {
        orgId: workspaceOrgId,
        clerkUserId: userId,
      },
    },
    select: {
      testModeEnabled: true,
    },
  });

  const [role, availableRoles] = await Promise.all([
    getUserRole(workspaceOrgId, userId).catch(() => AppRoles.SALES_REP as AppRole),
    getUserRoles(workspaceOrgId, userId).catch(() => [AppRoles.SALES_REP] as AppRole[]),
  ]);
  const isGuestViewer = role === AppRoles.GUEST_VIEWER;

  return (
    <AppShell
      access={{
        role,
        availableRoles,
        testModeEnabled: Boolean(membership?.testModeEnabled),
        isAdmin: role === AppRoles.ADMIN,
        isGuestViewer,
        canEdit: !isGuestViewer,
      }}
    >
      {children}
    </AppShell>
  );
}

function getMissingEnv() {
  const required = AUTH_BYPASS_MODE
    ? (['DATABASE_URL'] as const)
    : (['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY', 'DATABASE_URL'] as const);
  return required.filter((key) => !process.env[key]);
}

async function ensureDemoWorkspace() {
  await prisma.organizationWorkspace.upsert({
    where: { id: DEMO_ORG_ID },
    update: {},
    create: {
      id: DEMO_ORG_ID,
      clerkOrgId: DEMO_ORG_ID,
      name: 'PICC Demo Workspace',
    },
  });

  await prisma.membership.upsert({
    where: {
      orgId_clerkUserId: {
        orgId: DEMO_ORG_ID,
        clerkUserId: DEMO_USER_ID,
      },
    },
    update: { active: true, role: Role.ADMIN },
    create: {
      orgId: DEMO_ORG_ID,
      clerkUserId: DEMO_USER_ID,
      role: Role.ADMIN,
      source: DEMO_MODE ? 'DEMO_MODE' : 'AUTH_BYPASS_MODE',
      active: true,
    },
  });
}
