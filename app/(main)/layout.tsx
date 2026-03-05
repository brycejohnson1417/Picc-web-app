import { auth, currentUser } from '@clerk/nextjs/server';
import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui';
import { ensureWorkspaceAndMembership } from '@/lib/auth/bootstrap';
import { DEMO_MODE, DEMO_ORG_ID, DEMO_USER_ID } from '@/lib/config/runtime';
import { prisma } from '@/lib/db/prisma';
import { resolveWorkspaceKey } from '@/lib/auth/workspace-key';

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

  if (DEMO_MODE) {
    await ensureDemoWorkspace();
    return <AppShell>{children}</AppShell>;
  }

  const { userId, orgId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser().catch(() => null);
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
  const workspaceKey = resolveWorkspaceKey({ authOrgId: orgId, userId, email });
  await ensureWorkspaceAndMembership(workspaceKey, userId);

  return <AppShell>{children}</AppShell>;
}

function getMissingEnv() {
  const required = DEMO_MODE
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
      source: 'DEMO_MODE',
      active: true,
    },
  });
}
